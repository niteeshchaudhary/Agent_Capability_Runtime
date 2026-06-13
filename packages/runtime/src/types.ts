import type { AdapterConfig } from "@acr/adapters";
import type { AuditChainConfig } from "@acr/audit";
import type {
  CapabilityTokenClaims,
  ConstraintSet,
  ExecutionIntent,
  GrantCapabilityInput,
  GrantCapabilityResult,
  SigningConfig,
  ToolId,
} from "@acr/capability-token";
import type { RuntimeDecision } from "@acr/policy-engine";
import type { ConsumptionConfig } from "./consumption/types.js";
import type { RevocationConfig } from "./revocation/types.js";
import type { SandboxConfig } from "./sandbox/types.js";
import type { ApprovalHook } from "./approval-store.js";
import type { ExecutionPhase } from "./execution-state.js";
import type { OpaBackendConfig } from "@acr/policy-engine";

export interface RuntimeConfig {
  /** HS256 shared secret (default algorithm). Use `signing` for RS256 / EdDSA. */
  secret?: string;
  /** JWT signing algorithm and keys (overrides bare `secret` when set) */
  signing?: SigningConfig;
  issuer?: string;
  adapters?: AdapterConfig;
  auditPath?: string;
  /** Tamper-evident audit hash chain (opt-in; default off) */
  auditChain?: AuditChainConfig;
  approvalPath?: string;
  onApprovalRequired?: ApprovalHook;
  /** Consumption ledger: in-memory (default) or Redis for multi-instance gateways */
  consumption?: ConsumptionConfig;
  /**
   * Revocation store: in-memory (default) or Redis when `mode: "redis"`.
   * Redis is opt-in — single-process deployments need no Redis.
   */
  revocation?: RevocationConfig;
  /** Adapter sandbox limits (timeout, SSRF guard, response cap). Default enabled. */
  sandbox?: SandboxConfig;
  /** Optional OPA/Rego policy backend (HTTP server or local bundle). */
  opa?: OpaBackendConfig;
}

export interface ExecuteInput {
  token: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  approvalId?: string;
  /** Idempotency key — prevents double execution / double consumption */
  requestId?: string;
  /** Distributed trace id for multi-agent workflows */
  traceId?: string;
  /** Long-running agent session for state tracking */
  sessionId?: string;
  /** Semantic execution intent — governs allow/deny beyond tool + payload */
  intent?: ExecutionIntent | string;
  /** Policy simulation only — no adapter execution */
  simulate?: boolean;
}

export interface ExecuteSuccess {
  ok: true;
  decision: "ALLOW";
  result: unknown;
  auditId: string;
  claims: CapabilityTokenClaims;
  executionPhase?: ExecutionPhase;
}

export interface ExecuteSimulated {
  ok: true;
  decision: "SIMULATE";
  reason?: string;
  auditId: string;
  claims: CapabilityTokenClaims;
  evaluatedConditions?: { kind: string; passed: boolean; reason?: string }[];
  executionPhase?: ExecutionPhase;
}

export interface ExecuteDenied {
  ok: false;
  decision: "DENY";
  reason: string;
  auditId: string;
  code:
    | "invalid_token"
    | "token_expired"
    | "tool_mismatch"
    | "policy_denied"
    | "sandbox_denied"
    | "token_revoked";
  executionPhase?: ExecutionPhase;
}

export interface ExecuteApprovalRequired {
  ok: false;
  decision: "REQUIRE_APPROVAL";
  reason: string;
  auditId: string;
  approvalId: string;
  executionPhase?: ExecutionPhase;
}

export type ExecuteResult =
  | ExecuteSuccess
  | ExecuteSimulated
  | ExecuteDenied
  | ExecuteApprovalRequired;

export type { GrantCapabilityInput, GrantCapabilityResult, RuntimeDecision, ToolId, ConstraintSet };
export type { ExecutionPhase } from "./execution-state.js";
