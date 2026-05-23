export type AuditDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface AuditEvent {
  id: string;
  agentId: string;
  tool: string;
  decision: AuditDecision;
  reason?: string;
  delegator?: string;
  jti?: string;
  task?: string;
  payloadSummary?: Record<string, unknown>;
  approvalId?: string;
  timestamp: string;
}

export interface RecordAuditInput {
  agentId: string;
  tool: string;
  decision: AuditDecision;
  reason?: string;
  delegator?: string;
  jti?: string;
  task?: string;
  payload?: Record<string, unknown>;
  approvalId?: string;
}
