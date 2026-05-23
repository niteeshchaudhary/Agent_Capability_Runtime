import type { ConstraintSet, ToolId } from "@acr/capability-token";

export type RuntimeDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyEvaluationContext {
  tool: ToolId;
  constraints: ConstraintSet;
  payload: Record<string, unknown>;
  /** Successful executions already consumed for this token jti */
  actionCount?: number;
  /** When true, skip approval_required / approval_required_if_external checks */
  approvalGranted?: boolean;
  /** Override for tests; defaults to current UTC hour */
  nowUtcHour?: number;
}

export interface PolicyEvaluationResult {
  decision: RuntimeDecision;
  reason?: string;
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

/**
 * Evaluate constraints against a tool payload (Day 1 schema + Day 4–7 runtime hook).
 */
export function evaluatePolicy(ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  const { constraints, payload, tool } = ctx;
  const hour = ctx.nowUtcHour ?? new Date().getUTCHours();

  if (constraints.allowedHours !== undefined) {
    const { start, end } = constraints.allowedHours;
    if (hour < start || hour > end) {
      return {
        decision: "DENY",
        reason: `execution outside allowed hours (${start}–${end} UTC)`,
      };
    }
  }

  if (constraints.maxActions !== undefined && (ctx.actionCount ?? 0) >= constraints.maxActions) {
    return {
      decision: "DENY",
      reason: "max_actions exceeded",
    };
  }

  if (constraints.approvalRequired && !ctx.approvalGranted) {
    return {
      decision: "REQUIRE_APPROVAL",
      reason: "approval_required constraint",
    };
  }

  if (tool === "gmail.send") {
    const domain = extractEmailDomain(payload.to);
    if (domain && constraints.allowedDomains?.length) {
      const allowed = constraints.allowedDomains.map((d) => d.toLowerCase());
      if (!allowed.includes(domain)) {
        if (constraints.approvalRequiredIfExternal && !ctx.approvalGranted) {
          return {
            decision: "REQUIRE_APPROVAL",
            reason: `external domain requires approval: ${domain}`,
          };
        }
        return {
          decision: "DENY",
          reason: `external domain blocked: ${domain}`,
        };
      }
    }

    if (constraints.attachments === false && payload.attachments) {
      return { decision: "DENY", reason: "attachments not permitted" };
    }
  }

  if (tool === "http.request") {
    const method = String(payload.method ?? "GET").toUpperCase();
    if (constraints.allowedMethods?.length && !constraints.allowedMethods.includes(method)) {
      return { decision: "DENY", reason: `HTTP method ${method} not allowed` };
    }

    const url = payload.url;
    if (typeof url === "string" && constraints.allowedUrls?.length) {
      const ok = constraints.allowedUrls.some((allowed) => hostMatchesAllowed(url, allowed));
      if (!ok) {
        return { decision: "DENY", reason: `URL not in allowed_urls: ${url}` };
      }
    }
  }

  return { decision: "ALLOW" };
}

export type { ConstraintSet, ToolId };
