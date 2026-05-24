import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  constraintsFromJwt,
  constraintsToJwt,
  decodeCapability,
  grantCapability,
  parseExpiresIn,
  validateCapability,
} from "./index.js";

const SECRET = "test-signing-secret-min-32-characters!!";

describe("parseExpiresIn (extended)", () => {
  it("parses 1d and numeric strings", () => {
    expect(parseExpiresIn("1d")).toBe(86_400);
    expect(parseExpiresIn("600")).toBe(600);
  });

  it("rejects negative and non-integer numbers", () => {
    expect(() => parseExpiresIn(-1)).toThrow();
    expect(() => parseExpiresIn(1.5)).toThrow();
  });
});

describe("constraintsToJwt / constraintsFromJwt (full)", () => {
  it("round-trips all constraint fields", () => {
    const original = {
      allowedDomains: ["company.com"],
      maxActions: 10,
      allowedMethods: ["get", "post"],
      allowedUrls: ["api.example.com"],
      attachments: true,
      spendingLimit: 100,
      allowedHours: { start: 9, end: 17 },
      approvalRequired: true,
      approvalRequiredIfExternal: false,
    };
    const jwt = constraintsToJwt(original);
    expect(jwt.allowed_methods).toEqual(["GET", "POST"]);
    expect(constraintsFromJwt(jwt)).toEqual({
      ...original,
      allowedMethods: ["GET", "POST"],
    });
  });

  it("returns empty objects for empty input", () => {
    expect(constraintsToJwt({})).toEqual({});
    expect(constraintsFromJwt({})).toEqual({});
  });
});

describe("grantCapability (extended)", () => {
  it("rejects signing secret shorter than 32 characters", async () => {
    await expect(
      grantCapability(
        { agentId: "a", tool: "gmail.send", constraints: {} },
        { secret: "too-short" },
      ),
    ).rejects.toThrow(/32 characters/);
  });

  it("includes optional claims session and metadata", async () => {
    const { claims } = await grantCapability(
      {
        agentId: "agent_meta",
        tool: "slack.send",
        constraints: {},
        session: "sess_xyz",
        metadata: { env: "test" },
        issuer: "custom-issuer",
      },
      { secret: SECRET },
    );
    expect(claims.session).toBe("sess_xyz");
    expect(claims.metadata).toEqual({ env: "test" });
    expect(claims.iss).toBe("custom-issuer");
  });

  it("accepts exactly 24h expiresIn", async () => {
    const { expiresAt } = await grantCapability(
      {
        agentId: "a",
        tool: "http.request",
        constraints: {},
        expiresIn: "24h",
      },
      { secret: SECRET },
    );
    const diffSec = (expiresAt.getTime() - Date.now()) / 1000;
    expect(diffSec).toBeGreaterThan(86_000);
    expect(diffSec).toBeLessThanOrEqual(86_400);
  });
});

describe("validateCapability (extended)", () => {
  it("rejects empty and malformed tokens", async () => {
    for (const token of ["", "not-a-jwt", "a.b"]) {
      const result = await validateCapability(token, { secret: SECRET });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe("INVALID_FORMAT");
      }
    }
  });

  it("rejects issuer mismatch", async () => {
    const { token } = await grantCapability(
      { agentId: "a", tool: "gmail.send", constraints: {}, issuer: "issuer-a" },
      { secret: SECRET, issuer: "issuer-a" },
    );
    const result = await validateCapability(token, {
      secret: SECRET,
      issuer: "issuer-b",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("ISSUER_MISMATCH");
    }
  });

  it("rejects invalid claims after signature verify", async () => {
    const key = new TextEncoder().encode(SECRET);
    const badToken = await new SignJWT({
      iss: "acr-runtime",
      sub: "agent_1",
      tool: "not.a.valid.tool",
      constraints: {},
      jti: "cap_bad",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key);

    const result = await validateCapability(badToken, { secret: SECRET });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_CLAIMS");
    }
  });

  it("decodeCapability validates without tool check", async () => {
    const { token } = await grantCapability(
      { agentId: "a", tool: "gmail.send", constraints: {} },
      { secret: SECRET },
    );
    const result = await decodeCapability(token, SECRET);
    expect(result.valid).toBe(true);
  });
});
