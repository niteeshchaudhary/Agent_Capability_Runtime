import type { AuditEvent, RecordAuditInput } from "./types.js";
import { matchesAuditQuery, sortAuditEvents, type AuditQuery, type AuditStore } from "./store.js";

function createAuditId(): string {
  return `aud_${crypto.randomUUID()}`;
}

function summarizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (payload.to !== undefined) summary.to = payload.to;
  if (payload.subject !== undefined) summary.subject = payload.subject;
  if (payload.url !== undefined) summary.url = payload.url;
  if (payload.method !== undefined) summary.method = payload.method;
  if (payload.channel !== undefined) summary.channel = payload.channel;
  if (payload.attachments !== undefined) summary.hasAttachments = Boolean(payload.attachments);
  return summary;
}

export class AuditLog implements AuditStore {
  private readonly events = new Map<string, AuditEvent>();

  /** Restore events from persistent storage (does not re-summarize payloads). */
  importEvents(events: AuditEvent[]): void {
    for (const event of events) {
      this.events.set(event.id, event);
    }
  }

  record(input: RecordAuditInput): AuditEvent {
    const event: AuditEvent = {
      id: createAuditId(),
      agentId: input.agentId,
      tool: input.tool,
      decision: input.decision,
      timestamp: new Date().toISOString(),
    };

    if (input.reason !== undefined) event.reason = input.reason;
    if (input.delegator !== undefined) event.delegator = input.delegator;
    if (input.jti !== undefined) event.jti = input.jti;
    if (input.task !== undefined) event.task = input.task;
    if (input.approvalId !== undefined) event.approvalId = input.approvalId;
    if (input.payload !== undefined) {
      event.payloadSummary = summarizePayload(input.payload);
    }

    this.events.set(event.id, event);
    return event;
  }

  getById(id: string): AuditEvent | undefined {
    return this.events.get(id);
  }

  list(query?: AuditQuery): AuditEvent[] {
    const filtered = [...this.events.values()].filter((event) =>
      matchesAuditQuery(event, query),
    );
    const sorted = sortAuditEvents(filtered);
    if (query?.limit !== undefined && query.limit >= 0) {
      return sorted.slice(-query.limit);
    }
    return sorted;
  }

  clear(): void {
    this.events.clear();
  }
}
