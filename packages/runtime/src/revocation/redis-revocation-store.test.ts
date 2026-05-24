import { describe, expect, it } from "vitest";
import type { RedisRevocationClient } from "./redis-revocation-store.js";
import { RedisRevocationStore } from "./redis-revocation-store.js";

class FakeRedisRevocation implements RedisRevocationClient {
  private readonly strings = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.strings.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.strings.delete(key) ? 1 : 0;
  }

  async scan(
    cursor: number,
    options?: { MATCH?: string; COUNT?: number },
  ): Promise<{ cursor: number; keys: string[] }> {
    if (cursor !== 0) {
      return { cursor: 0, keys: [] };
    }
    const pattern = options?.MATCH ?? "*";
    const prefix = pattern.replace(/\*$/, "");
    const keys = [...this.strings.keys()].filter((k) => k.startsWith(prefix));
    return { cursor: 0, keys };
  }
}

describe("RedisRevocationStore", () => {
  it("revokes and blocks isRevoked across logical clients sharing Redis", async () => {
    const fake = new FakeRedisRevocation();
    const storeA = new RedisRevocationStore(fake, { keyPrefix: "test:revoke" });
    const storeB = new RedisRevocationStore(fake, { keyPrefix: "test:revoke" });

    expect(await storeB.isRevoked("cap_abc")).toBe(false);

    const record = await storeA.revoke("cap_abc", {
      reason: "compromised",
      revokedBy: "admin",
    });
    expect(record.jti).toBe("cap_abc");

    expect(await storeB.isRevoked("cap_abc")).toBe(true);
    const fetched = await storeB.get("cap_abc");
    expect(fetched?.reason).toBe("compromised");

    const listed = await storeA.list();
    expect(listed.some((r) => r.jti === "cap_abc")).toBe(true);
  });
});

describe("createRevocationStore", () => {
  it("defaults to in-memory when mode omitted", async () => {
    const { createRevocationStore } = await import("./create-revocation-store.js");
    const store = await createRevocationStore();
    await store.revoke("cap_mem", { reason: "test" });
    expect(await store.isRevoked("cap_mem")).toBe(true);
  });
});
