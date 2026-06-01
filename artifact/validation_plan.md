# Validation Plan

## Goals

- Prove accepted events are not silently lost.
- Prove duplicate delivery does not inflate dashboard metrics.
- Prove the DynamoDB processed-event condition and aggregate update are transactional.
- Prove hot dashboard aggregates stay fresh under normal and spike traffic.
- Prove migration can roll back by tenant without customer SDK changes.
- Prove the low-latency KCL consumer does not contend with Firehose reads.

## Counters

Track these by tenant, event type, and 1-minute window:

- `ingest_accepted`
- `kinesis_put_success`
- `kinesis_put_partial_failure`
- `consumer_processed`
- `consumer_duplicate`
- `consumer_late`
- `consumer_invalid`
- `dlq_written`
- `aggregate_write_success`
- `dashboard_freshness_p50_ms`
- `dashboard_freshness_p95_ms`
- `dashboard_freshness_p99_ms`
- `raw_schema_rejected_pii`
- `firehose_partition_count_exceeded`
- `firehose_delivery_to_s3_freshness`

## Reconciliation Queries

Daily:

- Compare accepted ingest counts against Kinesis consumer checkpoint progress.
- Confirm batched `PutRecords` retries only failed entries after partial success.
- Replay duplicate event ids and verify DynamoDB conditional transaction failures do not change aggregates.
- Compare S3 raw object counts against accepted event count after Firehose delivery delay.
- Compare old pipeline and new pipeline aggregates for tenants in shadow mode.
- Sample raw events and verify derived dashboard rows can be traced back to event ids.
- Sample raw events and verify the allowlisted raw schema contains pseudonymous subject keys, not direct PII.
- Confirm raw S3 prefixes use bounded `tenant_bucket`, not high-cardinality `tenant_id`.

Release gate:

- No unexplained tenant-level drift above 0.1% for 7 consecutive days.
- P95 dashboard freshness below 5 seconds for pilot tenants.
- DLQ entries explainable by schema or validation errors, not processor crashes.
- Rollback feature flag tested for each pilot tenant.

## Load Test

Use synthetic data with:

- 50M events/day baseline equivalent.
- 10x burst for 30 minutes.
- 2% duplicate retry traffic.
- 1% invalid payloads.
- 3% late client timestamps.
- At least one intentionally hot tenant.

The local `reconciliation_sim.js` script is not a throughput benchmark. It is a small executable proof of the counting contract: accepted, processed, duplicate, late, DLQ, and segment membership should reconcile.
