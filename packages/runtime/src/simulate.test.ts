import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("policy simulation", () => {
  it("returns SIMULATE without consuming actions", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token, claims } = await runtime.grant({
      agentId: "agent_1",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"], maxActions: 1 },
    });

    const result = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Hi", body: "Test" },
      simulate: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toBe("SIMULATE");
    }
    expect(await runtime.consumption.get(claims.jti)).toBe(0);
  });

  it("records policy snapshot and requestId in audit", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "slack.send",
      constraints: { maxActions: 1 },
      delegator: "user_1",
    });

    await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#ops", text: "hi" },
      requestId: "req_unique_1",
    });

    const event = runtime.audit.list().find((e) => e.decision === "ALLOW");
    expect(event?.policySnapshot).toEqual({ maxActions: 1 });
    expect(event?.requestId).toBe("req_unique_1");
    expect(event?.delegator).toBe("user_1");
  });
});
