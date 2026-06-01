import { InMemoryEventLog } from "./eventLog.js";
import { IngestService } from "./ingest.js";
import { RealtimeProcessor } from "./processor.js";
import { reconcile } from "./reconcile.js";

const eventLog = new InMemoryEventLog();
const ingest = new IngestService({ eventLog, now: fixedClock() });
const processor = new RealtimeProcessor();

const base = {
  tenant_id: "tenant_1",
  anonymous_id: "anon_1",
  event_type: "page_view",
  properties: { path: "/pricing" },
};

const events = [
  { ...base, event_id: "evt_1", event_time: 1 },
  { ...base, event_id: "evt_2", event_time: 2 },
  { ...base, event_id: "evt_3", event_time: 3 },
  { ...base, event_id: "evt_3", event_time: 3 },
  { tenant_id: "tenant_1", event_type: "page_view", properties: {} },
];

for (const event of events) {
  const result = ingest.accept(event);
  if (!result.ok) {
    console.log("Rejected at ingest", result);
  }
}

const batch = eventLog.readFrom(0, 100);
const snapshot = processor.process(batch);
const report = reconcile({
  ingestCounters: ingest.counters,
  logSize: eventLog.size(),
  processorSnapshot: snapshot,
});

console.log(JSON.stringify({ snapshot, report }, null, 2));

function fixedClock() {
  let now = 1_700_000_000_000;
  return () => {
    now += 1;
    return now;
  };
}
