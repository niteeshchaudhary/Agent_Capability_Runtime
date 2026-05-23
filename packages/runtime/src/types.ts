import type { AdapterConfig } from "@acr/adapters";
import type {
  CapabilityTokenClaims,
  GrantCapabilityInput,
  GrantCapabilityResult,
  ToolId,
} from "@acr/capability-token";
import type { RuntimeDecision } from "@acr/policy-engine";
import type { ApprovalHook } from "./approval-store.js";

export interface RuntimeConfig {
  secret: string;
  issuer?: string;
  /** Adapter credentials and mode (defaults to stub when unset in tests) */
  adapters?: AdapterConfig;
  /** Persistent audit store path (JSONL). Omit for in-memory. */
  auditPath?: string;
  /** Persistent approval store path (JSON). Omit for in-memory. */
  approvalPath?: string;
  /** Invoked when execution pauses for human approval */
  onApprovalRequired?: ApprovalHook;
}

export interface ExecuteInput {
  token: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  /** Resume execution after POST /approvals/:id/approve */
  approvalId?: string;
}

export interface ExecuteSuccess {
  ok: true;
  decision: "ALLOW";
  result: unknown;
  auditId: string;
  claims: CapabilityTokenClaims;
}

export interface ExecuteDenied {
  ok: false;
  decision: "DENY";
  reason: string;
  auditId: string;
  code: "invalid_token" | "token_expired" | "tool_mismatch" | "policy_denied";
}

export interface ExecuteApprovalRequired {
  ok: false;
  decision: "REQUIRE_APPROVAL";
  reason: string;
  auditId: string;
  approvalId: string;
}

export type ExecuteResult = ExecuteSuccess | ExecuteDenied | ExecuteApprovalRequired;

export type { GrantCapabilityInput, GrantCapabilityResult, RuntimeDecision, ToolId };
