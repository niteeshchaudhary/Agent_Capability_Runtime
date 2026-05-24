import { describe, expect, it } from "vitest";
import { assertConstraintSubset } from "./constraint-subset.js";

describe("assertConstraintSubset", () => {
  it("allows equal or stricter child constraints", () => {
    expect(
      assertConstraintSubset(
        { allowedDomains: ["company.com", "partner.com"], maxActions: 10 },
        { allowedDomains: ["company.com"], maxActions: 2 },
      ),
    ).toHaveLength(0);
  });

  it("rejects escalated maxActions", () => {
    const v = assertConstraintSubset({ maxActions: 3 }, { maxActions: 10 });
    expect(v.some((x) => x.field === "maxActions")).toBe(true);
  });

  it("rejects broader domains", () => {
    const v = assertConstraintSubset(
      { allowedDomains: ["company.com"] },
      { allowedDomains: ["company.com", "gmail.com"] },
    );
    expect(v.some((x) => x.field === "allowedDomains")).toBe(true);
  });
});
