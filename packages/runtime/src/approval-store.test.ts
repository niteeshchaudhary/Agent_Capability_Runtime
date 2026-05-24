import { describe, expect, it } from "vitest";
import {
  approvalMatchesExecution,
  InMemoryApprovalStore,
} from "./approval-store.js";

describe("InMemoryApprovalStore", () => {
  it("creates pending approval with appr_ id", () => {
    const store = new InMemoryApprovalStore();
    const req = store.create({
      agentId: "agent_1",
      tool: "gmail.send",
      token: "tok",
      payload: { to: "a@co.com" },
      reason: "needs review",
      auditId: "aud_1",
      jti: "cap_1",
    });
    expect(req.id).toMatch(/^appr_/);
    expect(req.status).toBe("pending");
    expect(store.getById(req.id)).toEqual(req);
  });

  it("lists with status and agentId filters", () => {
    const store = new InMemoryApprovalStore();
    const a = store.create({
      agentId: "agent_a",
      tool: "gmail.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: "aud",
    });
    store.create({
      agentId: "agent_b",
      tool: "slack.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: "aud",
    });
    store.approve(a.id);
    expect(store.list({ status: "pending" })).toHaveLength(1);
    expect(store.list({ agentId: "agent_a" })).toHaveLength(1);
    expect(store.list({ tool: "slack.send" })).toHaveLength(1);
  });

  it("approve sets status and resolvedBy", () => {
    const store = new InMemoryApprovalStore();
    const req = store.create({
      agentId: "a",
      tool: "gmail.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: "aud",
    });
    const approved = store.approve(req.id, "user_42");
    expect(approved.status).toBe("approved");
    expect(approved.resolvedBy).toBe("user_42");
    expect(approved.resolvedAt).toBeDefined();
  });

  it("reject sets status rejected", () => {
    const store = new InMemoryApprovalStore();
    const req = store.create({
      agentId: "a",
      tool: "gmail.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: "aud",
    });
    const rejected = store.reject(req.id, "user_99");
    expect(rejected.status).toBe("rejected");
  });

  it("throws when approving missing or already resolved", () => {
    const store = new InMemoryApprovalStore();
    expect(() => store.approve("appr_missing")).toThrow(/not found/);
    const req = store.create({
      agentId: "a",
      tool: "gmail.send",
      token: "t",
      payload: {},
      reason: "r",
      auditId: "aud",
    });
    store.approve(req.id);
    expect(() => store.approve(req.id)).toThrow(/already approved/);
    expect(() => store.reject(req.id)).toThrow(/already approved/);
  });
});

describe("approvalMatchesExecution", () => {
  const base = {
    id: "appr_1",
    status: "approved" as const,
    agentId: "a",
    tool: "gmail.send" as const,
    token: "tok_abc",
    payload: { to: "x@co.com", subject: "Hi" },
    reason: "r",
    auditId: "aud",
    createdAt: new Date().toISOString(),
  };

  it("matches when approved with same token, tool, payload", () => {
    expect(
      approvalMatchesExecution(base, {
        token: "tok_abc",
        tool: "gmail.send",
        payload: { to: "x@co.com", subject: "Hi" },
      }),
    ).toBe(true);
  });

  it("rejects pending, wrong token, wrong tool, or changed payload", () => {
    expect(
      approvalMatchesExecution(
        { ...base, status: "pending" },
        { token: "tok_abc", tool: "gmail.send", payload: base.payload },
      ),
    ).toBe(false);
    expect(
      approvalMatchesExecution(base, {
        token: "other",
        tool: "gmail.send",
        payload: base.payload,
      }),
    ).toBe(false);
    expect(
      approvalMatchesExecution(base, {
        token: "tok_abc",
        tool: "slack.send",
        payload: base.payload,
      }),
    ).toBe(false);
    expect(
      approvalMatchesExecution(base, {
        token: "tok_abc",
        tool: "gmail.send",
        payload: { to: "y@co.com" },
      }),
    ).toBe(false);
  });
});
