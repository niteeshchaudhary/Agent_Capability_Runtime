import { describe, expect, it } from "vitest";
import { AcrClient } from "./client.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("AcrClient (local)", () => {
  it("grants and executes in-process", async () => {
    const client = new AcrClient({
      baseUrl: "http://unused",
      local: { secret: SECRET, adapters: { mode: "stub" } },
    });

    const { token } = await client.grant({
      agentId: "agent_sdk",
      tool: "slack.send",
      constraints: { maxActions: 1 },
    });

    const result = await client.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#test", text: "hello" },
    });

    expect(result.ok).toBe(true);
  });
});
