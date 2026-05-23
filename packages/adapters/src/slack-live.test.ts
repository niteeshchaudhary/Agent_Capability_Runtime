import { describe, expect, it, vi, afterEach } from "vitest";
import { createSlackLiveAdapter } from "./slack-live.js";

describe("createSlackLiveAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Slack chat.postMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        ts: "1714435200.000100",
        channel: "C01234567",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createSlackLiveAdapter({ botToken: "xoxb-test" });
    const result = await adapter.execute({
      channel: "#general",
      text: "Hello from ACR",
    });

    expect(result).toMatchObject({
      messageTs: "1714435200.000100",
      channel: "C01234567",
      status: "posted",
      mode: "live",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer xoxb-test" });
  });

  it("surfaces Slack API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: "channel_not_found" }),
      }),
    );

    const adapter = createSlackLiveAdapter({ botToken: "xoxb-test" });
    await expect(
      adapter.execute({ channel: "#missing", text: "hi" }),
    ).rejects.toThrow(/channel_not_found/);
  });
});
