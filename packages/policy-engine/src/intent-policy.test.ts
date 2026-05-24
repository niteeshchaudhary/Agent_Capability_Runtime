import { describe, expect, it } from "vitest";
import { compilePolicy, evaluatePolicyAst } from "./evaluate.js";
import { can, domain } from "./dsl/index.js";

describe("intent-aware policy", () => {
  it("allows gmail.send when intent category matches grant constraint", () => {
    const doc = can("gmail.send")
      .whenIntent("customer_support")
      .where(domain.in(["company.com"]))
      .compile();

    const allowed = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Re: ticket" },
      actionCount: 0,
      intent: { category: "customer_support", action: "reply_email" },
      simulate: true,
    });
    expect(allowed.decision).toBe("SIMULATE");

    const denied = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Promo" },
      actionCount: 0,
      intent: { category: "marketing", action: "bulk_campaign" },
      simulate: true,
    });
    expect(denied.decision).toBe("DENY");
    expect(denied.reason).toMatch(/intent category/i);
  });

  it("denies when intent category required but missing", () => {
    const constraints = can("gmail.send").whenIntent("customer_support").build();
    const doc = compilePolicy("gmail.send", constraints);

    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com" },
      actionCount: 0,
      simulate: true,
    });
    expect(result.decision).toBe("DENY");
    expect(result.reason).toMatch(/intent.*required/i);
  });

  it("enforces intent action when allowedIntentActions set", () => {
    const doc = can("gmail.send")
      .whenIntent("customer_support")
      .whenIntentAction("customer_support", "reply_email")
      .compile();

    const ok = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com" },
      actionCount: 0,
      intent: { category: "customer_support", action: "reply_email" },
      simulate: true,
    });
    expect(ok.decision).toBe("SIMULATE");

    const badAction = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com" },
      actionCount: 0,
      intent: { category: "customer_support", action: "bulk_send" },
      simulate: true,
    });
    expect(badAction.decision).toBe("DENY");
    expect(badAction.reason).toMatch(/intent action/i);
  });
});
