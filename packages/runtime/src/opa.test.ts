import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("OPA/Rego backend", () => {
  it("denies execute when OPA returns DENY in enforce mode", async () => {
    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          result: {
            acr: {
              decision: { decision: "DENY", reason: "blocked by org rego" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
      opa: {
        url: "http://opa.test",
        mode: "enforce",
        fetchFn: mockFetch,
      },
    });

    try {
      const { token } = await runtime.grant({
        agentId: "agent_opa",
        tool: "slack.send",
        constraints: {},
      });

      const result = await runtime.execute({
        token,
        tool: "slack.send",
        payload: { channel: "#ops", text: "hi" },
      });

      expect(result.ok).toBe(false);
      if (!result.ok && result.decision === "DENY") {
        expect(result.reason).toContain("org rego");
        expect(result.code).toBe("policy_denied");
      }
    } finally {
      void 0;
    }
  });

  it("allows execute in OPA shadow mode when Rego would deny", async () => {
    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          result: {
            acr: { decision: { decision: "DENY", reason: "shadow only" } },
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
      opa: {
        url: "http://opa.test",
        mode: "shadow",
        fetchFn: mockFetch,
      },
    });

    try {
      const { token } = await runtime.grant({
        agentId: "agent_shadow",
        tool: "slack.send",
        constraints: {},
      });

      const result = await runtime.execute({
        token,
        tool: "slack.send",
        payload: { channel: "#ops", text: "hi" },
      });

      expect(result.ok).toBe(true);
    } finally {
      void 0;
    }
  });
});
