import { describe, expect, it } from "vitest";
import { compilePolicyVersioned, PolicyVersionRegistry } from "./policy-version.js";

describe("PolicyVersionRegistry", () => {
  it("assigns stable ids for same constraints", () => {
    const registry = new PolicyVersionRegistry();
    const a = registry.register("gmail.send", { allowedDomains: ["co.com"], maxActions: 5 });
    const b = registry.register("gmail.send", { allowedDomains: ["co.com"], maxActions: 5 });
    expect(a.policyVersionId).toBe(b.policyVersionId);
    expect(registry.list()).toHaveLength(1);
  });

  it("changes id when constraints change", () => {
    const registry = new PolicyVersionRegistry();
    const a = registry.register("gmail.send", { maxActions: 5 });
    const b = registry.register("gmail.send", { maxActions: 10 });
    expect(a.policyVersionId).not.toBe(b.policyVersionId);
  });

  it("compilePolicyVersioned includes policyVersionId", () => {
    const doc = compilePolicyVersioned("slack.send", { maxActions: 1 });
    expect(doc.policyVersionId).toMatch(/^pol_/);
  });
});
