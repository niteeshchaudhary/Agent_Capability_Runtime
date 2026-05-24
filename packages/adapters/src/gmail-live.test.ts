import { describe, expect, it, vi, afterEach } from "vitest";
import { createGmailLiveAdapter } from "./gmail-live.js";

describe("createGmailLiveAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Gmail API messages.send", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ id: "msg_real_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGmailLiveAdapter({ accessToken: "ya29.test-token" });
    const result = await adapter.execute({
      to: "user@company.com",
      subject: "Test",
      body: "Hello from ACR",
    });

    expect(result).toMatchObject({
      messageId: "msg_real_123",
      status: "sent",
      to: "user@company.com",
      mode: "live",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer ya29.test-token",
    });
  });

  it("surfaces Gmail API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({ error: { message: "Insufficient Permission" } }),
      }),
    );

    const adapter = createGmailLiveAdapter({ accessToken: "bad" });
    await expect(
      adapter.execute({ to: "a@b.com", subject: "S", body: "B" }),
    ).rejects.toThrow(/Insufficient Permission/);
  });

  it("requires subject and rejects attachments", async () => {
    const adapter = createGmailLiveAdapter({ accessToken: "tok" });
    await expect(adapter.execute({ to: "a@b.com", body: "B" })).rejects.toThrow(
      /requires payload.subject/,
    );
    await expect(
      adapter.execute({
        to: "a@b.com",
        subject: "S",
        body: "B",
        attachments: [{ name: "f" }],
      }),
    ).rejects.toThrow(/does not support attachments/);
  });

  it("throws when API returns no message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    );
    const adapter = createGmailLiveAdapter({ accessToken: "tok" });
    await expect(
      adapter.execute({ to: "a@b.com", subject: "S", body: "B" }),
    ).rejects.toThrow(/no message id/);
  });
});
