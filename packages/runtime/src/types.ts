import type { AdapterConfig } from "@acr/adapters";
import type {
  CapabilityTokenClaims,
  ConstraintSet,
  GrantCapabilityInput,
  GrantCapabilityResult,
  ToolId,
} from "@acr/capability-token";
import type { RuntimeDecision } from "@acr/policy-engine";
import type { ConsumptionConfig } from "./consumption/types.js";
import type { ApprovalHook } from "./approval-store.js";

export interface RuntimeConfig {
  secret: string;
  issuer?: string;
  adapters?: AdapterConfig;
  auditPath?: string;
  approvalPath?: string;
  onApprovalRequired?: ApprovalHook;
  /** Consumption ledger: in-memory (default) or Redis for multi-instance gateways */
  consumption?: ConsumptionConfig;
}

export interface ExecuteInput {
  token: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  approvalId?: string;
  /** Idempotency key — prevents double execution / double consumption */
  requestId?: string;
  /** Intent label for future intent-aware policy (e.g. "support_response") */
  intent?: string;
  /** Policy simulation only — no adapter execution */
  simulate?: boolean;
}

export interface ExecuteSuccess {
  ok: true;
  decision: "ALLOW";
  result: unknown;
  auditId: string;
  claims: CapabilityTokenClaims;
}

export interface ExecuteSimulated {
  ok: true;
  decision: "SIMULATE";
  reason?: string;
  auditId: string;
  claims: CapabilityTokenClaims;
  evaluatedConditions?: { kind: string; passed: boolean; reason?: string }[];
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

export type ExecuteResult =
  | ExecuteSuccess
  | ExecuteSimulated
  | ExecuteDenied
  | ExecuteApprovalRequired;

export type { GrantCapabilityInput, GrantCapabilityResult, RuntimeDecision, ToolId, ConstraintSet };
