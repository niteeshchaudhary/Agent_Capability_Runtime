import { serve } from "@hono/node-server";
import { loadAdapterConfigFromEnv } from "@acr/adapters";
import { AgentCapabilityRuntime } from "@acr/runtime";
import { createApp, GATEWAY_VERSION } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

const secret = process.env.ACR_SIGNING_SECRET;
if (!secret || secret.length < 32) {
  console.error("ACR_SIGNING_SECRET must be set (min 32 characters)");
  process.exit(1);
}

const runtime = new AgentCapabilityRuntime({
  secret,
  issuer: process.env.ACR_ISSUER ?? "acr-runtime",
  adapters: loadAdapterConfigFromEnv(),
  auditPath: process.env.ACR_AUDIT_PATH,
  approvalPath: process.env.ACR_APPROVAL_PATH,
});

const app = createApp(runtime);

console.log(`ACR Gateway v${GATEWAY_VERSION} listening on http://localhost:${PORT}`);

serve({ fetch: app.fetch, port: PORT });
