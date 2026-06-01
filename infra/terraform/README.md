# Terraform Core Infrastructure

This is the production-shaped artifact for the Engineer 004 submission. It defines the durable ingestion core and serving primitives for the proposed AWS real-time analytics pipeline.

It intentionally covers the core data path, not every company-specific network or deployment detail:

- Kinesis Data Stream for accepted events.
- Registered enhanced-fan-out consumer for the low-latency ECS/KCL 3.x path.
- Firehose delivery stream from Kinesis to encrypted S3 raw storage.
- S3 bucket with server-side encryption, versioning, public-access blocks, and lifecycle rules.
- S3 bucket policy denying non-TLS requests and bucket-owner-enforced object ownership.
- Customer-managed KMS key with automatic rotation for the stream and raw event lake.
- SQS DLQ for poison events.
- DynamoDB aggregate table for low-latency dashboard counters.
- DynamoDB processed-event ledger with TTL for transactional aggregate dedupe.
- DynamoDB deletion ledger for GDPR/CCPA workflow state.
- CloudWatch alarms for Kinesis write throttling, iterator age, Firehose delivery failures, and DLQ depth.

Assumptions:

- Existing VPC, ECS cluster, ALB, Redis, PostgreSQL/RDS, and CI/CD are owned elsewhere.
- Ingest and consumer services would be separate ECS services using these outputs.
- Configure the KCL application name with the `${name_prefix}-${environment}-kcl-` prefix so its lease, worker-metrics, and coordinator-state DynamoDB tables match the scoped IAM policy.
- Region/account-specific tagging and provider backend should be added by the deploying team.

Example:

```bash
terraform init
terraform plan \
  -var='environment=staging' \
  -var='raw_bucket_name=sg-analytics-raw-staging-example' \
  -var='kinesis_shard_count=24'
```

This folder should be reviewed as an infrastructure design artifact unless valid AWS credentials and a backend are configured.
