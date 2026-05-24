import { describe, expect, it } from "vitest";
import { compilePolicy, evaluatePolicyAst } from "./evaluate.js";

describe("spending_limit", () => {
  it("requires approval when payload amount exceeds limit", () => {
    const doc = compilePolicy("gmail.send", { spendingLimit: 10_000 });

    const pending = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com", amount: 25_000 },
      actionCount: 0,
    });
    expect(pending.decision).toBe("REQUIRE_APPROVAL");

    const allowed = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com", amount: 25_000 },
      actionCount: 0,
      approvalGranted: true,
    });
    expect(allowed.decision).toBe("ALLOW");
  });
});
