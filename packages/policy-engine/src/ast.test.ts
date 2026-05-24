import { describe, expect, it } from "vitest";
import { compilePolicy } from "./compile.js";
import { evaluatePolicyAst } from "./evaluate-ast.js";

describe("policy AST", () => {
  it("compiles constraints to AND node", () => {
    const doc = compilePolicy("gmail.send", {
      allowedDomains: ["company.com"],
      maxActions: 3,
      attachments: false,
    });
    expect(doc.root).toMatchObject({
      operator: "AND",
    });
  });

  it("simulates allow without side effects", () => {
    const doc = compilePolicy("gmail.send", {
      allowedDomains: ["company.com"],
    });
    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "a@company.com" },
      simulate: true,
    });
    expect(result.decision).toBe("SIMULATE");
    expect(result.evaluatedConditions?.every((c) => c.passed)).toBe(true);
  });

  it("uses approval_required_if_external instead of hard deny when configured", () => {
    const doc = compilePolicy("gmail.send", {
      allowedDomains: ["company.com"],
      approvalRequiredIfExternal: true,
    });
    const result = evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "x@gmail.com" },
    });
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });
});
