import type { ConstraintSet, ToolId } from "@acr/capability-token";

/** Normalized policy condition (leaf node). */
export type PolicyConditionKind =
  | "allowed_hours"
  | "max_actions"
  | "approval_required"
  | "approval_required_if_external"
  | "gmail_allowed_domains"
  | "gmail_attachments"
  | "http_method"
  | "http_url";

export interface PolicyCondition {
  kind: PolicyConditionKind;
  /** Opaque params for evaluation (domains list, limits, etc.) */
  params?: Record<string, unknown>;
}

export interface PolicyAndNode {
  operator: "AND";
  conditions: PolicyNode[];
}

export interface PolicyOrNode {
  operator: "OR";
  conditions: PolicyNode[];
}

export type PolicyNode = PolicyCondition | PolicyAndNode | PolicyOrNode;

export interface PolicyDocument {
  tool: ToolId;
  /** Normalized AST — all constraints compile to AND of conditions */
  root: PolicyNode;
  /** Original constraint set snapshot for audit/replay */
  source: ConstraintSet;
}

export function isAndNode(node: PolicyNode): node is PolicyAndNode {
  return "operator" in node && node.operator === "AND";
}

export function isConditionNode(node: PolicyNode): node is PolicyCondition {
  return "kind" in node;
}
