import { describe, expect, it } from "vitest";
import { QueryScopeGuard } from "./scope.js";

const BURGER_SCOPE = {
  enabled: true,
  purpose: "Burger shop assistant",
  allowed_topics: [
    { id: "menu", keywords: ["menu", "burger", "fries", "combo", "price"] },
    { id: "orders", keywords: ["order", "delivery", "pickup", "catering"] },
    { id: "hours", keywords: ["hours", "open", "close", "location", "address"] },
  ],
  denied_topics: [
    { id: "coding", keywords: ["python", "javascript", "write code", "programming"] },
  ],
  deny_patterns: [String.raw`\b(homework|essay)\b`],
  refusal_message: "I only help with menu, orders, hours, and locations.",
};

describe("QueryScopeGuard", () => {
  const guard = QueryScopeGuard.fromConfig(BURGER_SCOPE);

  it("disabled always allows", () => {
    expect(QueryScopeGuard.disabled().check("write python code").allowed).toBe(true);
  });

  it("allows on-topic query", () => {
    const result = guard.check("What's on the lunch menu?");
    expect(result.allowed).toBe(true);
    expect(result.matchedTopic).toBe("menu");
  });

  it("denies coding query", () => {
    const result = guard.check("Write me a Python script to sort a list");
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("coding");
  });

  it("denies off-topic without denied keyword", () => {
    const result = guard.check("Explain quantum physics");
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("out_of_scope");
  });

  it("denies deny pattern", () => {
    expect(guard.check("Help with my homework essay").allowed).toBe(false);
  });

  it("allows greeting", () => {
    expect(guard.check("Hello!").allowed).toBe(true);
    expect(guard.check("Hi there").allowed).toBe(true);
  });

  it("checkOrRefuse", () => {
    expect(guard.checkOrRefuse("What's the burger combo price?")).toBeUndefined();
    expect(guard.checkOrRefuse("Teach me JavaScript")).toBe(
      "I only help with menu, orders, hours, and locations.",
    );
  });

  it("deny_only mode", () => {
    const g = QueryScopeGuard.fromConfig({
      enabled: true,
      match_mode: "deny_only",
      denied_topics: [{ id: "coding", keywords: ["python"] }],
    });
    expect(g.check("Tell me about burgers").allowed).toBe(true);
    expect(g.check("Python tutorial").allowed).toBe(false);
  });

  it("topic shorthand string", () => {
    const g = QueryScopeGuard.fromConfig({
      enabled: true,
      allowed_topics: ["pizza"],
    });
    expect(g.check("Do you sell pizza?").allowed).toBe(true);
  });

  it("invalid match_mode", () => {
    expect(() =>
      QueryScopeGuard.fromConfig({ match_mode: "invalid" as "any_allowed" }),
    ).toThrow(/match_mode/);
  });
});
