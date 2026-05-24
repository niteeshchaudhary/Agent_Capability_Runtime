import { describe, expect, it } from "vitest";
import { ActionCounter } from "./action-counter.js";

describe("ActionCounter", () => {
  it("starts at zero for unknown jti", () => {
    const counter = new ActionCounter();
    expect(counter.get("cap_unknown")).toBe(0);
  });

  it("increments and returns new count", () => {
    const counter = new ActionCounter();
    expect(counter.increment("cap_1")).toBe(1);
    expect(counter.increment("cap_1")).toBe(2);
    expect(counter.get("cap_1")).toBe(2);
  });

  it("tracks jtis independently", () => {
    const counter = new ActionCounter();
    counter.increment("cap_a");
    counter.increment("cap_b");
    counter.increment("cap_b");
    expect(counter.get("cap_a")).toBe(1);
    expect(counter.get("cap_b")).toBe(2);
  });

  it("reset clears one jti or all", () => {
    const counter = new ActionCounter();
    counter.increment("cap_a");
    counter.increment("cap_b");
    counter.reset("cap_a");
    expect(counter.get("cap_a")).toBe(0);
    expect(counter.get("cap_b")).toBe(1);
    counter.reset();
    expect(counter.get("cap_b")).toBe(0);
  });
});
