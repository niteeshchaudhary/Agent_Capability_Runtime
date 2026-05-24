import type { CapabilitySigningAlgorithm, SigningMaterial } from "./signing-config.js";
import { prepareSigningMaterial } from "./signing-config.js";
import type { SignerOptions, ValidatorOptions } from "./types.js";

export async function resolveSigningMaterial(
  options: SignerOptions | ValidatorOptions,
): Promise<SigningMaterial> {
  if (options.signingMaterial) {
    return options.signingMaterial;
  }
  const algorithm = options.algorithm ?? "HS256";
  if (algorithm === "HS256") {
    if (!options.secret) {
      throw new Error("HS256 requires secret or signingMaterial");
    }
    return prepareSigningMaterial({ algorithm: "HS256", secret: options.secret });
  }
  throw new Error(`${algorithm} requires signingMaterial with imported keys`);
}

export function algorithmsForMaterial(
  material: SigningMaterial,
): CapabilitySigningAlgorithm[] {
  return [material.algorithm];
}
