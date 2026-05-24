import { serve } from "@hono/node-server";
import { loadAdapterConfigFromEnv } from "@acr/adapters";
import { createAgentCapabilityRuntime } from "@acr/runtime";
import { parseAdminApiKeysFromEnv } from "./admin-auth.js";
import { createApp, GATEWAY_VERSION } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

const secret = process.env.ACR_SIGNING_SECRET;
if (!secret || secret.length < 32) {
  console.error("ACR_SIGNING_SECRET must be set (min 32 characters)");
  process.exit(1);
}

const consumptionMode = process.env.ACR_CONSUMPTION_MODE as "memory" | "redis" | undefined;

const runtime = await createAgentCapabilityRuntime({
  secret,
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
console.log(
  `ACR Gateway v${GATEWAY_VERSION} listening on http://localhost:${PORT} (consumption: ${consumptionLabel})`,
);

serve({ fetch: app.fetch, port: PORT });
