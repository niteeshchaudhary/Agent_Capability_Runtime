import { describe, expect, it } from "vitest";
import { compilePolicy, evaluatePolicyAst } from "./evaluate.js";
import { can, domain, hours, method, url } from "./dsl/index.js";

describe("policy DSL", () => {
  it("can().where(domain.in()).limit() builds gmail constraints", () => {
    const constraints = can("gmail.send")
      .where(domain.in(["company.com"]))
      .limit(5)
      .noAttachments()
      .build();

    expect(constraints).toEqual({
      allowedDomains: ["company.com"],
      maxActions: 5,
      attachments: false,
    });

    const doc = compilePolicy("gmail.send", constraints);
    const dslDoc = can("gmail.send").where(domain.in(["company.com"])).limit(5).noAttachments().compile();
    expect(dslDoc.root).toEqual(doc.root);
  });

  it("compiles to AST that allows in-domain email on simulate", () => {
    const doc = can("gmail.send")
      .where(domain.in(["company.com"]))
      .limit(2)
      .compile();

    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Hi" },
      actionCount: 0,
      simulate: true,
    });

    expect(result.decision).toBe("SIMULATE");
  });

  it("denies external domain when not using approval-if-external", () => {
    const doc = can("gmail.send").where(domain.in(["company.com"])).compile();

    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "user@gmail.com", subject: "Hi" },
      actionCount: 0,
    });

    expect(result.decision).toBe("DENY");
  });

  it("requireApprovalIfExternal yields REQUIRE_APPROVAL for external", () => {
    const doc = can("gmail.send")
      .where(domain.in(["company.com"]))
      .requireApprovalIfExternal()
      .compile();

    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "user@gmail.com", subject: "Hi" },
      actionCount: 0,
    });

    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("supports http.request method and url predicates", () => {
    const constraints = can("http.request")
      .where(method.in(["GET", "POST"]))
      .where(url.in(["api.company.com"]))
      .limit(100)
      .build();

    expect(constraints.allowedMethods).toEqual(["GET", "POST"]);
    expect(constraints.allowedUrls).toEqual(["api.company.com"]);
    expect(constraints.maxActions).toBe(100);
  });

  it("supports hours.between via where()", () => {
    const constraints = can("slack.send").where(hours.between(9, 17)).build();
    expect(constraints.allowedHours).toEqual({ start: 9, end: 17 });
  });

  it("toGrantInput merges agent fields", () => {
    const input = can("gmail.send")
      .where(domain.in(["company.com"]))
      .limit(3)
      .toGrantInput({ agentId: "agent_1", expiresIn: "15m" });

    expect(input.tool).toBe("gmail.send");
    expect(input.agentId).toBe("agent_1");
    expect(input.constraints.maxActions).toBe(3);
  });

  it("rejects domain.in on wrong tool", () => {
    expect(() => can("slack.send").where(domain.in(["x.com"])).build()).toThrow(/gmail.send/);
  });

  it("whenIntent adds allowedIntentCategories", () => {
    const constraints = can("gmail.send").whenIntent("customer_support").build();
    expect(constraints.allowedIntentCategories).toEqual(["customer_support"]);
  });

  it("whenIntentAction adds category and action constraints", () => {
    const constraints = can("gmail.send")
      .whenIntentAction("customer_support", "reply_email")
      .build();
    expect(constraints.allowedIntentCategories).toEqual(["customer_support"]);
    expect(constraints.allowedIntentActions).toEqual(["reply_email"]);
  });
});
