import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadAdapterConfigFromEnv } from "@acr/adapters";
import {
  loadSigningConfigFromEnv,
  resolveSigningConfig,
} from "@acr/capability-token";
import { createAgentCapabilityRuntime } from "@acr/runtime";
import { parseAdminApiKeysFromEnv } from "./admin-auth.js";
import { createApp, GATEWAY_VERSION } from "./app.js";

/** Matches apps/gateway/.env.example — local dev only. */
const DEV_SIGNING_SECRET = "dev-secret-change-in-production-32b-minimum";

function loadLocalEnvFile(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

if (!process.env.ACR_SIGNING_SECRET && process.env.NODE_ENV !== "production") {
  process.env.ACR_SIGNING_SECRET = DEV_SIGNING_SECRET;
  console.warn(
    "ACR_SIGNING_SECRET not set — using built-in dev default. Copy apps/gateway/.env.example to .env or set ACR_SIGNING_SECRET in production.",
  );
}

const PORT = Number(process.env.PORT ?? 3000);

const signing = resolveSigningConfig({
  secret: process.env.ACR_SIGNING_SECRET,
  signing: loadSigningConfigFromEnv(),
});

if (signing.algorithm === "HS256") {
  if (!signing.secret || signing.secret.length < 32) {
    console.error("ACR_SIGNING_SECRET must be set (min 32 characters) for HS256");
    process.exit(1);
  }
} else if (!signing.privateKey || !signing.publicKey) {
  console.error(
    `${signing.algorithm} requires ACR_SIGNING_PRIVATE_KEY and ACR_SIGNING_PUBLIC_KEY (or *_PATH)`,
  );
  process.exit(1);
}

const consumptionMode = process.env.ACR_CONSUMPTION_MODE as "memory" | "redis" | undefined;
const revocationMode = process.env.ACR_REVOCATION_MODE as "memory" | "redis" | undefined;

const runtime = await createAgentCapabilityRuntime({
  signing,
  issuer: process.env.ACR_ISSUER ?? "acr-runtime",
  adapters: loadAdapterConfigFromEnv(),
  auditPath: process.env.ACR_AUDIT_PATH,
  approvalPath: process.env.ACR_APPROVAL_PATH,
  consumption: {
    mode: consumptionMode ?? (process.env.ACR_REDIS_URL ? "redis" : "memory"),
    redisUrl: process.env.ACR_REDIS_URL,
    keyPrefix: process.env.ACR_REDIS_KEY_PREFIX,
    ttlSec: process.env.ACR_CONSUMPTION_TTL_SEC
      ? Number(process.env.ACR_CONSUMPTION_TTL_SEC)
      : undefined,
  },
  revocation: {
    mode: revocationMode ?? "memory",
    redisUrl: process.env.ACR_REDIS_URL,
    keyPrefix: process.env.ACR_REDIS_KEY_PREFIX,
    ttlSec: process.env.ACR_REVOCATION_TTL_SEC
      ? Number(process.env.ACR_REVOCATION_TTL_SEC)
      : undefined,
  },
  auditChain: {
    enabled: process.env.ACR_AUDIT_CHAIN_ENABLED === "true",
    signingSecret: process.env.ACR_AUDIT_CHAIN_SECRET,
  },
});

const adminApiKeys = parseAdminApiKeysFromEnv();
if (adminApiKeys.length === 0) {
  console.warn(
    "ACR_ADMIN_API_KEY not set — grant/delegate are open (dev only). Set ACR_ADMIN_API_KEY in production.",
  );
}

const app = createApp(runtime, { adminAuth: { apiKeys: adminApiKeys } });

const consumptionLabel =
  consumptionMode === "redis" || process.env.ACR_REDIS_URL ? "redis" : "memory";
const revocationLabel = revocationMode === "redis" ? "redis" : "memory";
const sandboxEnabled = process.env.ACR_SANDBOX_ENABLED !== "false";
const auditChainEnabled = process.env.ACR_AUDIT_CHAIN_ENABLED === "true";
console.log(
  `ACR Gateway v${GATEWAY_VERSION} listening on http://localhost:${PORT} (signing: ${signing.algorithm}, consumption: ${consumptionLabel}, revocation: ${revocationLabel}, sandbox: ${sandboxEnabled ? "on" : "off"}, auditChain: ${auditChainEnabled ? "on" : "off"})`,
);

serve({ fetch: app.fetch, port: PORT });
