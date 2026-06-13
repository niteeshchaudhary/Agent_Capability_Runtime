import type { OpaBackendConfig, OpaMode } from "./types.js";

function parseMode(raw: string | undefined): OpaMode | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "enforce" || v === "shadow" || v === "disabled") {
    return v;
  }
  throw new Error(`ACR_OPA_MODE must be enforce, shadow, or disabled (got ${raw})`);
}

/** Load OPA backend config from environment variables. */
export function loadOpaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OpaBackendConfig | undefined {
  const url = env.ACR_OPA_URL?.trim();
  const bundlePath = env.ACR_OPA_BUNDLE_PATH?.trim();
  const mode = parseMode(env.ACR_OPA_MODE?.trim());

  if (!url && !bundlePath && !mode) {
    return undefined;
  }

  const config: OpaBackendConfig = {
    url: url || undefined,
    bundlePath: bundlePath || undefined,
    decisionPath: env.ACR_OPA_DECISION_PATH?.trim() || "acr/decision",
    mode: mode ?? (url || bundlePath ? "enforce" : "disabled"),
  };

  if (env.ACR_OPA_TIMEOUT_MS) {
    const ms = Number(env.ACR_OPA_TIMEOUT_MS);
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new Error("ACR_OPA_TIMEOUT_MS must be a positive number");
    }
    config.timeoutMs = ms;
  }

  return config;
}
