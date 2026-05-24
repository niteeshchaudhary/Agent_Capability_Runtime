import { readFileSync } from "node:fs";
import type { webcrypto } from "node:crypto";
import { importPKCS8, importSPKI } from "jose";

/** Key accepted by `jose` sign/verify (HS256 secret bytes or asymmetric CryptoKey). */
export type JoseSigningKey = Uint8Array | webcrypto.CryptoKey;

export type CapabilitySigningAlgorithm = "HS256" | "RS256" | "EdDSA";

export interface SigningConfig {
  algorithm?: CapabilitySigningAlgorithm;
  /** HS256 shared secret (min 32 characters) */
  secret?: string;
  /** PEM PKCS#8 private key for RS256 / EdDSA issuance */
  privateKey?: string;
  /** PEM SPKI public key for RS256 / EdDSA verification */
  publicKey?: string;
}

export interface SigningMaterial {
  algorithm: CapabilitySigningAlgorithm;
  signKey: JoseSigningKey;
  verifyKey: JoseSigningKey;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

function readPemFromEnvOrFile(envPem: string | undefined, pathEnv: string | undefined): string | undefined {
  if (envPem) return envPem.replace(/\\n/g, "\n");
  const path = pathEnv ? readEnv(pathEnv) : undefined;
  if (!path) return undefined;
  return readFileSync(path, "utf8");
}

export function resolveSigningConfig(input: {
  secret?: string;
  signing?: SigningConfig;
}): SigningConfig {
  if (input.signing) {
    const algorithm = input.signing.algorithm ?? inferAlgorithm(input.signing);
    return {
      ...input.signing,
      algorithm,
      secret: input.signing.secret ?? input.secret,
    };
  }
  if (input.secret) {
    return { algorithm: "HS256", secret: input.secret };
  }
  throw new Error("Capability signing requires `signing` config or `secret` for HS256");
}

function inferAlgorithm(config: SigningConfig): CapabilitySigningAlgorithm {
  if (config.algorithm) return config.algorithm;
  if (config.privateKey || config.publicKey) {
    const envAlg = readEnv("ACR_SIGNING_ALGORITHM") as CapabilitySigningAlgorithm | undefined;
    if (envAlg === "RS256" || envAlg === "EdDSA") return envAlg;
    return "RS256";
  }
  return "HS256";
}

/** Load signing config from environment (gateway / server). */
export function loadSigningConfigFromEnv(): SigningConfig {
  const algorithm = readEnv("ACR_SIGNING_ALGORITHM") as CapabilitySigningAlgorithm | undefined;
  return {
    algorithm: algorithm ?? "HS256",
    secret: readEnv("ACR_SIGNING_SECRET"),
    privateKey: readPemFromEnvOrFile(
      readEnv("ACR_SIGNING_PRIVATE_KEY"),
      "ACR_SIGNING_PRIVATE_KEY_PATH",
    ),
    publicKey: readPemFromEnvOrFile(
      readEnv("ACR_SIGNING_PUBLIC_KEY"),
      "ACR_SIGNING_PUBLIC_KEY_PATH",
    ),
  };
}

function assertHs256Secret(secret: string): Uint8Array {
  if (secret.length < 32) {
    throw new Error("HS256 signing secret must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** Synchronous HS256 material for in-process runtimes and tests. */
export function createHs256SigningMaterial(secret: string): SigningMaterial {
  const key = assertHs256Secret(secret);
  return { algorithm: "HS256", signKey: key, verifyKey: key };
}

export async function prepareSigningMaterial(
  config: SigningConfig,
): Promise<SigningMaterial> {
  const algorithm = config.algorithm ?? "HS256";

  if (algorithm === "HS256") {
    if (!config.secret) {
      throw new Error("HS256 requires signing.secret or ACR_SIGNING_SECRET");
    }
    const key = assertHs256Secret(config.secret);
    return { algorithm, signKey: key, verifyKey: key };
  }

  if (!config.privateKey) {
    throw new Error(`${algorithm} signing requires privateKey`);
  }
  if (!config.publicKey) {
    throw new Error(`${algorithm} verification requires publicKey`);
  }

  const signKey = await importPKCS8(config.privateKey, algorithm);
  const verifyKey = await importSPKI(config.publicKey, algorithm);
  return { algorithm, signKey, verifyKey };
}

export function toSignerOptions(
  material: SigningMaterial,
  issuer?: string,
): import("./types.js").SignerOptions {
  return {
    algorithm: material.algorithm,
    signingMaterial: material,
    issuer,
  };
}

export function toValidatorOptions(
  material: SigningMaterial,
  extra?: Omit<import("./types.js").ValidatorOptions, "signingMaterial" | "algorithm" | "secret" | "publicKey">,
): import("./types.js").ValidatorOptions {
  return {
    algorithm: material.algorithm,
    signingMaterial: material,
    ...extra,
  };
}
