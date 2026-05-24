import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileApprovalStore } from "./file-approval-store.js";

describe("FileApprovalStore", () => {
  it("persists and reloads approvals", () => {
    const dir = mkdtempSync(join(tmpdir(), "acr-approval-"));
    const filePath = join(dir, "approvals.json");

    const store1 = new FileApprovalStore(filePath);
    const created = store1.create({
      agentId: "agent_1",
      tool: "gmail.send",
      token: "tok",
      payload: { to: "a@co.com" },
      reason: "review",
      auditId: "aud_1",
    });
    store1.approve(created.id, "reviewer");

    const store2 = new FileApprovalStore(filePath);
    const loaded = store2.getById(created.id);
    expect(loaded?.status).toBe("approved");
    expect(loaded?.resolvedBy).toBe("reviewer");
  });
});
