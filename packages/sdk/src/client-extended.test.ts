import { afterEach, describe, expect, it, vi } from "vitest";
import { AcrClient } from "./client.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("AcrClient HTTP", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strips trailing slash from baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        token: "tok",
        claims: {},
        expiresAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AcrClient({ baseUrl: "http://localhost:3000/" });
    await client.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: {},
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3000/capabilities/grant");
  });

  it("maps HTTP execute 200 ALLOW", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          decision: "ALLOW",
          result: { status: "sent" },
          auditId: "aud_1",
        }),
      }),
    );

    const client = new AcrClient({ baseUrl: "http://localhost:3000" });
    const result = await client.execute({
      token: "tok",
      tool: "gmail.send",
      payload: { to: "a@co.com" },
    });
    expect(result.ok).toBe(true);
  });

  it("maps HTTP execute 202 REQUIRE_APPROVAL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({
          decision: "REQUIRE_APPROVAL",
          approvalId: "appr_1",
          reason: "needs approval",
          auditId: "aud_1",
        }),
      }),
    );

    const client = new AcrClient({ baseUrl: "http://localhost:3000" });
    const result = await client.execute({
      token: "tok",
      tool: "gmail.send",
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.decision).toBe("REQUIRE_APPROVAL");
      expect(result.approvalId).toBe("appr_1");
    }
  });

  it("maps HTTP execute 401 token_expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          decision: "DENY",
          reason: "expired",
          auditId: "aud_1",
          code: "token_expired",
        }),
      }),
    );

    const client = new AcrClient({ baseUrl: "http://localhost:3000" });
    const result = await client.execute({
      token: "tok",
      tool: "gmail.send",
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.decision === "DENY") {
      expect(result.code).toBe("token_expired");
    }
  });

  it("throws on grant HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "bad request" }),
      }),
    );

    const client = new AcrClient({ baseUrl: "http://localhost:3000" });
    await expect(
      client.grant({ agentId: "a", tool: "gmail.send", constraints: {} }),
    ).rejects.toThrow(/bad request/);
  });

  it("sends admin Bearer on grant when adminApiKey is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        token: "tok",
        claims: {},
        expiresAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AcrClient({
      baseUrl: "http://localhost:3000",
      adminApiKey: "admin-secret-key-32-chars-minimum!!",
    });
    await client.grant({ agentId: "a", tool: "gmail.send", constraints: {} });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer admin-secret-key-32-chars-minimum!!");
  });

  it("POST /capabilities/delegate over HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        token: "child.tok",
        claims: { sub: "child", parent_jti: "cap_parent" },
        expiresAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AcrClient({ baseUrl: "http://localhost:3000" });
    const result = await client.delegate("parent.tok", {
      agentId: "child",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
    });
    expect(result.token).toBe("child.tok");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3000/capabilities/delegate");
  });
});

describe("AcrClient approval (local)", () => {
  it("listApprovals, approve, reject, and resume", async () => {
    const client = new AcrClient({
      baseUrl: "http://unused",
      local: { secret: SECRET, adapters: { mode: "stub" } },
    });

    const { token } = await client.grant({
      agentId: "agent_sdk",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });

    const payload = { to: "a@company.com", subject: "Hi" };
    const pending = await client.execute({ token, tool: "gmail.send", payload });
    expect(pending.ok).toBe(false);
    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      const list = await client.listApprovals({ status: "pending" });
      expect(list.approvals.length).toBeGreaterThanOrEqual(1);

      await client.approve(pending.approvalId, "reviewer");

      const allowed = await client.execute({
        token,
        tool: "gmail.send",
        payload,
        approvalId: pending.approvalId,
      });
      expect(allowed.ok).toBe(true);
    }

    expect(client.getRuntime()).toBeDefined();
  });

  it("reject prevents resume", async () => {
    const client = new AcrClient({
      baseUrl: "http://unused",
      local: { secret: SECRET, adapters: { mode: "stub" } },
    });
    const { token } = await client.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { approvalRequired: true },
    });
    const payload = { to: "a@co.com", subject: "x" };
    const pending = await client.execute({ token, tool: "gmail.send", payload });
    if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
      await client.reject(pending.approvalId);
      const denied = await client.execute({
        token,
        tool: "gmail.send",
        payload,
        approvalId: pending.approvalId,
      });
      expect(denied.ok).toBe(false);
    }
  });
});
