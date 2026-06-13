import type { ConstraintSet, ExecutionIntent, ToolId } from "@acr/capability-token";
import type { RuntimeDecision } from "../evaluate-ast.js";

export type OpaMode = "enforce" | "shadow" | "disabled";

export type FetchFn = typeof fetch;

export interface OpaBackendConfig {
  /** OPA server base URL, e.g. `http://localhost:8181`. */
  url?: string;
  /** Data path queried via POST /v1/data/{path} — default `acr/decision`. */
  decisionPath?: string;
  /** Directory or .rego file evaluated locally via `opa eval` (no server). */
  bundlePath?: string;
  /** How OPA decisions affect execution. Default `enforce`. */
  mode?: OpaMode;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Override fetch (tests). */
  fetchFn?: FetchFn;
}

export interface OpaEvaluationInput {
  agentId: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  constraints: ConstraintSet;
  actionCount: number;
  approvalGranted: boolean;
  simulate: boolean;
  intent?: ExecutionIntent;
  jti?: string;
  task?: string;
  policyVersionId?: string;
}

export interface OpaDecision {
  decision: RuntimeDecision;
  reason?: string;
  shadowOnly?: boolean;
}

export interface OpaEvaluationResult {
  allowed: boolean;
  decision: RuntimeDecision;
  reason?: string;
  shadowOnly: boolean;
  source: "opa-http" | "opa-local" | "disabled" | "skipped";
}
