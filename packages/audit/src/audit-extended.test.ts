import { describe, expect, it } from "vitest";
import { AuditLog } from "./audit-log.js";
import { matchesAuditQuery, sortAuditEvents } from "./store.js";
import type { AuditEvent } from "./types.js";

describe("matchesAuditQuery", () => {
  const event: AuditEvent = {
    id: "aud_1",
    agentId: "agent_a",
    tool: "gmail.send",
    decision: "ALLOW",
    timestamp: "2026-05-24T12:00:00.000Z",
  };

  it("matches when no query", () => {
    expect(matchesAuditQuery(event)).toBe(true);
  });

  it("filters by agentId, tool, decision", () => {
    expect(matchesAuditQuery(event, { agentId: "agent_a" })).toBe(true);
    expect(matchesAuditQuery(event, { agentId: "other" })).toBe(false);
    expect(matchesAuditQuery(event, { tool: "gmail.send" })).toBe(true);
    expect(matchesAuditQuery(event, { decision: "DENY" })).toBe(false);
  });

  it("filters by since and until", () => {
    expect(matchesAuditQuery(event, { since: "2026-05-24T11:00:00.000Z" })).toBe(true);
    expect(matchesAuditQuery(event, { since: "2026-05-24T13:00:00.000Z" })).toBe(false);
    expect(matchesAuditQuery(event, { until: "2026-05-24T13:00:00.000Z" })).toBe(true);
    expect(matchesAuditQuery(event, { until: "2026-05-24T11:00:00.000Z" })).toBe(false);
  });
});

describe("sortAuditEvents", () => {
  it("sorts chronologically", () => {
    const a: AuditEvent = {
      id: "1",
      agentId: "a",
      tool: "t",
      decision: "ALLOW",
      timestamp: "2026-05-24T10:00:00.000Z",
    };
    const b: AuditEvent = {
      id: "2",
      agentId: "a",
      tool: "t",
      decision: "ALLOW",
      timestamp: "2026-05-24T12:00:00.000Z",
    };
    expect(sortAuditEvents([b, a]).map((e) => e.id)).toEqual(["1", "2"]);
  });
});

describe("AuditLog (extended)", () => {
  it("summarizes payload fields on record", () => {
    const log = new AuditLog();
    const event = log.record({
      agentId: "a",
      tool: "http.request",
      decision: "ALLOW",
      payload: {
        url: "https://api.com",
        method: "GET",
        channel: "#ops",
        attachments: true,
      },
      reason: "ok",
      delegator: "user_1",
      jti: "cap_1",
      task: "sync",
      approvalId: "appr_1",
    });
    expect(event.payloadSummary).toEqual({
      url: "https://api.com",
      method: "GET",
      channel: "#ops",
      hasAttachments: true,
    });
    expect(event.reason).toBe("ok");
    expect(event.delegator).toBe("user_1");
    expect(event.approvalId).toBe("appr_1");
  });

  it("importEvents restores without re-processing", () => {
    const log = new AuditLog();
    const imported: AuditEvent = {
      id: "aud_imported",
      agentId: "a",
      tool: "slack.send",
      decision: "DENY",
      timestamp: "2026-01-01T00:00:00.000Z",
      reason: "blocked",
    };
    log.importEvents([imported]);
    expect(log.getById("aud_imported")).toEqual(imported);
  });

  it("list supports since, until, and limit", () => {
    const log = new AuditLog();
    log.importEvents([
      {
        id: "1",
        agentId: "a",
        tool: "t",
        decision: "ALLOW",
        timestamp: "2026-05-24T10:00:00.000Z",
      },
      {
        id: "2",
        agentId: "a",
        tool: "t",
        decision: "ALLOW",
        timestamp: "2026-05-24T11:00:00.000Z",
      },
      {
        id: "3",
        agentId: "a",
        tool: "t",
        decision: "ALLOW",
        timestamp: "2026-05-24T12:00:00.000Z",
      },
    ]);
    expect(log.list({ since: "2026-05-24T10:30:00.000Z" })).toHaveLength(2);
    expect(log.list({ limit: 2 }).map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("clear removes all events", () => {
    const log = new AuditLog();
    log.record({ agentId: "a", tool: "t", decision: "ALLOW" });
    log.clear();
    expect(log.list()).toHaveLength(0);
  });
});
