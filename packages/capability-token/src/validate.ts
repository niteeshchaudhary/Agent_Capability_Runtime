import { errors, jwtVerify } from "jose";
import { capabilityTokenClaimsSchema } from "./schema.js";
import { algorithmsForMaterial, resolveSigningMaterial } from "./signing.js";
import {
  type CapabilityTokenClaims,
  type ValidationFailure,
  type ValidationResult,
  type ValidatorOptions,
} from "./types.js";

function failure(
  code: ValidationFailure["error"]["code"],
  message: string,
): ValidationFailure {
  return { valid: false, error: { code, message } };
}

export async function validateCapability(
  token: string,
  options: ValidatorOptions,
): Promise<ValidationResult> {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return failure("INVALID_FORMAT", "Token must be a compact JWT string");
  }

  let payload: Record<string, unknown>;

  try {
    const material = await resolveSigningMaterial(options);
    const { payload: verified } = await jwtVerify(token, material.verifyKey, {
      algorithms: algorithmsForMaterial(material),
      clockTolerance: options.clockToleranceSec ?? 5,
    });
    payload = verified as Record<string, unknown>;
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return failure("EXPIRED", "Capability token has expired");
    }
    if (err instanceof errors.JWTClaimValidationFailed) {
      const claim = err.claim;
      if (claim === "exp") {
        return failure("EXPIRED", "Capability token has expired");
      }
      if (claim === "nbf" || claim === "iat") {
        return failure("NOT_YET_VALID", "Capability token is not yet valid");
      }
    }
    if (err instanceof errors.JWSSignatureVerificationFailed) {
      return failure("INVALID_SIGNATURE", "Invalid token signature");
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure("INVALID_FORMAT", message);
  }

  const parsed = capabilityTokenClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(
      "INVALID_CLAIMS",
      parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    );
  }

  const claims = parsed.data as CapabilityTokenClaims;

  if (options.issuer !== undefined && claims.iss !== options.issuer) {
    return failure(
      "ISSUER_MISMATCH",
      `Expected issuer "${options.issuer}", got "${claims.iss}"`,
    );
  }

  if (options.expectedTool !== undefined && claims.tool !== options.expectedTool) {
    return failure(
      "TOOL_MISMATCH",
      `Expected tool "${options.expectedTool}", token grants "${claims.tool}"`,
    );
  }

  return { valid: true, claims };
}

/** Decode and validate without tool/issuer checks — useful for inspection */
export async function decodeCapability(
  token: string,
  options: ValidatorOptions | string,
): Promise<ValidationResult> {
  const validator =
    typeof options === "string" ? { secret: options } satisfies ValidatorOptions : options;
  return validateCapability(token, validator);
}
