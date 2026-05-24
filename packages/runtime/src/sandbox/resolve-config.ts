import type { SandboxConfig, ResolvedSandboxConfig } from "./types.js";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function resolveSandboxConfig(config?: SandboxConfig): ResolvedSandboxConfig {
  const enabled =
    config?.enabled ??
    envFlag("ACR_SANDBOX_ENABLED", true);

  const timeoutFromEnv = process.env.ACR_SANDBOX_TIMEOUT_MS;
  const maxBytesFromEnv = process.env.ACR_SANDBOX_MAX_HTTP_BYTES;

  return {
    enabled,
    executionTimeoutMs:
      config?.executionTimeoutMs ??
      (timeoutFromEnv ? Number.parseInt(timeoutFromEnv, 10) : 30_000),
    maxHttpResponseBytes:
      config?.maxHttpResponseBytes ??
      (maxBytesFromEnv ? Number.parseInt(maxBytesFromEnv, 10) : 1_048_576),
    blockPrivateNetworks:
      config?.blockPrivateNetworks ??
      envFlag("ACR_SANDBOX_BLOCK_PRIVATE", true),
    allowedTools: config?.allowedTools,
  };
}
