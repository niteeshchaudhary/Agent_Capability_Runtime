import { describe, expect, it } from "vitest";
import { delegateCapability, grantCapability } from "./index.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("delegateCapability", () => {
  it("creates child token with lineage", async () => {
    const parent = await grantCapability(
      {
        agentId: "planner_agent",
        tool: "gmail.send",
        constraints: { maxActions: 10 },
        delegator: "user_root",
      },
      { secret: SECRET },
    );

    const child = await delegateCapability(
      parent.token,
      {
        agentId: "executor_agent",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"], maxActions: 3 },
        delegator: "planner_agent",
      },
      { secret: SECRET },
    );

    expect(child.claims.parent_jti).toBe(parent.claims.jti);
    expect(child.claims.delegation_depth).toBe(1);
    expect(child.claims.delegator_chain).toContain("user_root");
    expect(child.claims.delegator_chain).toContain("planner_agent");
  });

  it("rejects constraint escalation on delegate", async () => {
    const parent = await grantCapability(
      {
        agentId: "planner",
        tool: "gmail.send",
        constraints: { maxActions: 2, allowedDomains: ["company.com"] },
      },
      { secret: SECRET },
    );

    await expect(
      delegateCapability(
        parent.token,
        {
          agentId: "executor",
          tool: "gmail.send",
          constraints: { maxActions: 99 },
        },
        { secret: SECRET },
      ),
    ).rejects.toThrow(/escalation/);
  });

  it("rejects delegation beyond max depth", async () => {
    let token = (
      await grantCapability(
        { agentId: "a", tool: "slack.send", constraints: {}, delegationDepth: 0 },
        { secret: SECRET },
      )
    ).token;

    for (let i = 0; i < 8; i++) {
      const next = await delegateCapability(
        token,
        { agentId: `agent_${i}`, tool: "slack.send", constraints: {} },
        { secret: SECRET, maxDelegationDepth: 8 },
      );
      token = next.token;
    }

    await expect(
      delegateCapability(
        token,
        { agentId: "too_deep", tool: "slack.send", constraints: {} },
        { secret: SECRET, maxDelegationDepth: 8 },
      ),
    ).rejects.toThrow(/exceeds maximum/);
  });
});
