const assumptions = {
  eventsPerDay: 50_000_000,
  avgEventKb: 2,
  spikeMultiplier: 10,
  shardHeadroomMultiplier: 2,
  daysPerMonth: 30,
  kinesisShardWriteMbPerSec: 1,
  kinesisShardWriteRecordsPerSec: 1_000,
  kinesisShardHourUsd: 0.015,
  kinesisPutPayloadUnitPerMillionUsd: 0.014,
  kinesisExtendedRetentionShardHourUsd: 0.020,
  enhancedFanOutConsumerShardHourUsd: 0.015,
  enhancedFanOutRetrievalPerGbUsd: 0.013,
  firehoseBillableRecordKb: 5,
  firehoseIngestionPerGbUsd: 0.029,
  firehoseDynamicPartitioningPerGbUsd: 0.020,
  s3StandardStorageUsdPerGbMonthFirst50Tb: 0.023,
  rawRetentionDaysInStandard: 90,
};

const sources = [
  {
    label: "AWS Kinesis Data Streams pricing",
    url: "https://aws.amazon.com/kinesis/data-streams/pricing/",
    usedFor: "shard-hour, PUT payload unit, retention, and enhanced fan-out prices",
  },
  {
    label: "AWS Kinesis Data Streams quotas and limits",
    url: "https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html",
    usedFor: "1 MB/sec and 1,000 records/sec write capacity per shard",
  },
  {
    label: "Amazon Data Firehose buffering",
    url: "https://docs.aws.amazon.com/firehose/latest/dev/buffering.html",
    usedFor: "S3 delivery uses size/time buffering; dynamic partitioning adds delay",
  },
  {
    label: "Amazon Data Firehose pricing",
    url: "https://aws.amazon.com/firehose/pricing/",
    usedFor: "5 KB billing increments, ingestion, and dynamic partitioning prices",
  },
  {
    label: "Amazon S3 pricing",
    url: "https://aws.amazon.com/s3/pricing/",
    usedFor: "S3 Standard storage pricing",
  },
];

function ceil(n) {
  return Math.ceil(n);
}

function money(n) {
  return `$${n.toFixed(2)}`;
}

function model(a) {
  const secondsPerDay = 86_400;
  const avgEventsPerSec = a.eventsPerDay / secondsPerDay;
  const peakEventsPerSec = avgEventsPerSec * a.spikeMultiplier;
  const avgMbPerSec = (avgEventsPerSec * a.avgEventKb) / 1024;
  const peakMbPerSec = avgMbPerSec * a.spikeMultiplier;

  const shardsByBytes = ceil(peakMbPerSec / a.kinesisShardWriteMbPerSec);
  const shardsByRecords = ceil(peakEventsPerSec / a.kinesisShardWriteRecordsPerSec);
  const requiredShards = Math.max(shardsByBytes, shardsByRecords);
  const provisionedShards = ceil(requiredShards * a.shardHeadroomMultiplier);

  const monthlyEvents = a.eventsPerDay * a.daysPerMonth;
  const putPayloadUnitsPerRecord = ceil(a.avgEventKb / 25);
  const monthlyPutPayloadUnits = monthlyEvents * putPayloadUnitsPerRecord;
  const kinesisShardCost =
    provisionedShards * 24 * a.daysPerMonth * a.kinesisShardHourUsd;
  const kinesisPutCost =
    (monthlyPutPayloadUnits / 1_000_000) * a.kinesisPutPayloadUnitPerMillionUsd;
  const kinesisExtendedRetentionCost =
    provisionedShards * 24 * a.daysPerMonth * a.kinesisExtendedRetentionShardHourUsd;

  const rawGbPerDay = (a.eventsPerDay * a.avgEventKb) / (1024 * 1024);
  const rawGbPerMonth = rawGbPerDay * a.daysPerMonth;
  const rawGbStoredStandard = rawGbPerDay * a.rawRetentionDaysInStandard;
  const s3StorageCost =
    rawGbStoredStandard * a.s3StandardStorageUsdPerGbMonthFirst50Tb;
  const enhancedFanOutConsumerShardCost =
    provisionedShards * 24 * a.daysPerMonth * a.enhancedFanOutConsumerShardHourUsd;
  const enhancedFanOutRetrievalCost =
    rawGbPerMonth * a.enhancedFanOutRetrievalPerGbUsd;
  const firehoseBillableGbPerMonth =
    (monthlyEvents * Math.max(a.avgEventKb, a.firehoseBillableRecordKb)) /
    (1024 * 1024);
  const firehoseIngestionCost =
    firehoseBillableGbPerMonth * a.firehoseIngestionPerGbUsd;
  const firehoseDynamicPartitioningCost =
    rawGbPerMonth * a.firehoseDynamicPartitioningPerGbUsd;

  return {
    avgEventsPerSec,
    peakEventsPerSec,
    avgMbPerSec,
    peakMbPerSec,
    shardsByBytes,
    shardsByRecords,
    requiredShards,
    provisionedShards,
    rawGbPerDay,
    rawGbPerMonth,
    rawGbStoredStandard,
    firehoseBillableGbPerMonth,
    monthlyCosts: {
      kinesisShardCost,
      kinesisPutCost,
      kinesisExtendedRetentionCost,
      enhancedFanOutConsumerShardCost,
      enhancedFanOutRetrievalCost,
      firehoseIngestionCost,
      firehoseDynamicPartitioningCost,
      s3StorageCost,
      subtotal:
        kinesisShardCost +
        kinesisPutCost +
        kinesisExtendedRetentionCost +
        enhancedFanOutConsumerShardCost +
        enhancedFanOutRetrievalCost +
        firehoseIngestionCost +
        firehoseDynamicPartitioningCost +
        s3StorageCost,
    },
  };
}

const result = model(assumptions);

console.log("Engineer 004 capacity model");
console.log(JSON.stringify({ assumptions, sources, result }, null, 2));
console.log("");
console.log("Readable summary");
console.log(`Average ingest: ${result.avgEventsPerSec.toFixed(0)} events/sec`);
console.log(`Peak ingest: ${result.peakEventsPerSec.toFixed(0)} events/sec`);
console.log(`Peak bandwidth: ${result.peakMbPerSec.toFixed(2)} MB/sec`);
console.log(`Required Kinesis shards: ${result.requiredShards}`);
console.log(`Provisioned shards with headroom: ${result.provisionedShards}`);
console.log(`Raw data per day: ${result.rawGbPerDay.toFixed(1)} GB`);
console.log(`90-day S3 Standard raw retention: ${result.rawGbStoredStandard.toFixed(0)} GB`);
console.log(`Modeled streaming core monthly floor: ${money(result.monthlyCosts.subtotal)}`);
console.log("Excludes Firehose JQ-hours/S3 objects, S3 requests/cold tiers, ECS, Redis, DynamoDB requests, NAT, logs, KMS keys/requests, and Athena.");
console.log("");
console.log("Pricing constants were checked against AWS public pricing pages on 2026-06-01.");
