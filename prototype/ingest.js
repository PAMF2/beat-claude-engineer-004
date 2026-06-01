import crypto from "node:crypto";

export class IngestService {
  constructor({ eventLog, now = () => Date.now() }) {
    this.eventLog = eventLog;
    this.now = now;
    this.counters = {
      accepted: 0,
      rejected: 0,
    };
  }

  accept(input) {
    const normalized = this.normalize(input);
    const validationError = validate(normalized);
    if (validationError) {
      this.counters.rejected += 1;
      return {
        ok: false,
        status: 400,
        error: validationError,
      };
    }

    const record = this.eventLog.put(normalized);
    this.counters.accepted += 1;
    return {
      ok: true,
      status: 202,
      event_id: normalized.event_id,
      offset: record.offset,
    };
  }

  normalize(input) {
    const receivedAt = this.now();
    const event = {
      tenant_id: input.tenant_id,
      tenant_bucket: input.tenant_bucket || tenantBucket(input.tenant_id),
      anonymous_id: input.anonymous_id,
      user_id: input.user_id || null,
      session_id: input.session_id || null,
      event_type: input.event_type,
      event_time: input.event_time || receivedAt,
      received_at: receivedAt,
      schema_version: input.schema_version || 1,
      properties: input.properties || {},
    };

    return {
      ...event,
      event_id: input.event_id || deterministicEventId(event),
    };
  }
}

function tenantBucket(tenantId, bucketCount = 32) {
  if (!tenantId) return null;
  const hash = crypto.createHash("sha256").update(tenantId).digest();
  return String(hash.readUInt32BE(0) % bucketCount).padStart(2, "0");
}

function deterministicEventId(event) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify([
      event.tenant_id,
      event.anonymous_id,
      event.user_id,
      event.session_id,
      event.event_type,
      event.event_time,
      event.properties,
    ]))
    .digest("hex")
    .slice(0, 24);
  return `${event.tenant_id}:${hash}`;
}

function validate(event) {
  if (!event.tenant_id) return "tenant_id is required";
  if (!event.event_type) return "event_type is required";
  if (!event.anonymous_id && !event.user_id) return "anonymous_id or user_id is required";
  if (typeof event.properties !== "object" || Array.isArray(event.properties)) {
    return "properties must be an object";
  }
  return null;
}
