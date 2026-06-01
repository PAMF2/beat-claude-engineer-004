output "kinesis_stream_name" {
  value = aws_kinesis_stream.events.name
}

output "analytics_kms_key_arn" {
  value = aws_kms_key.analytics.arn
}

output "kinesis_stream_arn" {
  value = aws_kinesis_stream.events.arn
}

output "realtime_consumer_arn" {
  value = aws_kinesis_stream_consumer.realtime.arn
}

output "raw_events_bucket" {
  value = aws_s3_bucket.raw_events.bucket
}

output "firehose_delivery_stream_name" {
  value = aws_kinesis_firehose_delivery_stream.raw_events.name
}

output "event_dlq_url" {
  value = aws_sqs_queue.event_dlq.url
}

output "dashboard_aggregates_table" {
  value = aws_dynamodb_table.dashboard_aggregates.name
}

output "processed_events_table" {
  value = aws_dynamodb_table.processed_events.name
}

output "deletion_ledger_table" {
  value = aws_dynamodb_table.deletion_ledger.name
}

output "ingest_writer_policy_arn" {
  value = aws_iam_policy.ingest_writer.arn
}

output "consumer_worker_policy_arn" {
  value = aws_iam_policy.consumer_worker.arn
}
