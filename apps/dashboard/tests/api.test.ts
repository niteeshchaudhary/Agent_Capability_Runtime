import { describe, expect, it } from "vitest";
import { GatewayClient } from "../src/api.js";

describe("GatewayClient", () => {
  it("sends admin bearer on grant", async () => {
    const calls: { url: string; headers: HeadersInit }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} });
      return new Response(
        JSON.stringify({ token: "t", claims: { sub: "a" } }),
        { status: 201 },
      );
    }) as typeof fetch;

    const client = new GatewayClient({
      baseUrl: "http://gw",
      adminKey: "secret-key",
      fetchFn,
    });

    await client.grant({
      agentId: "a",
      tool: "gmail.send",
      constraints: { maxActions: 1 },
    });

    expect(calls[0]?.url).toBe("http://gw/capabilities/grant");
    const headers = calls[0]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  it("lists audit events", async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({ events: [{ id: "1", agentId: "a", tool: "t", decision: "ALLOW" }] }),
        { status: 200 },
      )) as typeof fetch;

    const client = new GatewayClient({ baseUrl: "", fetchFn });
    const { events } = await client.listAudit({ limit: 10 });
    expect(events[0]?.decision).toBe("ALLOW");
  });
});
