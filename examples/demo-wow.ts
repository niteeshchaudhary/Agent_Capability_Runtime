/**
 * "Holy shit" demo — three governance moments in ~30 seconds.
 *
 *   pnpm demo:wow
 *   pnpm demo:wow -- --auto   (default: no pauses)
 */
import { AcrClient, can } from "@acr/sdk";
import type { ExecuteResult } from "@acr/sdk";
import { banner, colors, logDecision, section } from "./demo-utils.js";

const SECRET =
  process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum";

function outcome(result: ExecuteResult) {
  if (result.ok) {
    return {
      ok: true as const,
      decision: result.decision,
      result: "result" in result ? result.result : undefined,
    };
  }
  return {
    ok: false as const,
    decision: result.decision,
    reason: result.reason,
    approvalId: "approvalId" in result ? result.approvalId : undefined,
  };
}

export async function main() {
  process.env.DEMO_AUTO = "1";
  banner();
  console.log(
    colors.bold(
      "\n  OAuth was built for humans clicking “Allow.”\n  Autonomous agents need runtime enforcement.\n",
    ),
  );

  const client = new AcrClient({
    baseUrl: "http://localhost:3000",
    local: { secret: SECRET, adapters: { mode: "stub" } },
  });
  const runtime = client.getRuntime()!;

  // ── 1. Block data exfiltration ────────────────────────────────────────
  section(
    1,
    "Agent tries to email an external address",
    "Policy: only @company.com — runtime blocks at execute",
  );

  const { token, claims } = await client.grant(
    can("gmail.send").onlyDomain("company.com").limit(5).expiresIn("10m").toGrantInput({
      agentId: "sales_agent",
      delegator: "user_42",
    }),
  );

  console.log(colors.dim(`   Capability issued (10m TTL, company.com only)\n`));

  const exfil = await client.execute({
    token,
    tool: "gmail.send",
    payload: {
      to: "attacker@gmail.com",
      subject: "Customer list",
      body: "Attached: all contacts",
    },
  });
  logDecision("gmail.send → attacker@gmail.com", outcome(exfil));

  const safe = await client.execute({
    token,
    tool: "gmail.send",
    payload: {
      to: "customer@company.com",
      subject: "Re: your ticket",
      body: "We are on it.",
    },
  });
  logDecision("gmail.send → customer@company.com", outcome(safe));

  // ── 2. High-value action needs approval ─────────────────────────────
  section(
    2,
    "Agent tries a payment over $100",
    "Policy: maxSpend($100) — runtime pauses for human approval",
  );

  const { token: payToken } = await client.grant(
    can("gmail.send")
      .onlyDomain("company.com")
      .maxSpend(10_000)
      .expiresIn("15m")
      .toGrantInput({ agentId: "finance_agent" }),
  );

  const bigSpend = await client.execute({
    token: payToken,
    tool: "gmail.send",
    payload: {
      to: "vendor@company.com",
      subject: "Wire transfer authorization",
      body: "Approve payment",
      amount: 25_000,
    },
  });
  logDecision("Payment $250.00", outcome(bigSpend));

  if (!bigSpend.ok && bigSpend.decision === "REQUIRE_APPROVAL" && bigSpend.approvalId) {
    await runtime.approve(bigSpend.approvalId, "cfo_demo");
    const approved = await client.execute({
      token: payToken,
      tool: "gmail.send",
      payload: {
        to: "vendor@company.com",
        subject: "Wire transfer authorization",
        body: "Approve payment",
        amount: 25_000,
      },
      approvalId: bigSpend.approvalId,
    });
    logDecision("After CFO approval", outcome(approved));
  }

  // ── 3. Instant revocation ───────────────────────────────────────────
  section(
    3,
    "Capability revoked mid-session",
    "Compromised agent — admin revokes jti; next execute is denied",
  );

  const { token: liveToken, claims: liveClaims } = await client.grant(
    can("gmail.send").onlyDomain("company.com").limit(10).toGrantInput({
      agentId: "compromised_agent",
    }),
  );

  const before = await client.execute({
    token: liveToken,
    tool: "gmail.send",
    payload: { to: "ops@company.com", subject: "Hi", body: "Before revoke" },
  });
  logDecision("Before revoke", outcome(before));

  await runtime.revoke(liveClaims.jti, { reason: "SOC: compromised session" });
  console.log(colors.warn(`\n   ⚡ runtime.revoke("${liveClaims.jti}")`));

  const after = await client.execute({
    token: liveToken,
    tool: "gmail.send",
    payload: { to: "ops@company.com", subject: "Hi", body: "After revoke" },
  });
  logDecision("After revoke", outcome(after));

  // ── Audit ─────────────────────────────────────────────────────────────
  section(4, "Audit trail", "Every decision recorded");
  const events = runtime.audit.list({ limit: 6 });
  for (const e of events) {
    console.log(
      colors.dim(
        `   ${e.timestamp.slice(11, 19)} ${e.decision.padEnd(16)} ${e.tool} ${e.reason ?? ""}`,
      ),
    );
  }

  console.log(colors.ok("\n  ✓ Demo complete — try: pnpm demo (full walkthrough)\n"));
}

const isMain =
  process.argv[1]?.endsWith("demo-wow.ts") || process.argv[1]?.endsWith("demo-wow.js");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
