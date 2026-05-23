import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { constraintsToJwt } from "./constraints-mapper.js";
import { createTokenId, parseExpiresIn } from "./duration.js";
import { grantCapabilityInputSchema } from "./schema.js";
import {
  DEFAULT_EXPIRES_IN,
  DEFAULT_ISSUER,
  MAX_EXPIRES_SEC,
  type CapabilityTokenClaims,
  type GrantCapabilityInput,
  type GrantCapabilityResult,
  type SignerOptions,
  type ToolId,
} from "./types.js";

function secretToKey(secret: string): Uint8Array {
  if (secret.length < 32) {
    throw new Error("Signing secret must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function grantCapability(
  input: GrantCapabilityInput,
  options: SignerOptions,
): Promise<GrantCapabilityResult> {
  const parsed = grantCapabilityInputSchema.parse(input);
  const issuer = parsed.issuer ?? options.issuer ?? DEFAULT_ISSUER;
  const expiresInSec = parseExpiresIn(parsed.expiresIn ?? DEFAULT_EXPIRES_IN);

  if (expiresInSec > MAX_EXPIRES_SEC) {
    throw new Error(`expiresIn exceeds maximum of ${MAX_EXPIRES_SEC} seconds (24h)`);
  }

  const now = Math.floor(Date.now() / 1_000);
  const exp = now + expiresInSec;
  const jti = createTokenId();

  const claims: CapabilityTokenClaims = {
    iss: issuer,
    sub: parsed.agentId,
    tool: parsed.tool as ToolId,
    constraints: constraintsToJwt(parsed.constraints),
    iat: now,
    exp,
    jti,
  };

  if (parsed.delegator !== undefined) claims.delegator = parsed.delegator;
  if (parsed.session !== undefined) claims.session = parsed.session;
  if (parsed.task !== undefined) claims.task = parsed.task;
  if (parsed.metadata !== undefined) claims.metadata = parsed.metadata;

  const payload: JWTPayload = { ...claims };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(issuer)
    .setSubject(parsed.agentId)
    .setJti(jti)
    .sign(secretToKey(options.secret));

  return {
    token,
    claims,
    expiresAt: new Date(exp * 1_000),
  };
}
