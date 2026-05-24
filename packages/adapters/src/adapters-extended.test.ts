import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAdapterConfigFromEnv, resolveAdapterConfig } from "./config.js";
import { createHttpAdapter } from "./http.js";
import { gmailStubAdapter } from "./gmail-stub.js";
import { slackStubAdapter } from "./slack-stub.js";

describe("gmailStubAdapter", () => {
  it("throws when to is missing", async () => {
    await expect(gmailStubAdapter.execute({})).rejects.toThrow(/requires payload.to/);
  });

  it("returns stub result with messageId", async () => {
    const result = await gmailStubAdapter.execute({
      to: "user@company.com",
      subject: "Hi",
    });
    expect(result.status).toBe("sent");
    expect(result.mode).toBe("stub");
    expect(result.to).toBe("user@company.com");
  });
});

describe("slackStubAdapter", () => {
  it("throws when text is missing", async () => {
    await expect(slackStubAdapter.execute({ channel: "#general" })).rejects.toThrow(
      /requires payload.text/,
    );
  });

  it("defaults channel to #general", async () => {
    const result = await slackStubAdapter.execute({ text: "hello" });
    expect(result.channel).toBe("#general");
    expect(result.status).toBe("posted");
  });
});

describe("createHttpAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when url is missing", async () => {
    const adapter = createHttpAdapter();
    await expect(adapter.execute({})).rejects.toThrow(/requires payload.url/);
  });

  it("returns JSON body for application/json responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
      }),
    );

    const adapter = createHttpAdapter();
    const result = await adapter.execute({
      url: "https://api.example.com/data",
      method: "POST",
      body: { key: "value" },
      headers: { "X-Custom": "1" },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    expect(result.method).toBe("POST");
  });

  it("returns text body for non-JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/plain" },
        text: async () => "plain text",
      }),
    );

    const result = await createHttpAdapter().execute({
      url: "https://api.example.com/text",
    });
    expect(result.body).toBe("plain text");
  });

  it("throws on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );

    const adapter = createHttpAdapter({ timeoutMs: 10 });
    await expect(adapter.execute({ url: "https://slow.example.com" })).rejects.toThrow(/timed out/);
  });
});

describe("resolveAdapterConfig", () => {
  it("forces stub mode", () => {
    expect(
      resolveAdapterConfig({
        mode: "stub",
        gmail: { accessToken: "tok" },
      }),
    ).toEqual({ mode: "stub", gmail: { accessToken: "tok" } });
  });

  it("auto mode uses live when credentials present", () => {
    expect(
      resolveAdapterConfig({
        mode: "auto",
        slack: { botToken: "xoxb-test" },
      }).mode,
    ).toBe("live");
  });

  it("auto mode uses stub without credentials", () => {
    expect(resolveAdapterConfig({ mode: "auto" }).mode).toBe("stub");
  });
});

describe("loadAdapterConfigFromEnv", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("reads gmail and slack from env in auto mode", () => {
    process.env.GMAIL_ACCESS_TOKEN = "gmail-tok";
    process.env.SLACK_BOT_TOKEN = "slack-tok";
    process.env.ACR_ADAPTER_MODE = "auto";
    const config = loadAdapterConfigFromEnv();
    expect(config.mode).toBe("live");
    expect(config.gmail?.accessToken).toBe("gmail-tok");
    expect(config.slack?.botToken).toBe("slack-tok");
  });

  it("forces stub when ACR_ADAPTER_MODE=stub", () => {
    process.env.GMAIL_ACCESS_TOKEN = "gmail-tok";
    process.env.ACR_ADAPTER_MODE = "stub";
    expect(loadAdapterConfigFromEnv().mode).toBe("stub");
  });
});
