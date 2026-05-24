import { createConsumptionStore } from "./consumption/create-consumption-store.js";
import type { ConsumptionStore } from "./consumption/types.js";
import type { ApprovalStore } from "./approval-store.js";
import type { AuditStore } from "@acr/audit";
import { AgentCapabilityRuntime } from "./runtime.js";
import { createApprovalStore, createAuditStore } from "./stores.js";
import type { RuntimeConfig } from "./types.js";

export interface CreateRuntimeOptions {
  audit?: AuditStore;
  approvals?: ApprovalStore;
  consumption?: ConsumptionStore;
}

/**
 * Create a runtime with optional Redis-backed consumption (ACR_REDIS_URL / config.consumption).
 */
export async function createAgentCapabilityRuntime(
  config: RuntimeConfig,
  options?: CreateRuntimeOptions,
): Promise<AgentCapabilityRuntime> {
  const consumption =
    options?.consumption ?? (await createConsumptionStore(config.consumption));

  return new AgentCapabilityRuntime(config, {
    audit: options?.audit ?? createAuditStore(config),
    approvals: options?.approvals ?? createApprovalStore(config),
    consumption,
  });
}
