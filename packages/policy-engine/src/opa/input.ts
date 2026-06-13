import type { CapabilityTokenClaims } from "@acr/capability-token";
import type { ConstraintSet } from "@acr/capability-token";
import type { ExecutionIntent } from "@acr/capability-token";
import type { ToolId } from "@acr/capability-token";
import type { OpaEvaluationInput } from "./types.js";

export interface BuildOpaInputParams {
  agentId: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  constraints: ConstraintSet;
  actionCount: number;
  approvalGranted?: boolean;
  simulate?: boolean;
  intent?: ExecutionIntent;
  jti?: string;
  task?: string;
  policyVersionId?: string;
}

/** Build the `input` document passed to OPA Rego policies. */
export function buildOpaInput(params: BuildOpaInputParams): OpaEvaluationInput {
  return {
    agentId: params.agentId,
    tool: params.tool,
    payload: params.payload,
    constraints: params.constraints,
    actionCount: params.actionCount,
    approvalGranted: params.approvalGranted ?? false,
    simulate: params.simulate ?? false,
    intent: params.intent,
    jti: params.jti,
    task: params.task,
    policyVersionId: params.policyVersionId,
  };
}

export function buildOpaInputFromClaims(
  claims: CapabilityTokenClaims,
  params: {
    payload: Record<string, unknown>;
    constraints: ConstraintSet;
    actionCount: number;
    approvalGranted?: boolean;
    simulate?: boolean;
    intent?: ExecutionIntent;
    policyVersionId?: string;
  },
): OpaEvaluationInput {
  return buildOpaInput({
    agentId: claims.sub,
    tool: claims.tool,
    payload: params.payload,
    constraints: params.constraints,
    actionCount: params.actionCount,
    approvalGranted: params.approvalGranted,
    simulate: params.simulate,
    intent: params.intent,
    jti: claims.jti,
    task: claims.task,
    policyVersionId: params.policyVersionId,
  });
}

/** Wrap for OPA REST API body: `{ "input": { ... } }`. */
export function toOpaRequestBody(input: OpaEvaluationInput): { input: OpaEvaluationInput } {
  return { input };
}
