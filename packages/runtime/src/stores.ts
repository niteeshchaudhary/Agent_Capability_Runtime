import { AuditLog, FileAuditLog, type AuditStore } from "@acr/audit";
import { InMemoryApprovalStore, type ApprovalStore } from "./approval-store.js";
import { FileApprovalStore } from "./file-approval-store.js";
import type { RuntimeConfig } from "./types.js";

export function createAuditStore(config: RuntimeConfig): AuditStore {
  if (config.auditPath) {
    return new FileAuditLog(config.auditPath);
  }
  return new AuditLog();
}

export function createApprovalStore(config: RuntimeConfig): ApprovalStore {
  if (config.approvalPath) {
    return new FileApprovalStore(config.approvalPath);
  }
  return new InMemoryApprovalStore();
}
