import type { ToolId } from "@acr/capability-token";
import type { ExecutionIntent } from "@acr/capability-token";
import type { PolicyCondition, PolicyDocument, PolicyNode } from "./ast.js";
import { isAndNode, isConditionNode } from "./ast.js";

export type RuntimeDecision =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "SIMULATE"
  | "REDACT"
  | "SANDBOX"
  | "LIMIT"
  | "ESCALATE";

export interface AstEvaluationContext {
  tool: ToolId;
  payload: Record<string, unknown>;
  actionCount?: number;
  approvalGranted?: boolean;
  nowUtcHour?: number;
  /** When true, never return DENY for consumption — only report what would happen */
  simulate?: boolean;
  /** Semantic execution intent (category + optional action) */
  intent?: ExecutionIntent;
}

export interface AstEvaluationResult {
  decision: RuntimeDecision;
  reason?: string;
  /** Conditions that matched or failed (for simulation dashboards) */
  evaluatedConditions?: { kind: string; passed: boolean; reason?: string }[];
}

function extractEmailDomain(to: unknown): string | null {
  if (typeof to !== "string") return null;
  const at = to.lastIndexOf("@");
  if (at < 0) return null;
  return to.slice(at + 1).toLowerCase();
}

function hostMatchesAllowed(url: string, allowed: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host === allowed || host.endsWith(`.${allowed}`);
  } catch {
    return url.includes(allowed);
  }
}

