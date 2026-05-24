/**
 * Minimal example — grant, allow, deny in under 25 lines of logic.
 * Run: pnpm minimal
 */
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://unused", // in-process when `local` is set
  local: {
    secret: process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum",
    adapters: { mode: "stub" },
  },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(3).expiresIn("10m").toGrantInput({
    agentId: "agent_demo",
  }),
);

const allowed = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "ok@company.com", subject: "Hi", body: "Allowed." },
});
console.log("ALLOW:", allowed.ok, allowed.ok ? "" : allowed.reason);

const denied = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "no@gmail.com", subject: "Hi", body: "Blocked." },
});
console.log("DENY:", denied.ok === false, denied.ok ? "" : denied.reason);
