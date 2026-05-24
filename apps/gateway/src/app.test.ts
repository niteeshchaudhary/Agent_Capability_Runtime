import { describe, expect, it } from "vitest";
import { AgentCapabilityRuntime } from "@acr/runtime";
import { createApp } from "./app.js";

const SECRET = "test-signing-secret-min-32-characters!!";
const ADMIN_KEY = "test-admin-api-key-32-characters-min!!";

function makeRuntime() {
  return new AgentCapabilityRuntime({
    secret: SECRET,
    adapters: { mode: "stub" },
  });
}

describe("gateway routes", () => {
  it("GET /health returns ok", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
  });

  it("POST /capabilities/grant returns 201", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/capabilities/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_gw",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"] },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; claims: { sub: string } };
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.claims.sub).toBe("agent_gw");
  });

  it("POST /capabilities/grant returns 401 without admin key when configured", async () => {
    const app = createApp(makeRuntime(), { adminAuth: { apiKeys: [ADMIN_KEY] } });
    const res = await app.request("/capabilities/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "a",
        tool: "gmail.send",
        constraints: {},
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /capabilities/grant returns 201 with valid admin key", async () => {
    const app = createApp(makeRuntime(), { adminAuth: { apiKeys: [ADMIN_KEY] } });
    const res = await app.request("/capabilities/grant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        agentId: "agent_secured",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"] },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string };
    expect(body.token.split(".")).toHaveLength(3);
  });

  it("POST /capabilities/delegate returns 401 without admin key when configured", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime, { adminAuth: { apiKeys: [ADMIN_KEY] } });
    const { token: parentToken } = await runtime.grant({
      agentId: "p",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
    });
    const res = await app.request("/capabilities/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentToken,
        agentId: "c",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"] },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /capabilities/revoke returns 200 and blocks execute", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime, { adminAuth: { apiKeys: [ADMIN_KEY] } });
    const { token, claims } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: {},
    });

    const revokeRes = await app.request("/capabilities/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({ capabilityId: claims.jti, reason: "test revoke" }),
    });
    expect(revokeRes.status).toBe(200);

    const execRes = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "slack.send",
        payload: { channel: "#x", text: "y" },
      }),
    });
    expect(execRes.status).toBe(403);
    const body = (await execRes.json()) as { code: string };
    expect(body.code).toBe("token_revoked");
  });

  it("GET /adapters/capabilities lists tools", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/adapters/capabilities");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capabilities: { tool: string }[] };
    expect(body.capabilities.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /capabilities/grant returns 400 for invalid body", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/capabilities/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "a" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /capabilities/delegate returns 201 with subset constraints", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token: parentToken } = await runtime.grant({
      agentId: "parent_agent",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"], maxActions: 5 },
    });
    const res = await app.request("/capabilities/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentToken,
        agentId: "child_agent",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"], maxActions: 2 },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      token: string;
      claims: { sub: string; parent_jti?: string; delegation_depth?: number };
    };
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.claims.sub).toBe("child_agent");
    expect(body.claims.parent_jti).toBeDefined();
    expect(body.claims.delegation_depth).toBe(1);
  });

  it("POST /capabilities/delegate returns 400 when constraints widen parent", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token: parentToken } = await runtime.grant({
      agentId: "parent",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
    });
    const res = await app.request("/capabilities/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentToken,
        agentId: "child",
        tool: "gmail.send",
        constraints: { allowedDomains: ["evil.com"] },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /runtime/execute returns 200 on allow", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: {},
    });
    const res = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "slack.send",
        payload: { channel: "#ops", text: "hi" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decision: string };
    expect(body.decision).toBe("ALLOW");
  });

  it("POST /runtime/execute returns 403 on policy deny", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
    });
    const res = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "gmail.send",
        payload: { to: "x@gmail.com", subject: "Hi" },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /runtime/execute returns 202 on approval required", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const res = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "gmail.send",
        payload: { to: "a@co.com", subject: "Hi" },
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { approvalId: string };
    expect(body.approvalId).toMatch(/^appr_/);
  });

  it("POST /runtime/execute returns 401 for invalid token", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "bad.token.here",
        tool: "gmail.send",
        payload: { to: "a@co.com" },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /runtime/execute returns 200 SIMULATE without adapter side effects", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: {},
    });
    const res = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "slack.send",
        payload: { channel: "#ops", text: "dry-run" },
        simulate: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decision: string; evaluatedConditions?: unknown[] };
    expect(body.decision).toBe("SIMULATE");
    expect(body.evaluatedConditions).toBeDefined();
  });

  it("GET /audit lists events", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: {},
    });
    await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#x", text: "y" },
    });
    const res = await app.request("/audit");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /audit returns 400 for invalid limit", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/audit?limit=-1");
    expect(res.status).toBe(400);
  });

  it("GET /audit/verify reports chain status", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
      auditChain: {
        enabled: true,
        signingSecret: "audit-chain-signing-secret-min-32-chars!!",
      },
    });
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "slack.send",
      constraints: {},
    });
    await runtime.execute({
      token,
      tool: "slack.send",
      payload: { channel: "#x", text: "y" },
    });

    const res = await app.request("/audit/verify");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; valid: boolean };
    expect(body.enabled).toBe(true);
    expect(body.valid).toBe(true);
  });

  it("approval workflow via HTTP", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const payload = { to: "a@co.com", subject: "Hi" };

    const pendingRes = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, tool: "gmail.send", payload }),
    });
    const pending = (await pendingRes.json()) as { approvalId: string };
    expect(pendingRes.status).toBe(202);

    const approveRes = await app.request(`/approvals/${pending.approvalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolvedBy: "user_1" }),
    });
    expect(approveRes.status).toBe(200);

    const allowRes = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "gmail.send",
        payload,
        approvalId: pending.approvalId,
      }),
    });
    expect(allowRes.status).toBe(200);
  });

  it("GET /approvals/:id returns 404 when missing", async () => {
    const app = createApp(makeRuntime());
    const res = await app.request("/approvals/appr_missing");
    expect(res.status).toBe(404);
  });

  it("POST /approvals/:id/approve returns 400 when already approved", async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const { token } = await runtime.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const execRes = await app.request("/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        tool: "gmail.send",
        payload: { to: "a@co.com", subject: "Hi" },
      }),
    });
    const { approvalId } = (await execRes.json()) as { approvalId: string };
    await app.request(`/approvals/${approvalId}/approve`, { method: "POST" });
    const again = await app.request(`/approvals/${approvalId}/approve`, { method: "POST" });
    expect(again.status).toBe(400);
  });
});
