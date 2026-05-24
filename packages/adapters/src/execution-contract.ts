import type { CapabilityTokenClaims, ToolId } from "@acr/capability-token";

/**
 * Declarative execution context — adapters receive capability + intent, not raw payloads alone.
 * Enables interception, replay, sandboxing, and tracing in future versions.
 */
export interface ExecutionContext {
  capability: {
    jti: string;
    agentId: string;
    tool: ToolId;
    delegator?: string;
    parentJti?: string;
    delegationDepth?: number;
    delegatorChain?: string[];
  };
  intent?: string;
  payload: Record<string, unknown>;
  simulate: boolean;
  requestId?: string;
}

export interface ExecutionContract {
  readonly tool: ToolId;
  execute(ctx: ExecutionContext): Promise<unknown>;
}

export function claimsToExecutionCapability(
  claims: CapabilityTokenClaims,
): ExecutionContext["capability"] {
  return {
    jti: claims.jti,
    agentId: claims.sub,
    tool: claims.tool,
    delegator: claims.delegator,
    parentJti: claims.parent_jti,
    delegationDepth: claims.delegation_depth,
    delegatorChain: claims.delegator_chain,
  };
}
