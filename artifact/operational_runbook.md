# Operational Runbook

## Scope

This runbook covers the real-time analytics ingestion core:

- Ingest API writes accepted events to Kinesis.
- Firehose stores raw events in S3.
- KCL 3.x enhanced-fan-out consumers update dashboard aggregates, Redis hot state, and DLQ.
- Rollout happens by tenant feature flag.

## Preflight

Before enabling a tenant on the new dashboard path:

- Terraform plan reviewed for Kinesis shard count, S3 retention, alarms, IAM policies, and DLQ.
- Ingest API dual-write enabled for the tenant.
- Consumer lag below 5 seconds for pilot traffic.
- Registered enhanced-fan-out consumer active for the low-latency path.
- S3 raw event partitions visible for the tenant.
- Firehose `PartitionCountExceeded` remains zero and bucketed raw prefixes are receiving data.
- Old-vs-new aggregate comparison running.
- Rollback flag tested for the tenant.

## Deployment Steps

1. Apply infrastructure changes in staging.
2. Run synthetic ingest test against staging.
3. Confirm Kinesis stream receives records.
4. Confirm Firehose writes raw compressed objects to S3.
5. Confirm consumer transaction writes the processed-event ledger and aggregate store.
6. Confirm DLQ receives intentionally invalid payloads.
7. Enable dual-write in production for internal tenant.
8. Shadow compare old and new aggregates.
9. Enable dashboard reads for pilot tenants.
10. Widen rollout only after release gates pass.

## Release Gates

- P95 dashboard freshness below 5 seconds for pilot tenants.
- No unexplained aggregate drift above 0.1% for 7 consecutive days.
- DLQ entries explainable by schema validation or intentionally rejected events.
- Kinesis write throttling is zero during expected peak windows.
- Rollback to old dashboard path tested in production for at least one pilot tenant.

## Incident: Kinesis Write Throttling

Symptoms:

- `WriteProvisionedThroughputExceeded` alarm fires.
- `PutRecords` returns partial failures.
- Ingest API retry count rises.
- Customer-visible event freshness degrades.

Immediate action:

1. Check whether traffic is global or tenant-specific.
2. If global, increase shard count.
3. If tenant-specific, enable salted partition key for that tenant.
4. Retry only failed `PutRecords` entries with jitter.
5. Keep accepting only after durable write; do not silently drop events.
6. Publish customer-facing impact only after confirming accepted-event durability.

## Incident: Consumer Lag

Symptoms:

- `SubscribeToShardEvent.MillisBehindLatest` exceeds 5 seconds for the real-time enhanced-fan-out consumer.
- `GetRecords.IteratorAgeMilliseconds` rises for shared readers such as Firehose.
- Dashboard freshness p95 exceeds target.

Immediate action:

1. Scale ECS consumer tasks.
2. Check downstream aggregate write latency.
3. Disable export jobs if they share any hot-path resource.
4. If lag keeps rising, keep ingest on but route dashboard reads back to old path for affected tenants.

## Incident: DLQ Spike

Symptoms:

- SQS DLQ depth alarm fires.
- Validation failures increase.

Immediate action:

1. Sample DLQ messages and group by reason.
2. If schema drift from SDK/custom events, add compatibility parser or allowlist.
3. If processor bug, pause the failing consumer deploy and replay from Kinesis after fix.
4. Do not replay poison messages until the reason is classified.

## Incident: Firehose Partition Pressure

Symptoms:

- `PartitionCountExceeded` is non-zero.
- Raw records appear under `firehose-errors/activePartitionExceeded`.
- `DeliveryToS3.DataFreshness` rises.

Immediate action:

1. Stop adding dynamic partition keys.
2. Confirm events contain bounded `tenant_bucket`, not raw `tenant_id`, in the S3 prefix.
3. Replay the error prefix after correcting the Firehose configuration.
4. Split across additional Firehose streams only if bounded buckets are still insufficient.

## Incident: Accuracy Drift

Symptoms:

- New pipeline aggregates differ from old pipeline above threshold.
- Reconciliation reports accepted-vs-processed mismatch.

Immediate action:

1. Stop widening rollout.
2. Keep dual-write enabled.
3. Compare raw event ids for affected tenant/time window.
4. Check dedupe keys, late-event windowing, identity stitching, and schema normalization.
5. Roll affected tenant dashboard reads back to old path.

## GDPR/CCPA Deletion

1. Write deletion request to deletion ledger.
2. Purge serving stores: Redis state, dashboard aggregates, identity graph.
3. Stop future personalization for the deleted identity.
4. Revoke pseudonymous subject-key resolution and mark matching raw lake records restricted by deletion ledger.
5. Run approved raw rewrite/delete workflow if prohibited PII reached raw storage or policy requires physical deletion.
6. Record completion status and operator approval.

Human approval is required for retention exceptions, raw lake physical deletion policy, and ambiguous identity matches.

## Decommissioning

When removing a KCL application, delete its lease, worker-metrics, and coordinator-state DynamoDB tables after confirming no replay or rollback path still depends on them.
