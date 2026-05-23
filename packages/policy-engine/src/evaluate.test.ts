import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./evaluate.js";

describe("evaluatePolicy", () => {
  it("allows company.com email", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
      payload: { to: "john@company.com", subject: "Hi" },
    });
    expect(result.decision).toBe("ALLOW");
  });

  it("denies external email domain", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"] },
      payload: { to: "john@gmail.com" },
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toMatch(/external domain blocked/);
  });

  it("requires approval for external when configured", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: {
        allowedDomains: ["company.com"],
        approvalRequiredIfExternal: true,
      },
      payload: { to: "john@gmail.com" },
    });
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("denies when max_actions reached", () => {
    const result = evaluatePolicy({
      tool: "slack.send",
      constraints: { maxActions: 3 },
      payload: { channel: "#general", text: "hi" },
      actionCount: 3,
    });
    expect(result.decision).toBe("DENY");
  });

  it("allows when approval was granted externally", () => {
    const result = evaluatePolicy({
      tool: "gmail.send",
      constraints: { approvalRequired: true },
      payload: { to: "a@company.com" },
      approvalGranted: true,
    });
    expect(result.decision).toBe("ALLOW");
  });
});
