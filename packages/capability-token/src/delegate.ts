import { assertConstraintSubsetFromClaims } from "./constraint-subset.js";
import { grantCapability } from "./grant.js";
import { validateCapability } from "./validate.js";
import type { GrantCapabilityInput, GrantCapabilityResult, SignerOptions, ToolId } from "./types.js";

export interface DelegateCapabilityInput extends Omit<GrantCapabilityInput, "parentJti" | "delegationDepth" | "delegatorChain"> {
  /** Must match parent token tool unless explicitly narrowed in future versions */
  tool: ToolId;
}

export interface DelegateOptions extends SignerOptions {
  /** Maximum delegation depth (default 8) */
  maxDelegationDepth?: number;
}

/**
 * Issue a child capability delegated from a parent token (transitive authority).
 */
export async function delegateCapability(
  parentToken: string,
  input: DelegateCapabilityInput,
  options: DelegateOptions,
): Promise<GrantCapabilityResult> {
  const parentResult = await validateCapability(parentToken, {
    signingMaterial: options.signingMaterial,
    secret: options.secret,
    algorithm: options.algorithm,
    issuer: options.issuer,
    expectedTool: input.tool,
  });

  if (!parentResult.valid) {
    throw new Error(`Invalid parent capability: ${parentResult.error.message}`);
  }

  const parent = parentResult.claims;
  const maxDepth = options.maxDelegationDepth ?? 8;
  const nextDepth = (parent.delegation_depth ?? 0) + 1;

  if (nextDepth > maxDepth) {
    throw new Error(`Delegation depth ${nextDepth} exceeds maximum ${maxDepth}`);
  }

  const chain = [...(parent.delegator_chain ?? [])];
  if (parent.delegator) chain.push(parent.delegator);
  if (input.delegator) chain.push(input.delegator);

  assertConstraintSubsetFromClaims(parent, input.constraints);

  return grantCapability(
    {
      ...input,
      parentJti: parent.jti,
      delegationDepth: nextDepth,
      delegatorChain: chain,
    },
    options,
  );
}
