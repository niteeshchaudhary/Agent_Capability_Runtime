import { describe, expect, it } from "vitest";
import { resolveAuditChainConfig } from "./audit-chain-config.js";
import { AuditLog } from "./audit-log.js";
import { computeEventHash, verifyAuditChain } from "./hash-chain.js";
import { buildAuditEvent } from "./build-event.js";

describe("audit hash chain", () => {
  it("does not add chain fields when disabled", () => {
    const log = new AuditLog(resolveAuditChainConfig({ enabled: false }));
    const event = log.record({
      agentId: "a1",
      tool: "gmail.send",
      decision: "ALLOW",
    });
    expect(event.hash).toBeUndefined();
    expect(event.sequence).toBeUndefined();
  });

  it("chains events with hash and optional signature", () => {
    const chain = resolveAuditChainConfig({
      enabled: true,
      signingSecret: "audit-chain-signing-secret-min-32-chars!!",
    });
    const log = new AuditLog(chain);

    const e1 = log.record({ agentId: "a1", tool: "gmail.send", decision: "ALLOW" });
    const e2 = log.record({ agentId: "a1", tool: "gmail.send", decision: "DENY", reason: "blocked" });

    expect(e1.sequence).toBe(1);
    expect(e1.hashPrev).toBe(chain.genesisHash);
    expect(e1.hash).toHaveLength(64);
    expect(e1.signature).toHaveLength(64);

    expect(e2.sequence).toBe(2);
    expect(e2.hashPrev).toBe(e1.hash);
    expect(e2.hash).not.toBe(e1.hash);

    const verification = log.verifyChain();
    expect(verification.enabled).toBe(true);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("detects tampering", () => {
    const chain = resolveAuditChainConfig({ enabled: true });
    const log = new AuditLog(chain);
    const event = log.record({ agentId: "a1", tool: "slack.send", decision: "ALLOW" });

    const tampered = { ...event, decision: "DENY" as const };
    const result = verifyAuditChain([tampered], chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hash mismatch"))).toBe(true);
  });

  it("recomputes hash deterministically", () => {
    const event = buildAuditEvent({
      agentId: "a1",
      tool: "http.request",
      decision: "SIMULATE",
      requestId: "req_1",
    });
    const genesis = "0".repeat(64);
    const h1 = computeEventHash(genesis, event, 1);
    const h2 = computeEventHash(genesis, event, 1);
    expect(h1).toBe(h2);
  });
});
