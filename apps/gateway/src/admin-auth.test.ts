import { describe, expect, it } from "vitest";
import { isValidAdminKey } from "./admin-auth.js";

describe("isValidAdminKey", () => {
  const keys = ["admin-key-alpha-32chars-minimum!!", "admin-key-beta-32chars-minimum!!!"];

  it("accepts a configured key", () => {
    expect(isValidAdminKey(keys[0]!, keys)).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(isValidAdminKey("wrong-key", keys)).toBe(false);
  });

  it("rejects similar-length wrong keys (timing-safe path)", () => {
    expect(isValidAdminKey("admin-key-alpha-32chars-minimum!X", keys)).toBe(false);
  });
});
