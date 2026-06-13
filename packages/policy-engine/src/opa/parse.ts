import type { RuntimeDecision } from "../evaluate-ast.js";
import type { OpaDecision } from "./types.js";

const VALID: ReadonlySet<string> = new Set([
  "ALLOW",
  "DENY",
  "REQUIRE_APPROVAL",
  "SIMULATE",
]);

function normalizeDecision(raw: unknown): RuntimeDecision | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.toUpperCase();
  return VALID.has(upper) ? (upper as RuntimeDecision) : undefined;
}

/**
 * Parse OPA `data.acr.decision` (or compatible) into an ACR runtime decision.
 *
 * Supported shapes:
 * - `{ "decision": "DENY", "reason": "..." }`
 * - `{ "allow": false, "reason": "..." }`  (maps deny → DENY, allow → ALLOW)
 * - bare string `"DENY"`
 */
export function parseOpaDecision(value: unknown): OpaDecision | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const decision = normalizeDecision(value);
    return decision ? { decision } : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const direct = normalizeDecision(obj.decision);
  if (direct) {
    return {
      decision: direct,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    };
  }

  if (typeof obj.allow === "boolean") {
    if (obj.allow) {
      return { decision: "ALLOW" };
    }
    const reason =
      typeof obj.reason === "string" ? obj.reason : "denied by OPA policy";
    const approval = normalizeDecision(obj.approval);
    if (approval === "REQUIRE_APPROVAL") {
      return { decision: "REQUIRE_APPROVAL", reason };
    }
    return { decision: "DENY", reason };
  }

  return null;
}

/** Extract decision from OPA HTTP `/v1/data/...` JSON body. */
export function parseOpaHttpResponse(body: unknown, decisionPath: string): OpaDecision | null {
  if (body === null || typeof body !== "object") {
    return null;
  }

  const result = (body as { result?: unknown }).result;
  if (result === undefined || result === null) {
    return null;
  }

  const segments = decisionPath.split("/").filter(Boolean);
  let current: unknown = result;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return parseOpaDecision(current);
}
