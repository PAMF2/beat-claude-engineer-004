import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEventLog } from "./eventLog.js";
import { IngestService } from "./ingest.js";
import { RealtimeProcessor } from "./processor.js";
import { reconcile } from "./reconcile.js";

test("ingest rejects events without identity", () => {
  const eventLog = new InMemoryEventLog();
  const ingest = new IngestService({ eventLog });

  const result = ingest.accept({
    tenant_id: "tenant_1",
    event_type: "page_view",
    properties: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(eventLog.size(), 0);
  assert.equal(ingest.counters.rejected, 1);
});

test("processor dedupes events and builds pricing segment", () => {
  const eventLog = new InMemoryEventLog();
  const ingest = new IngestService({ eventLog, now: clock() });
  const processor = new RealtimeProcessor({ pricingThreshold: 3 });

  for (const id of ["evt_1", "evt_2", "evt_3", "evt_3"]) {
    ingest.accept({
      event_id: id,
      tenant_id: "tenant_1",
      anonymous_id: "anon_1",
      event_type: "page_view",
      properties: { path: "/pricing" },
    });
  }

  const snapshot = processor.process(eventLog.readFrom(0));

  assert.equal(snapshot.uniqueEvents, 3);
  assert.equal(snapshot.tenants.tenant_1.duplicate, 1);
  assert.equal(snapshot.pricingSegmentMembers, 1);
});

test("ingest derives a stable bounded tenant bucket", () => {
  const eventLog = new InMemoryEventLog();
  const ingest = new IngestService({ eventLog });
  const input = {
    tenant_id: "tenant_1",
    anonymous_id: "anon_1",
    event_type: "page_view",
    properties: {},
  };

  ingest.accept(input);
  ingest.accept({ ...input, event_id: "second" });

  const buckets = eventLog.records.map((record) => Number(record.event.tenant_bucket));
  assert.equal(buckets[0], buckets[1]);
  assert.equal(Number.isInteger(buckets[0]), true);
  assert.equal(buckets[0] >= 0 && buckets[0] < 32, true);
});

test("reconciliation accounts for processed, duplicate, and DLQ records", () => {
  const eventLog = new InMemoryEventLog();
  const ingest = new IngestService({ eventLog, now: clock() });
  const processor = new RealtimeProcessor();

  ingest.accept({
    event_id: "evt_1",
    tenant_id: "tenant_1",
    anonymous_id: "anon_1",
    event_type: "click",
    properties: {},
  });
  eventLog.put({ event_id: "bad_1", tenant_id: null });
  eventLog.put({
    event_id: "evt_1",
    tenant_id: "tenant_1",
    anonymous_id: "anon_1",
    event_type: "click",
    properties: {},
  });

  const snapshot = processor.process(eventLog.readFrom(0));
  const report = reconcile({
    ingestCounters: { accepted: eventLog.size() },
    logSize: eventLog.size(),
    processorSnapshot: snapshot,
  });

  assert.equal(report.processed, 1);
  assert.equal(report.duplicates, 1);
  assert.equal(report.dlq, 1);
  assert.equal(report.processedReconciles, true);
});

function clock() {
  let now = 1_700_000_000_000;
  return () => {
    now += 1;
    return now;
  };
}
