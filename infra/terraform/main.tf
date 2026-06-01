terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name = "${var.name_prefix}-${var.environment}"
  tags = merge(
    {
      Application = "realtime-analytics"
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

resource "aws_kms_key" "analytics" {
  description             = "Encrypt real-time analytics stream and raw event lake."
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "analytics" {
  name          = "alias/${local.name}-analytics"
  target_key_id = aws_kms_key.analytics.key_id
}

resource "aws_kinesis_stream" "events" {
  name             = "${local.name}-events"
  shard_count      = var.kinesis_shard_count
  retention_period = var.kinesis_retention_hours
  shard_level_metrics = [
    "IncomingBytes",
    "IncomingRecords",
    "OutgoingBytes",
    "OutgoingRecords",
    "WriteProvisionedThroughputExceeded",
    "ReadProvisionedThroughputExceeded",
    "IteratorAgeMilliseconds"
  ]

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  encryption_type = "KMS"
  kms_key_id      = aws_kms_key.analytics.arn

  tags = local.tags
}

resource "aws_kinesis_stream_consumer" "realtime" {
  name       = "${local.name}-realtime-consumer"
  stream_arn = aws_kinesis_stream.events.arn
}

resource "aws_s3_bucket" "raw_events" {
  bucket = var.raw_bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "raw_events" {
  bucket                  = aws_s3_bucket.raw_events.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "raw_events_tls_only" {
  bucket = aws_s3_bucket.raw_events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.raw_events.arn,
          "${aws_s3_bucket.raw_events.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_versioning" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.analytics.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    id     = "tier-and-expire-raw-events"
    status = "Enabled"

    filter {
      prefix = "raw/"
    }

    transition {
      days          = var.raw_standard_retention_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = var.raw_expiration_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_sqs_queue" "event_dlq" {
  name                       = "${local.name}-event-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true
  tags                       = local.tags
}

resource "aws_dynamodb_table" "dashboard_aggregates" {
  name         = "${local.name}-dashboard-aggregates"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "processed_events" {
  name         = "${local.name}-processed-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_event_key"

  attribute {
    name = "tenant_event_key"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "deletion_ledger" {
  name         = "${local.name}-deletion-ledger"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_user_key"
  range_key    = "requested_at"

  attribute {
    name = "tenant_user_key"
    type = "S"
  }

  attribute {
    name = "requested_at"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

resource "aws_iam_role" "firehose" {
  name = "${local.name}-firehose-role"
  tags = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "firehose" {
  name              = "/aws/kinesisfirehose/${local.name}-raw-events"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_cloudwatch_log_stream" "firehose" {
  name           = "S3Delivery"
  log_group_name = aws_cloudwatch_log_group.firehose.name
}

resource "aws_iam_role_policy" "firehose" {
  name = "${local.name}-firehose-policy"
  role = aws_iam_role.firehose.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:DescribeStream",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards"
        ]
        Resource = aws_kinesis_stream.events.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.raw_events.arn,
          "${aws_s3_bucket.raw_events.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:PutLogEvents"
        ]
        Resource = aws_cloudwatch_log_stream.firehose.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.analytics.arn
      }
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "raw_events" {
  name        = "${local.name}-raw-events"
  destination = "extended_s3"
  tags        = local.tags

  kinesis_source_configuration {
    kinesis_stream_arn = aws_kinesis_stream.events.arn
    role_arn           = aws_iam_role.firehose.arn
  }

  extended_s3_configuration {
    role_arn            = aws_iam_role.firehose.arn
    bucket_arn          = aws_s3_bucket.raw_events.arn
    prefix              = "raw/tenant_bucket=!{partitionKeyFromQuery:tenant_bucket}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/"
    error_output_prefix = "firehose-errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"
    buffering_size      = 64
    buffering_interval  = 60
    compression_format  = "GZIP"

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose.name
      log_stream_name = aws_cloudwatch_log_stream.firehose.name
    }

    dynamic_partitioning_configuration {
      enabled = true
    }

    processing_configuration {
      enabled = true

      processors {
        type = "MetadataExtraction"

        parameters {
          parameter_name  = "MetadataExtractionQuery"
          parameter_value = "{tenant_bucket:.tenant_bucket}"
        }

        parameters {
          parameter_name  = "JsonParsingEngine"
          parameter_value = "JQ-1.6"
        }
      }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "kinesis_write_throttles" {
  alarm_name          = "${local.name}-kinesis-write-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "WriteProvisionedThroughputExceeded"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_actions       = var.alarm_actions
  dimensions = {
    StreamName = aws_kinesis_stream.events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "kinesis_iterator_age" {
  alarm_name          = "${local.name}-kinesis-iterator-age"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "GetRecords.IteratorAgeMilliseconds"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 5000
  alarm_actions       = var.alarm_actions
  dimensions = {
    StreamName = aws_kinesis_stream.events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "realtime_consumer_lag" {
  alarm_name          = "${local.name}-realtime-consumer-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "SubscribeToShardEvent.MillisBehindLatest"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 5000
  alarm_actions       = var.alarm_actions
  dimensions = {
    StreamName   = aws_kinesis_stream.events.name
    ConsumerName = aws_kinesis_stream_consumer.realtime.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "put_records_failed" {
  alarm_name          = "${local.name}-put-records-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "PutRecords.FailedRecords"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_actions       = var.alarm_actions
  dimensions = {
    StreamName = aws_kinesis_stream.events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "put_records_throttled" {
  alarm_name          = "${local.name}-put-records-throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "PutRecords.ThrottledRecords"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_actions       = var.alarm_actions
  dimensions = {
    StreamName = aws_kinesis_stream.events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "firehose_delivery_success_missing" {
  alarm_name          = "${local.name}-firehose-delivery-success-missing"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DeliveryToS3.Success"
  namespace           = "AWS/Firehose"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  dimensions = {
    DeliveryStreamName = aws_kinesis_firehose_delivery_stream.raw_events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "firehose_data_freshness" {
  alarm_name          = "${local.name}-firehose-data-freshness"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DeliveryToS3.DataFreshness"
  namespace           = "AWS/Firehose"
  period              = 60
  statistic           = "Maximum"
  threshold           = 180
  alarm_actions       = var.alarm_actions
  dimensions = {
    DeliveryStreamName = aws_kinesis_firehose_delivery_stream.raw_events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "firehose_partition_count_exceeded" {
  alarm_name          = "${local.name}-firehose-partition-count-exceeded"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "PartitionCountExceeded"
  namespace           = "AWS/Firehose"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_actions       = var.alarm_actions
  dimensions = {
    DeliveryStreamName = aws_kinesis_firehose_delivery_stream.raw_events.name
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  alarm_name          = "${local.name}-dlq-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_actions       = var.alarm_actions
  dimensions = {
    QueueName = aws_sqs_queue.event_dlq.name
  }
  tags = local.tags
}
