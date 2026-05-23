import { grantCapability, validateCapability } from "../src/index.js";

const SECRET = process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b";

async function main() {
  console.log("=== ACR Capability Token Example ===\n");

  const { token, claims, expiresAt } = await grantCapability(
    {
      agentId: "agent_demo",
      tool: "gmail.send",
      constraints: {
        allowedDomains: ["company.com"],
        maxActions: 5,
        attachments: false,
      },
      expiresIn: "15m",
      delegator: "user_demo",
      task: "customer_support_email",
    },
    { secret: SECRET },
  );

  console.log("Granted capability:");
  console.log(JSON.stringify(claims, null, 2));
  console.log("\nExpires at:", expiresAt.toISOString());
  console.log("\nToken (truncated):", `${token.slice(0, 48)}...`);

  const validation = await validateCapability(token, {
    secret: SECRET,
    expectedTool: "gmail.send",
  });

  console.log("\nValidation:", validation.valid ? "VALID" : validation.error);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
