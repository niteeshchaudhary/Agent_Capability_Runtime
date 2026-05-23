import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("AgentCapabilityRuntime", () => {
  const runtime = new AgentCapabilityRuntime({
    secret: SECRET,
    adapters: { mode: "stub" },
  });

  it("grants and allows company.com email", async () => {
    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"], maxActions: 5 },
    });

    const result = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "john@company.com", subject: "Hi", body: "Hello" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toBe("ALLOW");
      expect(result.result).toMatchObject({ status: "sent", to: "john@company.com" });
    }
  });

  it("denies external email domain", async () => {
    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
    });

    const result = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "john@gmail.com", subject: "Hi" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.decision === "DENY") {
      expect(result.code).toBe("policy_denied");
      expect(result.reason).toMatch(/external domain blocked/);
    }
  });

  it("enforces max_actions across executions", async () => {
    const rt = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await rt.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"], maxActions: 2 },
    });

    const payload = { to: "a@company.com", subject: "x" };

    expect((await rt.execute({ token, tool: "gmail.send", payload })).ok).toBe(true);
    expect((await rt.execute({ token, tool: "gmail.send", payload })).ok).toBe(true);

    const third = await rt.execute({ token, tool: "gmail.send", payload });
    expect(third.ok).toBe(false);
    if (!third.ok && third.decision === "DENY") {
      expect(third.reason).toMatch(/max_actions/);
    }
  });

  it("rejects tool mismatch", async () => {
    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: {},
    });

    const result = await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#general", text: "hi" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.decision === "DENY") {
      expect(result.code).toBe("tool_mismatch");
    }
  });

  it("records audit events", async () => {
    const rt = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await rt.grant({
      agentId: "agent_audit",
      tool: "slack.send",
      constraints: { maxActions: 10 },
    });

    await rt.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#ops", text: "deployed" },
    });

    expect(rt.audit.list().length).toBeGreaterThanOrEqual(1);
    expect(rt.audit.list()[0]?.agentId).toBe("agent_audit");
  });
});
