import type { ToolId } from "@acr/capability-token";

export interface SandboxConfig {
  /**
   * Enable sandbox enforcement around adapter execution.
   * Default `true`. Set `false` or `ACR_SANDBOX_ENABLED=false` to disable.
   */
  enabled?: boolean;
  /** Wall-clock limit per adapter invocation (default 30_000 ms) */
  executionTimeoutMs?: number;
  /** Max serialized HTTP response body size (default 1 MiB) */
  maxHttpResponseBytes?: number;
  /**
   * Block loopback, link-local, and RFC1918 targets for `http.request`.
   * Default `true`.
   */
  blockPrivateNetworks?: boolean;
  /** Optional global tool allowlist (normally the capability token scopes the tool) */
  allowedTools?: ToolId[];
}

export interface ResolvedSandboxConfig {
  enabled: boolean;
  executionTimeoutMs: number;
  maxHttpResponseBytes: number;
  blockPrivateNetworks: boolean;
  allowedTools?: ToolId[];
}

export type SandboxViolationCode =
  | "network_denied"
  | "timeout"
  | "response_too_large"
  | "tool_not_permitted"
  | "invalid_request";

export class SandboxViolation extends Error {
  readonly code: SandboxViolationCode;

  constructor(code: SandboxViolationCode, message: string) {
    super(message);
    this.name = "SandboxViolation";
    this.code = code;
  }
}
