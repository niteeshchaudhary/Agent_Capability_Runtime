import { describe, expect, it } from "vitest";
import { buildOpaInput } from "./input.js";
import { parseOpaDecision, parseOpaHttpResponse } from "./parse.js";
import { OpaPolicyBackend } from "./backend.js";
import { queryOpaHttp } from "./http-client.js";

describe("buildOpaInput", () => {
  it("maps execute context fields", () => {
    const input = buildOpaInput({
      agentId: "agent_1",
      tool: "gmail.send",
      payload: { to: "a@co.com" },
      constraints: { maxActions: 5 },
      actionCount: 2,
      approvalGranted: true,
      simulate: false,
      jti: "jti_1",
    });
    expect(input.agentId).toBe("agent_1");
    expect(input.tool).toBe("gmail.send");
    expect(input.actionCount).toBe(2);
    expect(input.approvalGranted).toBe(true);
  });
});

describe("parseOpaDecision", () => {
  it("parses decision object", () => {
    const d = parseOpaDecision({ decision: "DENY", reason: "blocked" });
    expect(d).toEqual({ decision: "DENY", reason: "blocked" });
  });

  it("parses allow boolean", () => {
    expect(parseOpaDecision({ allow: true })?.decision).toBe("ALLOW");
    expect(parseOpaDecision({ allow: false, reason: "nope" })?.decision).toBe("DENY");
  });

  it("returns null for empty", () => {
    expect(parseOpaDecision(undefined)).toBeNull();
  });
});

describe("parseOpaHttpResponse", () => {
  it("walks nested result path", () => {
    const body = { result: { acr: { decision: { decision: "DENY", reason: "x" } } } };
    const d = parseOpaHttpResponse(body, "acr/decision");
    expect(d?.decision).toBe("DENY");
  });
});

describe("queryOpaHttp", () => {
  it("POSTs input to OPA data API", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(
        JSON.stringify({ result: { acr: { decision: { decision: "DENY", reason: "org" } } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const decision = await queryOpaHttp(
      buildOpaInput({
        agentId: "a",
        tool: "slack.send",
        payload: {},
        constraints: {},
        actionCount: 0,
        approvalGranted: false,
        simulate: false,
      }),
      { url: "http://opa:8181", decisionPath: "acr/decision" },
      fetchFn,
    );

    expect(decision?.decision).toBe("DENY");
    expect(calls[0]?.url).toBe("http://opa:8181/v1/data/acr/decision");
    expect(JSON.parse(calls[0]?.body ?? "{}").input.tool).toBe("slack.send");
  });
});

describe("OpaPolicyBackend", () => {
  it("allows when OPA returns ALLOW", async () => {
    const backend = new OpaPolicyBackend(
      { url: "http://opa:8181", mode: "enforce" },
      (async () =>
        new Response(
          JSON.stringify({ result: { acr: { decision: { decision: "ALLOW" } } } }),
          { status: 200 },
        )) as typeof fetch,
    );
    const result = await backend.evaluate(
      buildOpaInput({
        agentId: "a",
        tool: "slack.send",
        payload: {},
        constraints: {},
        actionCount: 0,
        approvalGranted: false,
        simulate: false,
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks in enforce mode on DENY", async () => {
    const backend = new OpaPolicyBackend(
      { url: "http://opa:8181", mode: "enforce" },
      (async () =>
        new Response(
          JSON.stringify({
            result: { acr: { decision: { decision: "DENY", reason: "blocked" } } },
          }),
          { status: 200 },
        )) as typeof fetch,
    );
    const result = await backend.evaluate(
      buildOpaInput({
        agentId: "a",
        tool: "gmail.send",
        payload: { to: "x@blocked.example" },
        constraints: {},
        actionCount: 0,
        approvalGranted: false,
        simulate: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("DENY");
  });

  it("observes but allows in shadow mode", async () => {
    const backend = new OpaPolicyBackend(
      { url: "http://opa:8181", mode: "shadow" },
      (async () =>
        new Response(
          JSON.stringify({
            result: { acr: { decision: { decision: "DENY", reason: "would block" } } },
          }),
          { status: 200 },
        )) as typeof fetch,
    );
    const result = await backend.evaluate(
      buildOpaInput({
        agentId: "a",
        tool: "gmail.send",
        payload: {},
        constraints: {},
        actionCount: 0,
        approvalGranted: false,
        simulate: false,
      }),
    );
    expect(result.allowed).toBe(true);
    expect(result.shadowOnly).toBe(true);
    expect(result.decision).toBe("DENY");
  });
});
