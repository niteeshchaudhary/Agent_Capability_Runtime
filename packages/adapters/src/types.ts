import type { CapabilityTokenClaims, ToolId } from "@acr/capability-token";
import type { ExecutionContext } from "./execution-contract.js";

export type { ExecutionContext, ExecutionContract } from "./execution-contract.js";
export { claimsToExecutionCapability } from "./execution-contract.js";

export interface ToolAdapter {
  readonly tool: ToolId;
  execute(payload: Record<string, unknown>): Promise<unknown>;
  /** Preferred path — capability-scoped execution */
  executeWithContext?(ctx: ExecutionContext): Promise<unknown>;
}

export interface GmailSendResult {
  messageId: string;
  status: "sent";
  to: string;
  mode?: "stub" | "live";
}

export interface SlackSendResult {
  messageTs: string;
  channel: string;
  status: "posted";
  mode?: "stub" | "live";
}

export interface HttpRequestResult {
  status: number;
  statusText: string;
  url: string;
  method: string;
  body?: unknown;
}
