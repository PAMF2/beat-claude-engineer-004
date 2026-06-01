resource "aws_iam_policy" "ingest_writer" {
  name        = "${local.name}-ingest-writer"
  description = "Allow ingest service to write accepted events to Kinesis."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.events.arn
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_policy" "consumer_worker" {
  name        = "${local.name}-consumer-worker"
  description = "Allow stream consumers to read events, update aggregate stores, and write poison events to DLQ."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:DescribeStreamConsumer",
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:ListShards",
          "kinesis:SubscribeToShard"
        ]
        Resource = [
          aws_kinesis_stream.events.arn,
          aws_kinesis_stream_consumer.realtime.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          aws_dynamodb_table.dashboard_aggregates.arn,
          aws_dynamodb_table.processed_events.arn,
          aws_dynamodb_table.deletion_ledger.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.event_dlq.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          "arn:aws:dynamodb:*:*:table/${local.name}-kcl-*",
          "arn:aws:dynamodb:*:*:table/${local.name}-kcl-*/index/*"
        ]
      }
    ]
  })

  tags = local.tags
}
