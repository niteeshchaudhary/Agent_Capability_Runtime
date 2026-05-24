/**
 * ACR live demo — run end-to-end in-process (no gateway required).
 *
 *   pnpm demo              # interactive (pause between steps)
 *   pnpm demo -- --auto    # run straight through (CI / recording)
 */
import { AcrClient } from "@acr/sdk";
import type { ExecuteResult } from "@acr/sdk";
import {
  banner,
  colors,
  logDecision,
  logJson,
  pause,
  section,
  truncateToken,
} from "./demo-utils.js";

const SECRET =
  process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum";

function asOutcome(result: ExecuteResult) {
  if (result.ok) {
    return { ok: true as const, result: result.result };
  }
  return {
    ok: false as const,
    decision: result.decision,
    reason: result.reason,
    approvalId: "approvalId" in result ? result.approvalId : undefined,
  };
}

async function main() {
  banner();

  console.log(
    colors.dim(
      "  This demo shows how ACR issues short-lived capability tokens,\n" +
        "  enforces policy at execution time, pauses for human approval,\n" +
        "  and records every decision in an audit log.\n",
    ),
  );

  const client = new AcrClient({
    baseUrl: "http://localhost:3000",
    local: {
      secret: SECRET,
      adapters: { mode: "stub" },
      onApprovalRequired: (req) => {
        console.log(colors.warn(`\n   [hook] Human approval requested: ${req.id}`));
        console.log(colors.dim(`          Reason: ${req.reason}`));
      },
    },
  });

  await pause("Ready? Press Enter to start the demo.");

  // ── Step 1: Grant ─────────────────────────────────────────────────────
  section(
    1,
    "Grant a capability token",
    "Agent gets gmail.send with company.com only, max 3 actions, no attachments",
  );

  const constraints = {
    allowedDomains: ["company.com"],
    maxActions: 3,
    attachments: false,
  };

  logJson("Constraints", constraints);

  const { token, claims } = await client.grant({
    agentId: "demo_support_agent",
    tool: "gmail.send",
    constraints,
    expiresIn: "15m",
    delegator: "demo_user_42",
    task: "customer_outreach",
  });

  console.log(colors.ok("\n   ✓ Capability granted"));
  console.log(colors.dim(`     Agent:  ${claims.sub}`));
  console.log(colors.dim(`     Tool:   ${claims.tool}`));
  console.log(colors.dim(`     JTI:    ${claims.jti}`));
  console.log(colors.dim(`     Token:  ${truncateToken(token)}`));

  await pause();

  // ── Step 2: ALLOW ─────────────────────────────────────────────────────
  section(2, "Execute — allowed recipient", "to: alice@company.com → policy allows");

  const allow1 = await client.execute({
    token,
    tool: "gmail.send",
    payload: {
      to: "alice@company.com",
      subject: "Your support ticket #1042",
      body: "Hi Alice, we are looking into your request.",
    },
  });
  logDecision("Send email", asOutcome(allow1));

  await pause();

  // ── Step 3: DENY ──────────────────────────────────────────────────────
  section(3, "Execute — blocked recipient", "to: bob@gmail.com → outside allowed_domains");

  const deny1 = await client.execute({
    token,
    tool: "gmail.send",
    payload: {
      to: "bob@gmail.com",
      subject: "Blocked attempt",
      body: "This should not send.",
    },
  });
  logDecision("Send email", asOutcome(deny1));

  await pause();

  section(3.1, "Execute — blocked attachment", "attachments: false in token");

  const denyAttach = await client.execute({
    token,
    tool: "gmail.send",
    payload: {
      to: "eve@company.com",
      subject: "With attachment",
      body: "See attached.",
      attachments: [{ filename: "secret.pdf" }],
    },
  });
  logDecision("Send with attachment", asOutcome(denyAttach));

  await pause();

  // ── Step 4: REQUIRE_APPROVAL ──────────────────────────────────────────
  section(
    4,
    "Grant token with approval for external recipients",
    "New capability: approvalRequiredIfExternal",
  );

  const { token: approvalToken } = await client.grant({
    agentId: "demo_support_agent",
    tool: "gmail.send",
    constraints: {
      allowedDomains: ["company.com"],
      maxActions: 5,
      approvalRequiredIfExternal: true,
    },
    expiresIn: "15m",
    delegator: "demo_user_42",
  });
  console.log(colors.ok(`   ✓ Token for approval flow: ${truncateToken(approvalToken)}`));

  section(
    4.1,
    "Execute — external domain needs approval",
    "Partner at gmail.com → REQUIRE_APPROVAL",
  );

  const externalPayload = {
    to: "partner@gmail.com",
    subject: "Partnership follow-up",
    body: "Following up on our call.",
  };

  const pending = await client.execute({
    token: approvalToken,
    tool: "gmail.send",
    payload: externalPayload,
  });
  logDecision("Send email", asOutcome(pending));

  if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
    await pause("Simulate manager reviewing the request…");

    section(4.2, "Manager approves", `POST /approvals/${pending.approvalId}/approve`);
    await client.approve(pending.approvalId, "manager_demo");
    console.log(colors.ok(`   ✓ Approved by manager_demo`));

    await pause();

    section(4.3, "Agent retries with approvalId", "Same token + payload + approvalId → ALLOW");

    const resumed = await client.execute({
      token: approvalToken,
      tool: "gmail.send",
      payload: externalPayload,
      approvalId: pending.approvalId,
    });
    logDecision("Send email (resumed)", asOutcome(resumed));
  }

  await pause();

  // ── Step 5: maxActions ────────────────────────────────────────────────
  section(5, "Enforce max_actions", "Original token allows 3 sends total");

  const runtime = client.getRuntime()!;
  const jti = claims.jti;
  console.log(colors.dim(`   Actions used so far: ${runtime.actions.get(jti)} / 3`));

  const allow2 = await client.execute({
    token,
    tool: "gmail.send",
    payload: { to: "carol@company.com", subject: "Update", body: "Status update." },
  });
  logDecision("Send #2", asOutcome(allow2));
  console.log(colors.dim(`   Actions used: ${runtime.actions.get(jti)} / 3`));

  const allow3 = await client.execute({
    token,
    tool: "gmail.send",
    payload: { to: "dave@company.com", subject: "Third", body: "Last allowed send." },
  });
  logDecision("Send #3", asOutcome(allow3));
  console.log(colors.dim(`   Actions used: ${runtime.actions.get(jti)} / 3`));

  const overLimit = await client.execute({
    token,
    tool: "gmail.send",
    payload: { to: "frank@company.com", subject: "Over limit", body: "Should deny." },
  });
  logDecision("Send #4 (over limit)", asOutcome(overLimit));

  await pause();

  // ── Step 6: Slack ─────────────────────────────────────────────────────
  section(6, "Different tool — Slack", "New grant for slack.send");

  const { token: slackToken } = await client.grant({
    agentId: "demo_ops_agent",
    tool: "slack.send",
    constraints: { maxActions: 5 },
    expiresIn: "15m",
  });

  const slackResult = await client.execute({
    token: slackToken,
    tool: "slack.send",
    payload: { channel: "#customer-success", text: "Ticket #1042 resolved ✓" },
  });
  logDecision("Post to Slack", asOutcome(slackResult));

  await pause();

  // ── Step 7: Audit ─────────────────────────────────────────────────────
  section(7, "Audit trail", "Every allow / deny / approval is recorded");

  const events = runtime.audit.list();
  console.log(colors.dim(`   Total events: ${events.length}\n`));

  for (const event of events.slice(-8)) {
    const icon =
      event.decision === "ALLOW"
        ? colors.ok("✓")
        : event.decision === "REQUIRE_APPROVAL"
          ? colors.warn("⏸")
          : colors.deny("✗");
    const line = `${icon} ${event.decision.padEnd(18)} ${event.tool.padEnd(12)} agent=${event.agentId}`;
    console.log(`   ${line}`);
    if (event.reason) console.log(colors.dim(`       → ${event.reason}`));
  }

  // ── Done ──────────────────────────────────────────────────────────────
  console.log("");
  console.log(colors.title("  ═══════════════════════════════════════════════════════════"));
  console.log(colors.ok("  Demo complete — ACR enforced policy on every action."));
  console.log(colors.dim("  Run with gateway:  pnpm demo:http  (start gateway first)"));
  console.log(colors.dim("  Auto (no pauses):  pnpm demo -- --auto"));
  console.log(colors.title("  ═══════════════════════════════════════════════════════════"));
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
