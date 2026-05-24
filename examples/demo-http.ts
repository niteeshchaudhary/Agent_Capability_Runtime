/**
 * ACR demo against the HTTP gateway — start the server first:
 *
 *   Terminal 1:  pnpm dev:gateway
 *   Terminal 2:  pnpm demo:http
 */
import { AcrClient } from "@acr/sdk";
import {
  banner,
  colors,
  logDecision,
  pause,
  section,
  truncateToken,
} from "./demo-utils.js";

const BASE_URL = process.env.ACR_GATEWAY_URL ?? "http://localhost:3000";

async function checkHealth(): Promise<void> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Gateway not healthy: ${res.status}`);
  const body = (await res.json()) as { status: string; version: string };
  console.log(colors.ok(`   ✓ Gateway ${BASE_URL} — ${body.status} (v${body.version})`));
}

async function main() {
  banner();
  console.log(colors.dim(`  Mode: HTTP gateway at ${BASE_URL}\n`));

  try {
    await checkHealth();
  } catch {
    console.error(
      colors.deny(
        `\n   ✗ Cannot reach gateway at ${BASE_URL}\n` +
          "     Start it first:  pnpm dev:gateway\n" +
          "     And set ACR_SIGNING_SECRET in apps/gateway/.env\n",
      ),
    );
    process.exit(1);
  }

  const httpOnly = new AcrClient({ baseUrl: BASE_URL });

  await pause("Press Enter to run HTTP demo…");

  section(1, "POST /capabilities/grant", "Issue token via gateway");

  const { token, claims } = await httpOnly.grant({
    agentId: "demo_http_agent",
    tool: "gmail.send",
    constraints: {
      allowedDomains: ["company.com"],
      maxActions: 5,
      approvalRequired: true,
    },
    expiresIn: "15m",
  });

  console.log(colors.ok("   ✓ 201 Created"));
  console.log(colors.dim(`     sub=${claims.sub}  tool=${claims.tool}`));
  console.log(colors.dim(`     token=${truncateToken(token)}`));

  await pause();

  section(2, "POST /runtime/execute — REQUIRE_APPROVAL", "approval_required → 202");

  const pending = await httpOnly.execute({
    token,
    tool: "gmail.send",
    payload: { to: "user@company.com", subject: "Hi", body: "Hello via HTTP" },
  });

  logDecision("Execute", {
    ok: pending.ok,
    decision: pending.ok ? "ALLOW" : pending.decision,
    reason: !pending.ok ? pending.reason : undefined,
    approvalId: !pending.ok && "approvalId" in pending ? pending.approvalId : undefined,
  });

  if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
    await pause();

    section(3, "POST /approvals/:id/approve", "Human approves");

    await httpOnly.approve(pending.approvalId, "http_demo_reviewer");
    console.log(colors.ok("   ✓ Approved"));

    await pause();

    section(4, "POST /runtime/execute — resume", "Same request + approvalId → 200 ALLOW");

    const allowed = await httpOnly.execute({
      token,
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Hi", body: "Hello via HTTP" },
      approvalId: pending.approvalId,
    });

    logDecision("Execute (resumed)", {
      ok: allowed.ok,
      decision: allowed.ok ? "ALLOW" : allowed.decision,
      result: allowed.ok ? allowed.result : undefined,
      reason: !allowed.ok ? allowed.reason : undefined,
    });
  }

  await pause();

  section(5, "GET /audit", "Fetch audit events from gateway");

  const auditRes = await fetch(`${BASE_URL}/audit?limit=5`);
  const auditBody = (await auditRes.json()) as { events: { decision: string; tool: string }[] };
  console.log(colors.dim(`   Latest ${auditBody.events.length} events:`));
  for (const e of auditBody.events) {
    console.log(colors.dim(`     - ${e.decision}  ${e.tool}`));
  }

  console.log("");
  console.log(colors.ok("  HTTP demo complete."));
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
