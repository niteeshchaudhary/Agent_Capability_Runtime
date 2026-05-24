import {
  AuditLog,
  FileAuditLog,
  resolveAuditChainConfig,
  type AuditStore,
} from "@acr/audit";
import { InMemoryApprovalStore, type ApprovalStore } from "./approval-store.js";
import { FileApprovalStore } from "./file-approval-store.js";
import type { RuntimeConfig } from "./types.js";

export function createAuditStore(config: RuntimeConfig): AuditStore {
  const chain = resolveAuditChainConfig(config.auditChain);
  if (config.auditPath) {
    return new FileAuditLog(config.auditPath, chain);
  }
  return new AuditLog(chain);
}

export function createApprovalStore(config: RuntimeConfig): ApprovalStore {
  if (config.approvalPath) {
    return new FileApprovalStore(config.approvalPath);
  }
  return new InMemoryApprovalStore();
}
