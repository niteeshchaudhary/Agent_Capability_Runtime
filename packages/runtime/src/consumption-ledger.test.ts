import { describe, expect, it } from "vitest";
import { ConsumptionLedger } from "./consumption/consumption-ledger.js";

describe("ConsumptionLedger", () => {
  it("enforces max_actions atomically", async () => {
    const ledger = new ConsumptionLedger();
    expect((await ledger.tryConsume("cap_1", 2)).allowed).toBe(true);
    expect((await ledger.tryConsume("cap_1", 2)).allowed).toBe(true);
    expect((await ledger.tryConsume("cap_1", 2)).allowed).toBe(false);
  });

  it("treats duplicate requestId as idempotent replay", async () => {
    const ledger = new ConsumptionLedger();
    const first = await ledger.tryConsume("cap_1", 5, "req_abc");
    const second = await ledger.tryConsume("cap_1", 5, "req_abc");
    expect(first.allowed).toBe(true);
    expect(second.replay).toBe(true);
    expect(await ledger.get("cap_1")).toBe(1);
  });

  it("releases consumption on adapter failure rollback", async () => {
    const ledger = new ConsumptionLedger();
    await ledger.tryConsume("cap_1", 3, "req_fail");
    await ledger.release("cap_1", "req_fail");
    expect(await ledger.get("cap_1")).toBe(0);
  });
});
