import { describe, expect, it } from "vitest";
import { buildGmailRawMessage } from "./gmail-mime.js";

describe("buildGmailRawMessage", () => {
  it("produces valid base64url", () => {
    const raw = buildGmailRawMessage({
      to: "user@company.com",
      subject: "Hello",
      body: "Test body",
    });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: user@company.com");
    expect(decoded).toContain("Subject: Hello");
    expect(decoded).toContain("Test body");
  });
});
