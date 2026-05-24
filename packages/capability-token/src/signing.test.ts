import { exportSPKI, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { grantCapability } from "./grant.js";
import { prepareSigningMaterial } from "./signing-config.js";
import { validateCapability } from "./validate.js";

const HS256_SECRET = "test-signing-secret-min-32-characters!!";

describe("capability signing algorithms", () => {
  it("grants and validates with HS256 (default)", async () => {
    const material = await prepareSigningMaterial({
      algorithm: "HS256",
      secret: HS256_SECRET,
    });
    const { token } = await grantCapability(
      {
        agentId: "agent_1",
        tool: "gmail.send",
        constraints: { maxActions: 3 },
      },
      { signingMaterial: material },
    );
    const result = await validateCapability(token, { signingMaterial: material });
    expect(result.valid).toBe(true);
  });

  it("grants and validates with RS256", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      modulusLength: 2048,
      extractable: true,
    });
    const material = await prepareSigningMaterial({
      algorithm: "RS256",
      privateKey: await exportPKCS8(privateKey),
      publicKey: await exportSPKI(publicKey),
    });

    const { token } = await grantCapability(
      {
        agentId: "agent_rs",
        tool: "slack.send",
        constraints: {},
      },
      { signingMaterial: material },
    );

    const header = JSON.parse(
      Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"),
    ) as { alg: string };
    expect(header.alg).toBe("RS256");

    const result = await validateCapability(token, { signingMaterial: material });
    expect(result.valid).toBe(true);

    await expect(
      jwtVerify(token, material.verifyKey, { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });

  it("grants and validates with EdDSA", async () => {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
    const material = await prepareSigningMaterial({
      algorithm: "EdDSA",
      privateKey: await exportPKCS8(privateKey),
      publicKey: await exportSPKI(publicKey),
    });

    const { token } = await grantCapability(
      {
        agentId: "agent_ed",
        tool: "http.request",
        constraints: { allowedMethods: ["GET"] },
      },
      { signingMaterial: material },
    );

    const result = await validateCapability(token, { signingMaterial: material });
    expect(result.valid).toBe(true);
  });
});
