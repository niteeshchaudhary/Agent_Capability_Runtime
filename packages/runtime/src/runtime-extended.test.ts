import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentCapabilityRuntime } from "./runtime.js";
import { createAuditStore, createApprovalStore } from "./stores.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("AgentCapabilityRuntime (extended)", () => {
  it("maps invalid token to invalid_token code", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const result = await runtime.execute({
      token: "not.a.valid.jwt.token",
      tool: "gmail.send",
      payload: { to: "a@co.com" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.decision === "DENY") {
      expect(result.code).toBe("invalid_token");
    }
    expect(runtime.audit.list()[0]?.agentId).toBe("unknown");
  });

  it("denies when approvalId not found", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: {},
    });
    const result = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "a@co.com" },
      approvalId: "appr_does_not_exist",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not found/);
    }
  });

  it("denies when approval is pending (not approved)", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const payload = { to: "a@co.com", subject: "Hi" };
    const pending = await runtime.execute({ token, tool: "gmail.send", payload });
    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      const denied = await runtime.execute({
        token,
        tool: "gmail.send",
        payload,
        approvalId: pending.approvalId,
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.reason).toMatch(/does not match/);
      }
    }
  });

  it("denies after approval was rejected", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const payload = { to: "a@co.com", subject: "Hi" };
    const pending = await runtime.execute({ token, tool: "gmail.send", payload });
    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      runtime.reject(pending.approvalId);
      const denied = await runtime.execute({
        token,
        tool: "gmail.send",
        payload,
        approvalId: pending.approvalId,
      });
      expect(denied.ok).toBe(false);
    }
  });

  it("denies adapter validation errors with audit", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: {},
    });
    const result = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { subject: "missing to" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/requires payload.to/);
    }
  });

  it("executes slack.send through runtime", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: { maxActions: 5 },
    });
    const result = await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#ops", text: "deployed" },
    });
    expect(result.ok).toBe(true);
  });

  it("enforces http.request policy through runtime", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "http.request",
      constraints: { allowedMethods: ["GET"], allowedUrls: ["api.example.com"] },
    });

    const denied = await runtime.execute({
      token,
      tool: "http.request",
      payload: { url: "https://evil.com", method: "GET" },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toMatch(/allowed_urls/);
    }
  });

  it("invokes onApprovalRequired hook", async () => {
    const hook = vi.fn();
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
      onApprovalRequired: hook,
    });
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "a@co.com", subject: "Hi" },
    });
    expect(hook).toHaveBeenCalledOnce();
  });

  it("createAuditStore and createApprovalStore use file paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "acr-stores-"));
    const auditPath = join(dir, "audit.jsonl");
    const approvalPath = join(dir, "approvals.json");
    const audit = createAuditStore({ secret: SECRET, auditPath });
    const approvals = createApprovalStore({ secret: SECRET, approvalPath });
    const event = audit.record({
      agentId: "a",
      tool: "t",
      decision: "ALLOW",
    });
    expect(event.id).toMatch(/^aud_/);
    const appr = approvals.create({
      agentId: "a",
      tool: "gmail.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: event.id,
    });
    expect(appr.id).toMatch(/^appr_/);
  });
});
