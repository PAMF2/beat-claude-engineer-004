export class InMemoryEventLog {
  constructor() {
    this.records = [];
    this.offset = 0;
  }

  put(event) {
    const record = {
      offset: this.offset,
      partitionKey: `${event.tenant_id}:${event.anonymous_id || event.user_id || "unknown"}`,
      event,
      appendedAt: Date.now(),
    };
    this.records.push(record);
    this.offset += 1;
    return record;
  }

  readFrom(offset = 0, limit = 100) {
    return this.records.slice(offset, offset + limit);
  }

  size() {
    return this.records.length;
  }
}
