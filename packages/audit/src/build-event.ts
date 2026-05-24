import type { AuditEvent, RecordAuditInput } from "./types.js";

export function createAuditId(): string {
  return `aud_${crypto.randomUUID()}`;
}

export function summarizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (payload.to !== undefined) summary.to = payload.to;
  if (payload.subject !== undefined) summary.subject = payload.subject;
  if (payload.url !== undefined) summary.url = payload.url;
  if (payload.method !== undefined) summary.method = payload.method;
  if (payload.channel !== undefined) summary.channel = payload.channel;
  if (payload.attachments !== undefined) summary.hasAttachments = Boolean(payload.attachments);
  return summary;
}

export function buildAuditEvent(input: RecordAuditInput, id?: string): AuditEvent {
  const event: AuditEvent = {
    id: id ?? createAuditId(),
    agentId: input.agentId,
    tool: input.tool,
    decision: input.decision,
    timestamp: new Date().toISOString(),
  };

  if (input.reason !== undefined) event.reason = input.reason;
  if (input.delegator !== undefined) event.delegator = input.delegator;
  if (input.jti !== undefined) event.jti = input.jti;
  if (input.task !== undefined) event.task = input.task;
  if (input.intent !== undefined) event.intent = input.intent;
  if (input.intentCategory !== undefined) event.intentCategory = input.intentCategory;
  if (input.intentAction !== undefined) event.intentAction = input.intentAction;
  if (input.requestId !== undefined) event.requestId = input.requestId;
  if (input.policyVersionId !== undefined) event.policyVersionId = input.policyVersionId;
  if (input.traceId !== undefined) event.traceId = input.traceId;
  if (input.sessionId !== undefined) event.sessionId = input.sessionId;
  if (input.executionPhase !== undefined) event.executionPhase = input.executionPhase;
  if (input.approvalId !== undefined) event.approvalId = input.approvalId;
  if (input.policySnapshot !== undefined) event.policySnapshot = input.policySnapshot;
  if (input.lineage !== undefined) event.lineage = input.lineage;
  if (input.payload !== undefined) {
    event.payloadSummary = summarizePayload(input.payload);
  }

  return event;
}
