export interface AuditChainConfig {
  /**
   * Enable tamper-evident hash chain on audit events.
   * Default `false` — opt-in only.
   */
  enabled?: boolean;
  /** HMAC signing secret (min 32 chars). When set, each event includes `signature`. */
  signingSecret?: string;
}

export interface ResolvedAuditChainConfig {
  enabled: boolean;
  signingSecret?: string;
  genesisHash: string;
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export function resolveAuditChainConfig(config?: AuditChainConfig): ResolvedAuditChainConfig {
  const enabled =
    config?.enabled ??
    (process.env.ACR_AUDIT_CHAIN_ENABLED?.trim().toLowerCase() === "true");

  const signingSecret =
    config?.signingSecret?.trim() ||
    process.env.ACR_AUDIT_CHAIN_SECRET?.trim() ||
    undefined;

  if (enabled && signingSecret !== undefined && signingSecret.length < 32) {
    throw new Error("audit chain signing secret must be at least 32 characters");
  }

  return {
    enabled,
    signingSecret,
    genesisHash: GENESIS_HASH,
  };
}
