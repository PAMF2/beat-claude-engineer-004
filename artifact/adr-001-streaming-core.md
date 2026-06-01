# ADR 001: Streaming Core

## Decision

Use Amazon Kinesis Data Streams in provisioned mode as the durable ingestion log for accepted events. Use ECS consumers with KCL 3.x enhanced fan-out for real-time processing, Firehose/S3 for immutable raw storage, Redis for hot personalization state, and PostgreSQL only for metadata/configuration.

## Context

The brief requires AWS, no SDK breaking change, 50M events/day, 10x traffic spikes, sub-5-second dashboard freshness, 500+ tenants, and a 3-month MVP with 2 senior engineers.

## Options Considered

### Kinesis Data Streams + ECS/KCL

Pros:

- Native AWS service with replay, retention, shard-level metrics, and mature client libraries.
- Fits the current Python/Node/AWS stack.
- Easy to dual-write and shadow process during migration.
- Provisioned capacity is understandable for the brief's predictable baseline.
- Enhanced fan-out isolates the low-latency consumer from Firehose and future readers.

Cons:

- At-least-once semantics require idempotent consumers.
- Enhanced fan-out adds consumer-shard-hour and retrieval charges.
- Hot partition handling needs care for large tenants.
- Not a full SQL analytics engine.

### Managed Kafka/MSK

Pros:

- Strong ecosystem and flexible streaming patterns.
- Good fit if the company already runs Kafka.

Cons:

- More operational surface for a small team.
- Higher migration and tuning burden for a 3-month MVP.
- Not already present in the stated stack.

### Lambda-only Stream Processing

Pros:

- Fast to start and low operational overhead.

Cons:

- Harder to control complex stateful processing and cost at sustained volume.
- Less comfortable for replay/backfill workflows than long-running consumers.

### Direct Write to PostgreSQL or Redis

Pros:

- Familiar tools already in stack.

Cons:

- Wrong durability and replay boundary.
- Makes the serving store absorb ingestion spikes.
- Harder to audit and rebuild aggregates after bugs.

## Consequences

The system is intentionally not optimized for arbitrary real-time ad hoc analytics on day one. It is optimized for durable ingest, replay, simple operations, and customer-visible freshness for predefined dashboard metrics and personalization state.

Future change: if customers need broad interactive analysis over fresh events, add ClickHouse, Apache Pinot, or a managed OLAP service as a downstream consumer after the event log is stable.
