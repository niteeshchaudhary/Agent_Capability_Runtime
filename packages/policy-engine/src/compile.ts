import type { ConstraintSet, ToolId } from "@acr/capability-token";
import type { PolicyCondition, PolicyDocument, PolicyNode } from "./ast.js";

/**
 * Compile a ConstraintSet into a normalized policy AST (AND of conditions).
 * This is the canonical internal representation for evaluation and simulation.
 */
export function compilePolicy(tool: ToolId, constraints: ConstraintSet): PolicyDocument {
  const conditions: PolicyCondition[] = [];

  if (constraints.allowedHours !== undefined) {
    conditions.push({
      kind: "allowed_hours",
      params: { ...constraints.allowedHours },
    });
  }

  if (constraints.maxActions !== undefined) {
    conditions.push({
      kind: "max_actions",
      params: { limit: constraints.maxActions },
    });
  }

  if (constraints.approvalRequired) {
    conditions.push({ kind: "approval_required" });
  }

  if (constraints.allowedIntentCategories?.length) {
    conditions.push({
      kind: "intent_category",
      params: {
        categories: constraints.allowedIntentCategories.map((c) => c.toLowerCase()),
      },
    });
  }

  if (constraints.allowedIntentActions?.length) {
    conditions.push({
      kind: "intent_action",
      params: {
        actions: constraints.allowedIntentActions.map((a) => a.toLowerCase()),
      },
    });
  }

  if (tool === "gmail.send") {
    if (constraints.allowedDomains?.length) {
      if (constraints.approvalRequiredIfExternal) {
        conditions.push({
          kind: "approval_required_if_external",
          params: { domains: constraints.allowedDomains.map((d) => d.toLowerCase()) },
        });
      } else {
        conditions.push({
          kind: "gmail_allowed_domains",
          params: { domains: constraints.allowedDomains.map((d) => d.toLowerCase()) },
        });
      }
    }
    if (constraints.attachments === false) {
      conditions.push({ kind: "gmail_attachments", params: { allowed: false } });
    }
  }

  if (tool === "http.request") {
    if (constraints.allowedMethods?.length) {
      conditions.push({
        kind: "http_method",
        params: { methods: constraints.allowedMethods.map((m) => m.toUpperCase()) },
      });
    }
    if (constraints.allowedUrls?.length) {
      conditions.push({
        kind: "http_url",
        params: { urls: constraints.allowedUrls },
      });
    }
  }

  let root: PolicyNode;
  if (conditions.length === 0) {
    root = { operator: "AND", conditions: [] };
  } else if (conditions.length === 1) {
    root = conditions[0]!;
  } else {
    root = { operator: "AND", conditions };
  }

  return { tool, root, source: constraints };
}
