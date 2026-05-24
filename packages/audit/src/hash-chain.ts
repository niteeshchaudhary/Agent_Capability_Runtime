import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuditEvent } from "./types.js";
import type { ResolvedAuditChainConfig } from "./audit-chain-config.js";

export interface AuditChainVerification {
  enabled: boolean;
  valid: boolean;
  eventCount: number;
  errors: string[];
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) sorted[key] = canonicalize(v);
  }
  return sorted;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Stable payload for hashing — excludes derived chain fields. */
export function hashableAuditBody(
  event: AuditEvent,
  hashPrev: string,
  sequence: number,
): Record<string, unknown> {
  return {
    sequence,
    hashPrev,
    id: event.id,
    agentId: event.agentId,
    tool: event.tool,
    decision: event.decision,
    timestamp: event.timestamp,
    ...(event.reason !== undefined ? { reason: event.reason } : {}),
    ...(event.delegator !== undefined ? { delegator: event.delegator } : {}),
    ...(event.jti !== undefined ? { jti: event.jti } : {}),
    ...(event.task !== undefined ? { task: event.task } : {}),
    ...(event.intent !== undefined ? { intent: event.intent } : {}),
    ...(event.intentCategory !== undefined ? { intentCategory: event.intentCategory } : {}),
    ...(event.intentAction !== undefined ? { intentAction: event.intentAction } : {}),
    ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
    ...(event.policyVersionId !== undefined ? { policyVersionId: event.policyVersionId } : {}),
    ...(event.traceId !== undefined ? { traceId: event.traceId } : {}),
    ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
    ...(event.executionPhase !== undefined ? { executionPhase: event.executionPhase } : {}),
    ...(event.payloadSummary !== undefined ? { payloadSummary: event.payloadSummary } : {}),
    ...(event.approvalId !== undefined ? { approvalId: event.approvalId } : {}),
    ...(event.policySnapshot !== undefined ? { policySnapshot: event.policySnapshot } : {}),
    ...(event.lineage !== undefined ? { lineage: event.lineage } : {}),
  };
}

export function computeEventHash(
  hashPrev: string,
  event: AuditEvent,
  sequence: number,
): string {
  const body = hashableAuditBody(event, hashPrev, sequence);
  return createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
}

export function signEventHash(hash: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(hash, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyAuditChain(
  events: AuditEvent[],
  config: ResolvedAuditChainConfig,
): AuditChainVerification {
  if (!config.enabled) {
    return { enabled: false, valid: true, eventCount: events.length, errors: [] };
  }

  const errors: string[] = [];
  let expectedPrev = config.genesisHash;

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const seq = event.sequence ?? i + 1;

    if (event.hashPrev !== expectedPrev) {
      errors.push(`event ${event.id}: hashPrev mismatch at sequence ${seq}`);
    }

    if (event.hash === undefined) {
      errors.push(`event ${event.id}: missing hash`);
      continue;
    }

    const recomputed = computeEventHash(expectedPrev, event, seq);
    if (event.hash !== recomputed) {
      errors.push(`event ${event.id}: hash mismatch (tampered or schema drift)`);
    }

    if (config.signingSecret) {
      if (!event.signature) {
        errors.push(`event ${event.id}: missing signature`);
      } else {
        const expectedSig = signEventHash(event.hash, config.signingSecret);
        if (!safeEqualHex(event.signature, expectedSig)) {
          errors.push(`event ${event.id}: invalid signature`);
        }
      }
    }

    expectedPrev = event.hash;
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    eventCount: events.length,
    errors,
  };
}

export function restoreChainTip(events: AuditEvent[]): {
  tipHash: string;
  sequence: number;
} {
  if (events.length === 0) {
    return { tipHash: "0000000000000000000000000000000000000000000000000000000000000000", sequence: 0 };
  }
  const sorted = [...events].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const last = sorted[sorted.length - 1]!;
  return {
    tipHash: last.hash ?? "0000000000000000000000000000000000000000000000000000000000000000",
    sequence: last.sequence ?? sorted.length,
  };
}
