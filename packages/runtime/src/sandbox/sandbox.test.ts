import { describe, expect, it } from "vitest";
import type { ToolAdapter } from "@acr/adapters";
import { assertSafeHttpUrl } from "./network.js";
import { executeInSandbox } from "./executor.js";
import { SandboxViolation } from "./types.js";

describe("assertSafeHttpUrl", () => {
  it("allows public https URLs", () => {
    expect(() => assertSafeHttpUrl("https://api.example.com/v1", true)).not.toThrow();
  });

  it("blocks localhost and private IPs", () => {
    for (const url of [
      "http://127.0.0.1/admin",
      "http://localhost/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      expect(() => assertSafeHttpUrl(url, true)).toThrow(SandboxViolation);
    }
  });

  it("allows private IPs when blockPrivateNetworks is false", () => {
    expect(() => assertSafeHttpUrl("http://127.0.0.1/", false)).not.toThrow();
  });
});

describe("executeInSandbox", () => {
  const slowAdapter: ToolAdapter = {
    tool: "slack.send",
    async execute() {
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true };
    },
  };

  it("enforces execution timeout", async () => {
    await expect(
      executeInSandbox({
        adapter: slowAdapter,
        tool: "slack.send",
        payload: { channel: "#x", text: "hi" },
        execCtx: {
          capability: { jti: "cap_1", agentId: "a", tool: "slack.send" },
          payload: {},
          simulate: false,
        },
        constraints: {},
        sandbox: {
          enabled: true,
          executionTimeoutMs: 5,
          maxHttpResponseBytes: 1024,
          blockPrivateNetworks: true,
        },
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("bypasses sandbox when disabled", async () => {
    const result = await executeInSandbox({
      adapter: slowAdapter,
      tool: "slack.send",
      payload: { channel: "#x", text: "hi" },
      execCtx: {
        capability: { jti: "cap_1", agentId: "a", tool: "slack.send" },
        payload: {},
        simulate: false,
      },
      constraints: {},
      sandbox: {
        enabled: false,
        executionTimeoutMs: 5,
        maxHttpResponseBytes: 1024,
        blockPrivateNetworks: true,
      },
    });
    expect(result).toEqual({ ok: true });
  });
});
