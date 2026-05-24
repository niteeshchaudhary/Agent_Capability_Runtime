import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { constraintsToJwt } from "./constraints-mapper.js";
import { normalizeExecutionIntent } from "./intent.js";
import { createTokenId, parseExpiresIn } from "./duration.js";
import { grantCapabilityInputSchema } from "./schema.js";
import { resolveSigningMaterial } from "./signing.js";
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
  if (parsed.intent !== undefined) {
    const normalized = normalizeExecutionIntent(parsed.intent);
    if (normalized) {
      claims.metadata = { ...claims.metadata, intent: normalized };
    }
  }
  if (parsed.metadata !== undefined) {
    claims.metadata = { ...claims.metadata, ...parsed.metadata };
  }
  if (parsed.parentJti !== undefined) claims.parent_jti = parsed.parentJti;
  if (parsed.delegationDepth !== undefined) claims.delegation_depth = parsed.delegationDepth;
  if (parsed.delegatorChain !== undefined) claims.delegator_chain = parsed.delegatorChain;

  const payload: JWTPayload = { ...claims };
  const material = await resolveSigningMaterial(options);

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: material.algorithm, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(issuer)
    .setSubject(parsed.agentId)
    .setJti(jti)
    .sign(material.signKey);

  return {
    token,
    claims,
    expiresAt: new Date(exp * 1_000),
  };
}
