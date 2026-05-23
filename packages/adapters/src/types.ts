import type { ToolId } from "@acr/capability-token";

export interface ToolAdapter {
  readonly tool: ToolId;
  execute(payload: Record<string, unknown>): Promise<unknown>;
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
