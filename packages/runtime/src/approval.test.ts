import { describe, expect, it, vi } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("approval workflow", () => {
  it("pauses, approves, and resumes execution", async () => {
    const hook = vi.fn();
    const runtime = new AgentCapabilityRuntime(
      {
        secret: SECRET,
        adapters: { mode: "stub" },
        onApprovalRequired: hook,
      },
    );

    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { approvalRequired: true, maxActions: 5 },
    });

    const pending = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "john@company.com", subject: "Hi", body: "Hello" },
    });

    expect(pending.ok).toBe(false);
    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      expect(pending.approvalId).toMatch(/^appr_/);
      expect(hook).toHaveBeenCalledOnce();

      runtime.approve(pending.approvalId, "user_42");

      const allowed = await runtime.execute({
        token,
        tool: "gmail.send",
        payload: { to: "john@company.com", subject: "Hi", body: "Hello" },
        approvalId: pending.approvalId,
      });

      expect(allowed.ok).toBe(true);
      if (allowed.ok) {
        expect(allowed.decision).toBe("ALLOW");
      }
    }
  });

  it("requires approval for external domain when configured", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: {
        allowedDomains: ["company.com"],
        approvalRequiredIfExternal: true,
      },
    });

    const pending = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "john@gmail.com", subject: "Hi" },
    });

    expect(pending.ok).toBe(false);
    if (!pending.ok) {
      expect(pending.decision).toBe("REQUIRE_APPROVAL");
    }
  });

  it("rejects execute when approval does not match payload", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });

    const pending = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "a@company.com", subject: "Hi" },
    });

    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      runtime.approve(pending.approvalId);

      const denied = await runtime.execute({
        token,
        tool: "gmail.send",
        payload: { to: "b@company.com", subject: "Hi" },
        approvalId: pending.approvalId,
      });

      expect(denied.ok).toBe(false);
      if (!denied.ok && denied.decision === "DENY") {
        expect(denied.reason).toMatch(/does not match/);
      }
    }
  });
});
