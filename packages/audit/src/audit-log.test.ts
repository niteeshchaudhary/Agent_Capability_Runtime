import { describe, expect, it } from "vitest";
import { AuditLog } from "./audit-log.js";

describe("AuditLog", () => {
  it("records and retrieves events", () => {
    const log = new AuditLog();
    const event = log.record({
      agentId: "agent_1",
      tool: "gmail.send",
      decision: "ALLOW",
      payload: { to: "a@company.com" },
    });
    expect(log.getById(event.id)?.decision).toBe("ALLOW");
  });
});
