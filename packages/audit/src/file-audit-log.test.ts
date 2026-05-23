import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileAuditLog } from "./file-audit-log.js";

describe("FileAuditLog", () => {
  it("persists and reloads events", () => {
    const dir = mkdtempSync(join(tmpdir(), "acr-audit-"));
    const filePath = join(dir, "audit.jsonl");

    const log1 = new FileAuditLog(filePath);
    log1.record({
      agentId: "agent_1",
      tool: "gmail.send",
      decision: "ALLOW",
      payload: { to: "a@company.com" },
    });

    const log2 = new FileAuditLog(filePath);
    expect(log2.list()).toHaveLength(1);
    expect(log2.list()[0]?.agentId).toBe("agent_1");
    expect(readFileSync(filePath, "utf8").trim().startsWith("{")).toBe(true);
  });

  it("filters by query", () => {
    const dir = mkdtempSync(join(tmpdir(), "acr-audit-"));
    const log = new FileAuditLog(join(dir, "audit.jsonl"));
    log.record({ agentId: "a1", tool: "slack.send", decision: "ALLOW" });
    log.record({ agentId: "a2", tool: "gmail.send", decision: "DENY", reason: "blocked" });

    expect(log.list({ agentId: "a2" })).toHaveLength(1);
    expect(log.list({ decision: "DENY" })[0]?.reason).toBe("blocked");
  });
});
