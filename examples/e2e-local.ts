/**
 * End-to-end example: grant → execute (allow) → execute (deny)
 * Runs in-process without starting the HTTP gateway.
 */
import { AcrClient } from "@acr/sdk";

const SECRET = process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b";

async function main() {
  const client = new AcrClient({
    baseUrl: "http://localhost:3000",
    local: { secret: SECRET, adapters: { mode: "stub" } },
  });

  console.log("=== ACR End-to-End (in-process) ===\n");

  const { token } = await client.grant({
    agentId: "agent_e2e",
    tool: "gmail.send",
    constraints: {
      allowedDomains: ["company.com"],
      maxActions: 3,
      attachments: false,
    },
    expiresIn: "15m",
    delegator: "user_e2e",
    task: "demo_run",
  });

  console.log("Granted token for gmail.send\n");

  const allowed = await client.execute({
    token,
    tool: "gmail.send",
    payload: { to: "alice@company.com", subject: "Allowed", body: "Hi" },
  });

  console.log("Execute (company.com):", allowed.ok ? "ALLOW" : allowed);

  const denied = await client.execute({
    token,
    tool: "gmail.send",
    payload: { to: "bob@gmail.com", subject: "Blocked", body: "Hi" },
  });

  console.log("Execute (gmail.com):", denied.ok ? "ALLOW" : denied);

  const audits = client.getRuntime()?.audit.list() ?? [];
  console.log(`\nAudit events recorded: ${audits.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
