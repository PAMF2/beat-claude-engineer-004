const config = {
  tenants: 5,
  visitorsPerTenant: 200,
  eventsPerVisitor: 8,
  duplicateRate: 0.02,
  invalidRate: 0.01,
  lateRate: 0.03,
  pricingThreshold: 3,
};

const eventTypes = ["page_view", "click", "form_submit", "custom_event"];

function makeEvent(tenantIndex, visitorIndex, sequence) {
  const tenantId = `tenant_${tenantIndex}`;
  const anonymousId = `anon_${tenantIndex}_${visitorIndex}`;
  const eventType =
    sequence % 2 === 0 ? "page_view" : eventTypes[(tenantIndex + visitorIndex + sequence) % eventTypes.length];
  const path = [1, 3, 5].includes(sequence) ? "/pricing" : ["/", "/features", "/blog"][sequence % 3];
  const receivedAt = Date.now() + sequence;
  const isLate = ((tenantIndex + visitorIndex + sequence) % Math.round(1 / config.lateRate)) === 0;

  return {
    event_id: `${tenantId}:${anonymousId}:${sequence}`,
    tenant_id: tenantId,
    tenant_bucket: String(tenantIndex % 32).padStart(2, "0"),
    anonymous_id: anonymousId,
    user_id: sequence >= 4 ? `user_${tenantIndex}_${visitorIndex}` : null,
    event_type: eventType,
    event_time: receivedAt - (isLate ? 10 * 60 * 1000 : 250),
    received_at: receivedAt,
    properties: { path },
  };
}

function generateEvents() {
  const accepted = [];
  for (let t = 1; t <= config.tenants; t += 1) {
    for (let v = 1; v <= config.visitorsPerTenant; v += 1) {
      for (let s = 1; s <= config.eventsPerVisitor; s += 1) {
        const event = makeEvent(t, v, s);
        accepted.push(event);
        if ((t + v + s) % Math.round(1 / config.duplicateRate) === 0) {
          accepted.push({ ...event });
        }
      }
    }
  }

  const invalidCount = Math.floor(accepted.length * config.invalidRate);
  for (let i = 0; i < invalidCount; i += 1) {
    accepted.push({
      event_id: `bad_${i}`,
      tenant_id: null,
      anonymous_id: null,
      event_type: "page_view",
      received_at: Date.now(),
      properties: {},
    });
  }

  return accepted;
}

function process(events) {
  const seen = new Set();
  const acceptedByTenant = new Map();
  const processedByTenant = new Map();
  const dlq = [];
  const duplicates = [];
  const late = [];
  const pricingViews = new Map();
  const segmentMembers = new Set();

  for (const event of events) {
    if (!event.tenant_id || !event.anonymous_id || !event.event_id) {
      dlq.push(event);
      continue;
    }

    acceptedByTenant.set(
      event.tenant_id,
      (acceptedByTenant.get(event.tenant_id) || 0) + 1,
    );

    if (seen.has(event.event_id)) {
      duplicates.push(event);
      continue;
    }
    seen.add(event.event_id);

    if (event.received_at - event.event_time > 5 * 60 * 1000) {
      late.push(event);
    }

    processedByTenant.set(
      event.tenant_id,
      (processedByTenant.get(event.tenant_id) || 0) + 1,
    );

    if (event.properties?.path === "/pricing") {
      // Use the anonymous visitor key as the stable stitching key for the local demo.
      const key = `${event.tenant_id}:${event.anonymous_id}`;
      const count = (pricingViews.get(key) || 0) + 1;
      pricingViews.set(key, count);
      if (count >= config.pricingThreshold) {
        segmentMembers.add(key);
      }
    }
  }

  return {
    acceptedByTenant: Object.fromEntries(acceptedByTenant),
    processedByTenant: Object.fromEntries(processedByTenant),
    accepted: events.length,
    processed: seen.size,
    dlq: dlq.length,
    duplicates: duplicates.length,
    late: late.length,
    pricingSegmentMembers: segmentMembers.size,
  };
}

const events = generateEvents();
const result = process(events);
const expectedUniqueValid = config.tenants * config.visitorsPerTenant * config.eventsPerVisitor;
const pass =
  result.processed === expectedUniqueValid &&
  result.dlq > 0 &&
  result.duplicates > 0 &&
  result.late > 0 &&
  result.pricingSegmentMembers > 0;

console.log("Synthetic reconciliation simulation");
console.log(JSON.stringify({ config, expectedUniqueValid, result, pass }, null, 2));

if (!pass) {
  process.exitCode = 1;
}
