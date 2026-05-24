import { describe, expect, it } from "vitest";
import { can, domain } from "@acr/policy-engine";
import { AgentCapabilityRuntime } from "./runtime.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("intent-aware execution", () => {
  it("denies gmail.send when execute intent category mismatches policy", async () => {
    const runtime = new AgentCapabilityRuntime({
      secret: SECRET,
      adapters: { mode: "stub" },
    });
    const { token } = await runtime.grant(
      can("gmail.send")
        .whenIntent("customer_support")
        .where(domain.in(["company.com"]))
        .limit(5)
        .toGrantInput({ agentId: "agent_support", expiresIn: "1h" }),
    );

    const denied = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Promo blast" },
      intent: { category: "marketing", action: "bulk_campaign" },
      simulate: true,
    });

    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/intent category/i);

    const allowed = await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "user@company.com", subject: "Re: ticket #42" },
      intent: { category: "customer_support", action: "reply_email" },
      simulate: true,
    });

    expect(allowed.ok).toBe(true);
    expect(allowed.decision).toBe("SIMULATE");
  });
});
