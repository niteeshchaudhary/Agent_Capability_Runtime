import { describe, expect, it, beforeAll } from "vitest";
import { McpToolGuard } from "./mcp-guard.js";

describe("McpToolGuard", () => {
  let guard: McpToolGuard;

  beforeAll(async () => {
    guard = McpToolGuard.fromConfig({
      agent_id: "test_agent",
      mode: "enforce",
      default_action: "deny",
      tools: {
        read_file: { acr_tool: "http.request", methods: ["GET"], max_actions: 10 },
        delete_file: { deny: true },
        search_repositories: {
          acr_tool: "http.request",
          methods: ["GET"],
          allowed_urls: ["github.com"],
          max_actions: 5,
        },
      },
    });
    await guard.init();
  });

  it("allows listed tool", async () => {
    const result = await guard.check("read_file", {
      url: "https://example.com/tmp/x",
      method: "GET",
    });
    expect(result.allowed).toBe(true);
  });

  it("denies explicit deny", async () => {
    const result = await guard.check("delete_file", { path: "/tmp/x" });
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("DENY");
  });

  it("denies unlisted tool", async () => {
    const result = await guard.check("unknown_tool", {});
    expect(result.allowed).toBe(false);
  });

  it("denies url policy", async () => {
    expect((await guard.check("search_repositories", { url: "https://evil.com" })).allowed).toBe(
      false,
    );
    expect((await guard.check("search_repositories", { url: "https://github.com/q" })).allowed).toBe(
      true,
    );
  });

  it("checkOrRefuse", async () => {
    expect(
      await guard.checkOrRefuse("read_file", { url: "https://example.com/x", method: "GET" }),
    ).toBeUndefined();
    expect(await guard.checkOrRefuse("delete_file", { path: "x" })).toContain(
      "Blocked by Agent Capability Runtime",
    );
  });
});
