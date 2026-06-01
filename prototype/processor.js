export class RealtimeProcessor {
  constructor({ lateAfterMs = 5 * 60 * 1000, pricingThreshold = 3 } = {}) {
    this.lateAfterMs = lateAfterMs;
    this.pricingThreshold = pricingThreshold;
    this.seenEventIds = new Set();
    this.deadLetter = [];
    this.offset = 0;
    this.counters = new Map();
    this.pricingViews = new Map();
    this.segmentMembers = new Set();
  }

  process(records) {
    for (const record of records) {
      this.offset = Math.max(this.offset, record.offset + 1);
      this.processEvent(record.event);
    }
    return this.snapshot();
  }

  processEvent(event) {
    if (!isValidForProcessing(event)) {
      this.deadLetter.push({ event, reason: "invalid event" });
      this.increment(event.tenant_id || "unknown", "dlq");
      return;
    }

    this.increment(event.tenant_id, "accepted");

    if (this.seenEventIds.has(event.event_id)) {
      this.increment(event.tenant_id, "duplicate");
      return;
    }
    this.seenEventIds.add(event.event_id);

    if (event.received_at - event.event_time > this.lateAfterMs) {
      this.increment(event.tenant_id, "late");
    }

    this.increment(event.tenant_id, "processed");
    this.increment(event.tenant_id, `event_type:${event.event_type}`);

    if (event.properties?.path === "/pricing") {
      const identityKey = `${event.tenant_id}:${event.anonymous_id || event.user_id}`;
      const count = (this.pricingViews.get(identityKey) || 0) + 1;
      this.pricingViews.set(identityKey, count);
      if (count >= this.pricingThreshold) {
        this.segmentMembers.add(identityKey);
      }
    }
  }

  increment(tenantId, key) {
    const tenantCounters = this.counters.get(tenantId) || {};
    tenantCounters[key] = (tenantCounters[key] || 0) + 1;
    this.counters.set(tenantId, tenantCounters);
  }

  snapshot() {
    return {
      offset: this.offset,
      tenants: Object.fromEntries(this.counters),
      deadLetterSize: this.deadLetter.length,
      uniqueEvents: this.seenEventIds.size,
      pricingSegmentMembers: this.segmentMembers.size,
    };
  }
}

function isValidForProcessing(event) {
  return Boolean(event?.event_id && event.tenant_id && (event.anonymous_id || event.user_id));
}
