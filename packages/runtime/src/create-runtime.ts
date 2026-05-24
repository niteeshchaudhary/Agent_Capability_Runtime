import { createConsumptionStore } from "./consumption/create-consumption-store.js";
import type { ConsumptionStore } from "./consumption/types.js";
import { createRevocationStore } from "./revocation/create-revocation-store.js";
import type { RevocationStore } from "./revocation/types.js";
import type { ApprovalStore } from "./approval-store.js";
import type { AuditStore } from "@acr/audit";
import {
  prepareSigningMaterial,
  resolveSigningConfig,
  type SigningMaterial,
} from "@acr/capability-token";
import { AgentCapabilityRuntime } from "./runtime.js";
import { createApprovalStore, createAuditStore } from "./stores.js";
import type { RuntimeConfig } from "./types.js";

export interface CreateRuntimeOptions {
  audit?: AuditStore;
  approvals?: ApprovalStore;
  consumption?: ConsumptionStore;
  revocations?: RevocationStore;
  signingMaterial?: SigningMaterial;
}

/**
 * Create a runtime with optional Redis-backed consumption and/or revocation.
 * Revocation defaults to in-memory unless `config.revocation.mode` is `"redis"`.
 */
export async function createAgentCapabilityRuntime(
  config: RuntimeConfig,
  options?: CreateRuntimeOptions,
): Promise<AgentCapabilityRuntime> {
  const consumption =
    options?.consumption ?? (await createConsumptionStore(config.consumption));
  const revocations =
    options?.revocations ?? (await createRevocationStore(config.revocation));
  const signingMaterial =
    options?.signingMaterial ??
    (await prepareSigningMaterial(resolveSigningConfig(config)));

  return new AgentCapabilityRuntime(config, {
    audit: options?.audit ?? createAuditStore(config),
    approvals: options?.approvals ?? createApprovalStore(config),
    consumption,
    revocations,
    signingMaterial,
  });
}
