/**
 * Approval workflow example: pause → approve → resume.
 */
import { AcrClient } from "@acr/sdk";

const SECRET = process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b";

async function main() {
  const client = new AcrClient({
    baseUrl: "http://localhost:3000",
    local: {
      secret: SECRET,
      adapters: { mode: "stub" },
      onApprovalRequired: (req) => {
        console.log(`[hook] Approval requested: ${req.id} — ${req.reason}`);
      },
    },
  });

  console.log("=== ACR Approval Workflow ===\n");

  const { token } = await client.grant({
    agentId: "agent_approval_demo",
    tool: "gmail.send",
    constraints: {
      allowedDomains: ["company.com"],
      approvalRequiredIfExternal: true,
      maxActions: 5,
    },
  });

  const payload = {
    to: "external@gmail.com",
    subject: "Needs approval",
    body: "Hello from agent",
  };

  const pending = await client.execute({
    token,
    tool: "gmail.send",
    payload,
  });

  if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
    console.log("Paused:", pending.reason);
    console.log("Approval ID:", pending.approvalId);

    const pendingList = await client.listApprovals({ status: "pending" });
    console.log(`Pending approvals: ${pendingList.approvals.length}`);

    await client.approve(pending.approvalId, "user_reviewer");

    const allowed = await client.execute({
      token,
      tool: "gmail.send",
      payload,
      approvalId: pending.approvalId,
    });

    console.log("\nAfter approval:", allowed.ok ? "ALLOW" : allowed);
  } else {
    console.log("Unexpected result:", pending);
    process.exit(1);
  }

  const audits = client.getRuntime()?.audit.list() ?? [];
  console.log(`\nAudit events: ${audits.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
