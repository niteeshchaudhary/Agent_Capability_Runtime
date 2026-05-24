import type { AuditChainVerification } from "./hash-chain.js";
import type { AuditEvent, RecordAuditInput } from "./types.js";

export interface AuditQuery {
  agentId?: string;
  tool?: string;
  decision?: AuditEvent["decision"];
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuditStore {
  record(input: RecordAuditInput): AuditEvent;
  getById(id: string): AuditEvent | undefined;
  list(query?: AuditQuery): AuditEvent[];
  /** Present when hash chain is enabled on this store */
  verifyChain?(): AuditChainVerification;
}

export function matchesAuditQuery(event: AuditEvent, query?: AuditQuery): boolean {
  if (!query) return true;
  if (query.agentId !== undefined && event.agentId !== query.agentId) return false;
  if (query.tool !== undefined && event.tool !== query.tool) return false;
  if (query.decision !== undefined && event.decision !== query.decision) return false;
  if (query.since !== undefined && event.timestamp < query.since) return false;
  if (query.until !== undefined && event.timestamp > query.until) return false;
  return true;
}

export function sortAuditEvents(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
