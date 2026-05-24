import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./evaluate.js";

describe("evaluatePolicy — allowedHours", () => {
  it("denies outside UTC window", () => {
    const result = evaluatePolicy({
      tool: "slack.send",
      constraints: { allowedHours: { start: 9, end: 17 } },
      payload: { channel: "#ops", text: "hi" },
      nowUtcHour: 3,
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toMatch(/outside allowed hours/);
  });

  it("allows inside UTC window", () => {
    const result = evaluatePolicy({
      tool: "slack.send",
      constraints: { allowedHours: { start: 9, end: 17 } },
      payload: { channel: "#ops", text: "hi" },
      nowUtcHour: 12,
    });
    expect(result.decision).toBe("ALLOW");
  });
});

describe("evaluatePolicy — maxActions boundary", () => {
  it("allows when actionCount is one below limit", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { maxActions: 3 },
      payload: { to: "a@co.com" },
      actionCount: 2,
    });
    expect(result.decision).toBe("ALLOW");
  });

  it("denies when actionCount equals maxActions", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { maxActions: 3 },
      payload: { to: "a@co.com" },
      actionCount: 3,
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("max_actions exceeded");
  });
});

describe("evaluatePolicy — gmail attachments", () => {
  it("denies when attachments forbidden but payload has attachments", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { attachments: false },
      payload: { to: "a@co.com", attachments: [{ name: "file.pdf" }] },
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("attachments not permitted");
  });

  it("allows when attachments omitted", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { attachments: false },
      payload: { to: "a@co.com" },
    });
    expect(result.decision).toBe("ALLOW");
  });
});

describe("evaluatePolicy — http.request", () => {
  it("denies disallowed HTTP method", () => {
    const result = evaluatePolicy({
      tool: "http.request",
      constraints: { allowedMethods: ["GET"] },
      payload: { url: "https://api.example.com", method: "POST" },
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toMatch(/POST not allowed/);
  });

  it("allows default GET when method omitted", () => {
    const result = evaluatePolicy({
      tool: "http.request",
      constraints: { allowedMethods: ["GET"] },
      payload: { url: "https://api.example.com" },
    });
    expect(result.decision).toBe("ALLOW");
  });

  it("denies URL not in allowed_urls", () => {
    const result = evaluatePolicy({
      tool: "http.request",
      constraints: { allowedUrls: ["api.example.com"] },
      payload: { url: "https://evil.com/data" },
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toMatch(/not in allowed_urls/);
  });

  it("allows subdomain of allowed host", () => {
    const result = evaluatePolicy({
      tool: "http.request",
      constraints: { allowedUrls: ["example.com"] },
      payload: { url: "https://api.example.com/v1" },
    });
    expect(result.decision).toBe("ALLOW");
  });

  it("allows bare hostname without scheme via fallback", () => {
    const result = evaluatePolicy({
      tool: "http.request",
      constraints: { allowedUrls: ["internal.local"] },
      payload: { url: "internal.local/path" },
    });
    expect(result.decision).toBe("ALLOW");
  });
});

describe("evaluatePolicy — slack.send", () => {
  it("allows slack with no tool-specific constraints", () => {
    const result = evaluatePolicy({
      tool: "slack.send",
      constraints: {},
      payload: { channel: "#general", text: "hello" },
    });
    expect(result.decision).toBe("ALLOW");
  });
});
