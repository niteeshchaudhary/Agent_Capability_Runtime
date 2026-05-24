import type { ConstraintSet, ExecutionIntent, ToolId } from "@acr/capability-token";
import { compilePolicy } from "./compile.js";
import {
  evaluatePolicyAst,
  type AstEvaluationContext,
  type AstEvaluationResult,
  type RuntimeDecision,
} from "./evaluate-ast.js";

export type { RuntimeDecision };

export interface PolicyEvaluationContext {
  tool: ToolId;
  constraints: ConstraintSet;
  payload: Record<string, unknown>;
  actionCount?: number;
  approvalGranted?: boolean;
  nowUtcHour?: number;
  simulate?: boolean;
  intent?: ExecutionIntent;
}

export interface PolicyEvaluationResult {
  decision: RuntimeDecision;
  reason?: string;
  /** Present when evaluatePolicy compiles AST internally */
  evaluatedConditions?: AstEvaluationResult["evaluatedConditions"];
}

/**
 * Evaluate constraints against a tool payload using the normalized policy AST.
 */
export function evaluatePolicy(ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  const doc = compilePolicy(ctx.tool, ctx.constraints);
  const astCtx: AstEvaluationContext = {
    tool: ctx.tool,
    payload: ctx.payload,
    actionCount: ctx.actionCount,
    approvalGranted: ctx.approvalGranted,
    nowUtcHour: ctx.nowUtcHour,
    simulate: ctx.simulate,
    intent: ctx.intent,
  };
  const result = evaluatePolicyAst(doc, astCtx);
  return {
    decision: result.decision,
    reason: result.reason,
    evaluatedConditions: result.evaluatedConditions,
  };
}

export { compilePolicy } from "./compile.js";
export type { PolicyDocument, PolicyNode, PolicyCondition } from "./ast.js";
export { evaluatePolicyAst } from "./evaluate-ast.js";

export type { ConstraintSet, ToolId };
