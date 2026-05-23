import { describe, expect, it } from "vitest";
import {
  constraintsFromJwt,
  constraintsToJwt,
  grantCapability,
  parseExpiresIn,
  validateCapability,
} from "./index.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("parseExpiresIn", () => {
  it("parses duration strings", () => {
    expect(parseExpiresIn("15m")).toBe(900);
    expect(parseExpiresIn("1h")).toBe(3600);
    expect(parseExpiresIn("30s")).toBe(30);
  });

  it("accepts seconds as number", () => {
    expect(parseExpiresIn(600)).toBe(600);
  });

  it("rejects invalid values", () => {
    expect(() => parseExpiresIn("bad")).toThrow();
    expect(() => parseExpiresIn(0)).toThrow();
  });
});

describe("constraintsToJwt / constraintsFromJwt", () => {
  it("round-trips constraint fields", () => {
    const original = {
      allowedDomains: ["company.com"],
      maxActions: 5,
      attachments: false,
      approvalRequiredIfExternal: true,
    };
    const jwt = constraintsToJwt(original);
    expect(jwt).toEqual({
      allowed_domains: ["company.com"],
      max_actions: 5,
      attachments: false,
      approval_required_if_external: true,
    });
    expect(constraintsFromJwt(jwt)).toEqual(original);
  });
});

describe("grantCapability", () => {
  it("mints a signed JWT with expected claims", async () => {
    const { token, claims, expiresAt } = await grantCapability(
      {
        agentId: "agent_1",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"], maxActions: 3 },
        delegator: "user_42",
        task: "support_email",
      },
      { secret: SECRET },
    );

    expect(token.split(".")).toHaveLength(3);
    expect(claims.sub).toBe("agent_1");
    expect(claims.tool).toBe("gmail.send");
    expect(claims.delegator).toBe("user_42");
    expect(claims.constraints.allowed_domains).toEqual(["company.com"]);
    expect(claims.jti).toMatch(/^cap_/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects unsupported tools at schema level", async () => {
    await expect(
      grantCapability(
        {
          agentId: "agent_1",
          tool: "unknown.tool" as "gmail.send",
          constraints: {},
        },
        { secret: SECRET },
      ),
    ).rejects.toThrow();
  });

  it("rejects expiresIn over 24 hours", async () => {
    await expect(
      grantCapability(
        {
          agentId: "agent_1",
          tool: "gmail.send",
          constraints: {},
          expiresIn: "25h",
        },
        { secret: SECRET },
      ),
    ).rejects.toThrow(/maximum/);
  });
});

describe("validateCapability", () => {
  it("validates a freshly granted token", async () => {
    const { token } = await grantCapability(
      {
        agentId: "agent_1",
        tool: "gmail.send",
        constraints: { maxActions: 1 },
      },
      { secret: SECRET },
    );

    const result = await validateCapability(token, {
      secret: SECRET,
      expectedTool: "gmail.send",
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.sub).toBe("agent_1");
    }
  });

  it("rejects wrong signing secret", async () => {
    const { token } = await grantCapability(
      { agentId: "a", tool: "slack.send", constraints: {} },
      { secret: SECRET },
    );

    const result = await validateCapability(token, {
      secret: "other-signing-secret-min-32-characters!",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(["INVALID_SIGNATURE", "INVALID_FORMAT"]).toContain(result.error.code);
    }
  });

  it("rejects tool mismatch", async () => {
    const { token } = await grantCapability(
      { agentId: "a", tool: "gmail.send", constraints: {} },
      { secret: SECRET },
    );

    const result = await validateCapability(token, {
      secret: SECRET,
      expectedTool: "slack.send",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("TOOL_MISMATCH");
    }
  });

  it("rejects expired tokens", async () => {
    const { token } = await grantCapability(
      {
        agentId: "a",
        tool: "http.request",
        constraints: {},
        expiresIn: 1,
      },
      { secret: SECRET },
    );

    await new Promise((r) => setTimeout(r, 1_100));

    const result = await validateCapability(token, {
      secret: SECRET,
      clockToleranceSec: 0,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("EXPIRED");
    }
  });
});
