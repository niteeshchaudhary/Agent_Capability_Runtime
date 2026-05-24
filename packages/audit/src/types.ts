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
  intentCategory?: string;
  intentAction?: string;
  requestId?: string;
  /** Immutable policy version evaluated at grant time */
  policyVersionId?: string;
  /** Distributed trace id */
  traceId?: string;
  /** Long-running session id */
  sessionId?: string;
  /** Lifecycle phase at decision time */
  executionPhase?: string;
  payloadSummary?: Record<string, unknown>;
  approvalId?: string;
  /** Snapshot of constraints evaluated (event-sourcing foundation) */
  policySnapshot?: ConstraintSet;
  lineage?: CapabilityLineage;
  timestamp: string;
  /** Monotonic position in tamper-evident chain (when enabled) */
  sequence?: number;
  /** SHA-256 of previous event (genesis when sequence is 1) */
  hashPrev?: string;
  /** SHA-256 of canonical event body chained to hashPrev */
  hash?: string;
  /** HMAC-SHA256 of hash when audit chain signing is configured */
  signature?: string;
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
  intentCategory?: string;
  intentAction?: string;
  requestId?: string;
  policyVersionId?: string;
  traceId?: string;
  sessionId?: string;
  executionPhase?: string;
  payload?: Record<string, unknown>;
  approvalId?: string;
  policySnapshot?: ConstraintSet;
  lineage?: CapabilityLineage;
}