function evaluateCondition(
  condition: PolicyCondition,
  ctx: AstEvaluationContext,
): AstEvaluationResult {
  const hour = ctx.nowUtcHour ?? new Date().getUTCHours();
  const traces: AstEvaluationResult["evaluatedConditions"] = [];

  const fail = (decision: RuntimeDecision, reason: string, kind: string): AstEvaluationResult => {
    traces.push({ kind, passed: false, reason });
    return { decision, reason, evaluatedConditions: traces };
  };

  const pass = (kind: string): AstEvaluationResult => {
    traces.push({ kind, passed: true });
    return { decision: "ALLOW", evaluatedConditions: traces };
  };

  switch (condition.kind) {
    case "allowed_hours": {
      const start = condition.params?.start as number;
      const end = condition.params?.end as number;
      if (hour < start || hour > end) {
        return fail(
          "DENY",
          `execution outside allowed hours (${start}–${end} UTC)`,
          condition.kind,
        );
      }
      return pass(condition.kind);
    }

    case "max_actions": {
      const limit = condition.params?.limit as number;
      if (limit < Number.MAX_SAFE_INTEGER && (ctx.actionCount ?? 0) >= limit) {
        return fail("DENY", "max_actions exceeded", condition.kind);
      }
      return pass(condition.kind);
    }

    case "approval_required": {
      if (condition.params?.noop) return pass(condition.kind);
      if (!ctx.approvalGranted) {
        return fail("REQUIRE_APPROVAL", "approval_required constraint", condition.kind);
      }
      return pass(condition.kind);
    }

    case "spending_limit": {
      const limitCents = (condition.params?.limitCents as number) ?? 0;
      const amount = ctx.payload.amount;
      if (typeof amount === "number" && amount > limitCents) {
        if (ctx.approvalGranted) return pass(condition.kind);
        const dollars = (limitCents / 100).toFixed(2);
        return fail(
          "REQUIRE_APPROVAL",
          `spending $${(amount / 100).toFixed(2)} exceeds limit $${dollars} — approval required`,
          condition.kind,
        );
      }
      return pass(condition.kind);
    }

    case "approval_required_if_external": {
      if (ctx.tool !== "gmail.send") return pass(condition.kind);
      const domain = extractEmailDomain(ctx.payload.to);
      const domains = (condition.params?.domains as string[]) ?? [];
      if (domain && domains.length && !domains.includes(domain)) {
        if (ctx.approvalGranted) return pass(condition.kind);
        return fail(
          "REQUIRE_APPROVAL",
          `external domain requires approval: ${domain}`,
          condition.kind,
        );
      }
      return pass(condition.kind);
    }

    case "gmail_allowed_domains": {
      const domains = (condition.params?.domains as string[]) ?? [];
      const domain = extractEmailDomain(ctx.payload.to);
      if (domain && domains.length && !domains.includes(domain)) {
        if (ctx.approvalGranted) return pass(condition.kind);
        return fail("DENY", `external domain blocked: ${domain}`, condition.kind);
      }
      return pass(condition.kind);
    }

    case "gmail_attachments": {
      if (condition.params?.allowed === false && ctx.payload.attachments) {
        return fail("DENY", "attachments not permitted", condition.kind);
      }
      return pass(condition.kind);
    }

    case "http_method": {
      const methods = (condition.params?.methods as string[]) ?? [];
      const method = String(ctx.payload.method ?? "GET").toUpperCase();
      if (methods.length && !methods.includes(method)) {
        return fail("DENY", `HTTP method ${method} not allowed`, condition.kind);
      }
      return pass(condition.kind);
    }

    case "http_url": {
      const urls = (condition.params?.urls as string[]) ?? [];
      const url = ctx.payload.url;
      if (typeof url === "string" && urls.length) {
        const ok = urls.some((allowed) => hostMatchesAllowed(url, allowed));
        if (!ok) {
          return fail("DENY", `URL not in allowed_urls: ${url}`, condition.kind);
        }
      }
      return pass(condition.kind);
    }

    case "intent_category": {
      const categories = (condition.params?.categories as string[]) ?? [];
      if (categories.length === 0) return pass(condition.kind);
      if (!ctx.intent) {
        return fail(
          "DENY",
          "execution intent required (category) but not provided",
          condition.kind,
        );
      }
      const category = ctx.intent.category.toLowerCase();
      if (!categories.includes(category)) {
        return fail(
          "DENY",
          `intent category not allowed: ${ctx.intent.category} (allowed: ${categories.join(", ")})`,
          condition.kind,
        );
      }
      return pass(condition.kind);
    }

    case "intent_action": {
      const actions = (condition.params?.actions as string[]) ?? [];
      if (actions.length === 0) return pass(condition.kind);
      if (!ctx.intent?.action) {
        return fail(
          "DENY",
          "execution intent action required but not provided",
          condition.kind,
        );
      }
      const action = ctx.intent.action.toLowerCase();
      if (!actions.includes(action)) {
        return fail(
          "DENY",
          `intent action not allowed: ${ctx.intent.action} (allowed: ${actions.join(", ")})`,
          condition.kind,
        );
      }
      return pass(condition.kind);
    }

    default:
      return pass(condition.kind);
  }
}

function evaluateNode(node: PolicyNode, ctx: AstEvaluationContext): AstEvaluationResult {
  if (isAndNode(node)) {
    if (node.conditions.length === 0) {
      return { decision: "ALLOW", evaluatedConditions: [] };
    }
    const allTraces: NonNullable<AstEvaluationResult["evaluatedConditions"]> = [];
    for (const child of node.conditions) {
      const result = evaluateNode(child, ctx);
      if (result.evaluatedConditions) allTraces.push(...result.evaluatedConditions);
      if (result.decision !== "ALLOW") {
        return { ...result, evaluatedConditions: allTraces };
      }
    }
    return { decision: "ALLOW", evaluatedConditions: allTraces };
  }

  if (isConditionNode(node)) {
    return evaluateCondition(node, ctx);
  }

  return { decision: "ALLOW" };
}

/** Evaluate a compiled policy document against a payload. */
export function evaluatePolicyAst(
  doc: PolicyDocument,
  ctx: AstEvaluationContext,
): AstEvaluationResult {
  const enriched: AstEvaluationContext = { ...ctx, tool: doc.tool };
  const result = evaluateNode(doc.root, enriched);
  if (ctx.simulate && result.decision === "ALLOW") {
    return {
      ...result,
      decision: "SIMULATE",
      reason: "would allow",
    };
  }
  return result;
}
