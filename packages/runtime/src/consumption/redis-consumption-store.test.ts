import { describe, expect, it } from "vitest";
import { RELEASE_SCRIPT, TRY_CONSUME_SCRIPT } from "./lua.js";
import type { RedisEvalClient } from "./redis-consumption-store.js";
import { RedisConsumptionStore } from "./redis-consumption-store.js";

/** In-process Redis eval simulation for unit tests (no server required). */
class FakeRedisEval implements RedisEvalClient {
  private readonly strings = new Map<string, string>();
  private readonly sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async expire(): Promise<void> {}

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.strings.delete(key);
      this.sets.delete(key);
    }
  }

  async eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown> {
    const [countKey, reqsKey] = options.keys;
    const args = options.arguments;

    if (script === TRY_CONSUME_SCRIPT) {
      const limitArg = args[0] ?? "";
      const requestId = args[1] ?? "";
      const limit = limitArg === "" ? undefined : Number.parseInt(limitArg, 10);
      const unlimited = limitArg === "" || limitArg === "-1";

      if (requestId) {
        const seen = this.sets.get(reqsKey);
        if (seen?.has(requestId)) {
          const current = Number.parseInt(this.strings.get(countKey) ?? "0", 10);
          return [1, current, 1, "idempotent replay"];
        }
      }

      const current = Number.parseInt(this.strings.get(countKey) ?? "0", 10);
      if (!unlimited && limit !== undefined && current >= limit) {
        return [0, current, 0, "max_actions exceeded"];
      }

      const next = current + 1;
      this.strings.set(countKey, String(next));
      if (requestId) {
        let set = this.sets.get(reqsKey);
        if (!set) {
          set = new Set();
          this.sets.set(reqsKey, set);
        }
        set.add(requestId);
      }
      return [1, next, 0, ""];
    }

    if (script === RELEASE_SCRIPT) {
      const requestId = args[0] ?? "";
      const current = Number.parseInt(this.strings.get(countKey) ?? "0", 10);
      if (current > 0) {
        this.strings.set(countKey, String(current - 1));
      }
      if (requestId) {
        this.sets.get(reqsKey)?.delete(requestId);
      }
      return Number.parseInt(this.strings.get(countKey) ?? "0", 10);
    }

    throw new Error("Unknown script");
  }
}

describe("RedisConsumptionStore", () => {
  it("matches in-memory semantics for max_actions and replay", async () => {
    const store = new RedisConsumptionStore(new FakeRedisEval(), {
      keyPrefix: "test",
    });

    expect((await store.tryConsume("cap_1", 2)).allowed).toBe(true);
    expect((await store.tryConsume("cap_1", 2)).allowed).toBe(true);
    expect((await store.tryConsume("cap_1", 2)).allowed).toBe(false);

    const first = await store.tryConsume("cap_2", 5, "req_x");
    const second = await store.tryConsume("cap_2", 5, "req_x");
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(await store.get("cap_2")).toBe(1);

    await store.tryConsume("cap_3", 3, "req_fail");
    await store.release("cap_3", "req_fail");
    expect(await store.get("cap_3")).toBe(0);
  });
});
