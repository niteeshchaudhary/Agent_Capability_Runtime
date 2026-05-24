import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("sandboxed runtime execution", () => {
  it("denies http.request to private network even when policy URL might pass host check", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
      sandbox: { enabled: true, blockPrivateNetworks: true },
    });

    const { token } = await runtime.grant({
      agentId: "agent_1",
      tool: "http.request",
      constraints: { allowedMethods: ["GET"], allowedUrls: ["127.0.0.1"], maxActions: 5 },
    });

    const result = await runtime.execute({
      token,
      tool: "http.request",
      payload: { url: "http://127.0.0.1/internal", method: "GET" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/sandbox|blocked|private/i);
      expect(result.code).toBe("sandbox_denied");
    }
  });

});
