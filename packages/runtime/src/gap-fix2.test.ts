import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("capability revocation", () => {
  it("revoke blocks subsequent execute", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token, claims } = await runtime.grant({
      agentId: "agent_1",
      tool: "slack.send",
      constraints: {},
    });

    await runtime.revoke(claims.jti, { reason: "compromised agent" });

    const result = await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#ops", text: "hi" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.decision === "DENY") {
      expect(result.code).toBe("token_revoked");
      expect(result.executionPhase).toBe("REVOKED");
    }
  });
});

describe("policy versioning", () => {
  it("embeds policy_version_id in grant metadata", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { claims } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { allowedDomains: ["co.com"] },
    });

    const versionId = claims.metadata?.policy_version_id;
    expect(typeof versionId).toBe("string");
    expect(runtime.policyVersions.has(versionId as string)).toBe(true);
  });
});

describe("execution session and trace", () => {
  it("tracks session state across executes", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });

    const { token } = await runtime.grant({
      agentId: "agent_sess",
      tool: "slack.send",
      constraints: { maxActions: 5 },
    });

    const result = await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#x", text: "y" },
      sessionId: "sess_abc",
      traceId: "trace_123",
      requestId: "req_1",
    });

    expect(result.ok).toBe(true);
    const session = runtime.sessions.get("sess_abc");
    expect(session?.lastPhase).toBe("COMPLETED");
    expect(session?.traceId).toBe("trace_123");
    expect(session?.actionCount).toBe(1);

    const audit = runtime.audit.list().find((e) => e.decision === "ALLOW");
    expect(audit?.traceId).toBe("trace_123");
    expect(audit?.sessionId).toBe("sess_abc");
    expect(audit?.policyVersionId).toBeDefined();
    expect(audit?.executionPhase).toBe("COMPLETED");
  });
});
