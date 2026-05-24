import type { ConstraintSet } from "@acr/capability-token";

export type AuditDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "SIMULATE";

export interface CapabilityLineage {
  parentJti?: string;
  delegationDepth?: number;
  delegatorChain?: string[];
}

export interface AuditEvent {
  id: string;
  agentId: string;
  tool: string;
  decision: AuditDecision;
  reason?: string;
  delegator?: string;
  jti?: string;
  task?: string;
  intent?: string;
  requestId?: string;
  payloadSummary?: Record<string, unknown>;
  approvalId?: string;
  /** Snapshot of constraints evaluated (event-sourcing foundation) */
  policySnapshot?: ConstraintSet;
  lineage?: CapabilityLineage;
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
  intent?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  approvalId?: string;
  policySnapshot?: ConstraintSet;
  lineage?: CapabilityLineage;
}
