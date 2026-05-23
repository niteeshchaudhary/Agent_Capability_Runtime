import type { ToolId } from "@acr/capability-token";
import {
  type AdapterConfig,
  loadAdapterConfigFromEnv,
  resolveAdapterConfig,
  type ResolvedAdapterConfig,
} from "./config.js";
import { createGmailLiveAdapter } from "./gmail-live.js";
import { gmailStubAdapter } from "./gmail-stub.js";
import { httpAdapter } from "./http.js";
import { createSlackLiveAdapter } from "./slack-live.js";
import { slackStubAdapter } from "./slack-stub.js";
import type { ToolAdapter } from "./types.js";

export interface AdapterRegistry {
  get(tool: ToolId): ToolAdapter;
  list(): ToolId[];
  config: ResolvedAdapterConfig;
}

function buildRegistry(resolved: ResolvedAdapterConfig): AdapterRegistry {
  const gmail =
    resolved.mode === "live" && resolved.gmail
      ? createGmailLiveAdapter(resolved.gmail)
      : gmailStubAdapter;

  const slack =
    resolved.mode === "live" && resolved.slack
      ? createSlackLiveAdapter(resolved.slack)
      : slackStubAdapter;

  const adapters: Record<ToolId, ToolAdapter> = {
    "gmail.send": gmail,
    "slack.send": slack,
    "http.request": httpAdapter,
  };

  return {
    config: resolved,
    get(tool: ToolId) {
      const adapter = adapters[tool];
      if (!adapter) {
        throw new Error(`No adapter registered for tool: ${tool}`);
      }
      return adapter;
    },
    list() {
      return Object.keys(adapters) as ToolId[];
    },
  };
}

let defaultRegistry: AdapterRegistry | undefined;

export function createAdapterRegistry(config?: AdapterConfig): AdapterRegistry {
  const resolved = config ? resolveAdapterConfig(config) : loadAdapterConfigFromEnv();
  return buildRegistry(resolved);
}

/** Singleton registry (env-backed). Used when runtime has no explicit adapter config. */
export function getDefaultRegistry(): AdapterRegistry {
  defaultRegistry ??= createAdapterRegistry();
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  defaultRegistry = undefined;
}

/** @deprecated Prefer registry from AgentCapabilityRuntime */
export function getAdapter(tool: ToolId): ToolAdapter {
  return getDefaultRegistry().get(tool);
}

/** @deprecated Prefer registry.list() */
export function listAdapters(): ToolId[] {
  return getDefaultRegistry().list();
}
