/**
 * MCP tool-call governance — enforce ACR policies at the MCP boundary.
 */

import type { ToolId } from "@acr/capability-token";
import { can, method, url, type PolicyBuilder } from "@acr/policy-engine";
import { AcrClient, type AcrClientHttpConfig, type ExecuteResult } from "./client.js";

export type McpEnforceMode = "enforce" | "shadow" | "disabled";
export type McpDefaultAction = "allow" | "deny";

export interface McpToolPolicyInput {
  description?: string;
  acr_tool?: ToolId;
  deny?: boolean;
  methods?: string[];
  allowed_urls?: string[];
  max_actions?: number;
  expires_in?: string;
  require_approval?: boolean;
  payload_fields?: string[];
}

export interface McpPolicyConfigInput {
  enabled?: boolean;
  agent_id?: string;
  mode?: McpEnforceMode;
  default_action?: McpDefaultAction;
  tools?: Record<string, McpToolPolicyInput>;
  refusal_message?: string;
  client?: AcrClientHttpConfig;
}

export interface McpCheckResult {
  allowed: boolean;
  reason: string;
  mcpTool: string;
  acrTool?: string;
  decision?: string;
  auditId?: string;
}

const DEFAULT_REFUSAL =
  "Blocked by Agent Capability Runtime: this MCP tool call is not permitted.";

interface CompiledToolPolicy {
  mcpTool: string;
  acrTool: ToolId;
  deny: boolean;
  builder?: PolicyBuilder;
  payloadFields?: string[];
}

export class McpToolGuard {
  private readonly config: Required<
    Pick<McpPolicyConfigInput, "agent_id" | "mode" | "default_action" | "refusal_message">
  > & { tools: Record<string, CompiledToolPolicy> };
  private readonly client: AcrClient;
  private readonly tokens = new Map<string, string>(); // mcpTool -> token
  private readonly simulate: boolean;

  constructor(input: McpPolicyConfigInput) {
    const mode = input.mode ?? "enforce";
    if (mode !== "enforce" && mode !== "shadow" && mode !== "disabled") {
      throw new Error("mode must be enforce, shadow, or disabled");
    }

    this.config = {
      agent_id: input.agent_id ?? "mcp_agent",
      mode,
      default_action: input.default_action ?? "deny",
      refusal_message: input.refusal_message ?? DEFAULT_REFUSAL,
      tools: {},
    };

    for (const [name, spec] of Object.entries(input.tools ?? {})) {
      this.config.tools[name] = compileToolPolicy(name, spec);
    }

    const clientConfig =
      input.client ??
      ({
        baseUrl: "http://unused",
        local: {
          secret: process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum",
          adapters: { mode: "stub" },
        },
      } satisfies AcrClientHttpConfig);

    this.client = new AcrClient(clientConfig);
    this.simulate = !clientConfig.local;
  }

  get mode(): McpEnforceMode {
    return this.config.mode;
  }

  static fromConfig(input: McpPolicyConfigInput): McpToolGuard {
    return new McpToolGuard(input);
  }

  async init(): Promise<void> {
    for (const [name, policy] of Object.entries(this.config.tools)) {
      if (policy.deny || !policy.builder) continue;
      const grant = await this.client.grant(
        policy.builder.toGrantInput({ agentId: this.config.agent_id }),
      );
      this.tokens.set(name, grant.token);
    }
  }

  checkSync(_toolName: string, _arguments?: Record<string, unknown>): McpCheckResult {
    throw new Error("Use check() — MCP guard requires async ACR execute");
  }

  async check(toolName: string, args: Record<string, unknown> = {}): Promise<McpCheckResult> {
    if (this.config.mode === "disabled") {
      return { allowed: true, reason: "MCP guard disabled", mcpTool: toolName };
    }

    const policy = this.config.tools[toolName];
    if (!policy) {
      if (this.config.default_action === "allow") {
        return {
          allowed: true,
          reason: "unlisted tool allowed by default_action",
          mcpTool: toolName,
        };
      }
      return {
        allowed: false,
        reason: `no policy for MCP tool ${JSON.stringify(toolName)}`,
        mcpTool: toolName,
        decision: "DENY",
      };
    }

    if (policy.deny) {
      return {
        allowed: false,
        reason: `tool ${toolName} explicitly denied`,
        mcpTool: toolName,
        acrTool: policy.acrTool,
        decision: "DENY",
      };
    }

    await this.ensureToken(toolName, policy);
    const token = this.tokens.get(toolName);
    if (!token) {
      throw new Error(`Missing token for MCP tool ${toolName}`);
    }

    const result = await this.client.execute({
      token,
      tool: policy.acrTool,
      payload: buildPayload(policy, args),
      simulate: this.simulate,
    });

    return mapExecuteResult(toolName, policy.acrTool, result);
  }

  async checkOrRefuse(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<string | undefined> {
    const result = await this.check(toolName, args);
    if (result.allowed || this.config.mode === "shadow") return undefined;
    const code = result.decision ? ` (${result.decision})` : "";
    return `${this.config.refusal_message}${code}: ${result.reason}`;
  }

  private async ensureToken(mcpTool: string, policy: CompiledToolPolicy): Promise<void> {
    if (policy.deny || !policy.builder || this.tokens.has(mcpTool)) return;
    const grant = await this.client.grant(
      policy.builder.toGrantInput({ agentId: this.config.agent_id }),
    );
    this.tokens.set(mcpTool, grant.token);
  }
}

function compileToolPolicy(name: string, spec: McpToolPolicyInput): CompiledToolPolicy {
  const acrTool = (spec.acr_tool ?? "http.request") as ToolId;
  if (spec.deny) {
    return { mcpTool: name, acrTool, deny: true };
  }

  let builder = can(acrTool);
  if (spec.methods?.length) {
    builder = builder.where(method.in(spec.methods));
  }
  if (spec.allowed_urls?.length) {
    builder = builder.where(url.in(spec.allowed_urls));
  }
  if (spec.max_actions !== undefined) {
    builder = builder.limit(spec.max_actions);
  }
  if (spec.expires_in) {
    builder = builder.expiresIn(spec.expires_in);
  }
  if (spec.require_approval) {
    builder = builder.requireApproval();
  }

  return {
    mcpTool: name,
    acrTool,
    deny: false,
    builder,
    payloadFields: spec.payload_fields,
  };
}

function buildPayload(
  policy: CompiledToolPolicy,
  args: Record<string, unknown>,
): Record<string, unknown> {
  let payload: Record<string, unknown> = { mcpTool: policy.mcpTool, ...args };
  if (policy.acrTool === "http.request") {
    normalizeHttpPayload(payload);
  }
  if (policy.payloadFields?.length) {
    payload = { mcpTool: policy.mcpTool };
    for (const key of policy.payloadFields) {
      if (key in args) payload[key] = args[key];
    }
    if (policy.acrTool === "http.request") {
      normalizeHttpPayload(payload);
    }
  }
  return payload;
}

function normalizeHttpPayload(payload: Record<string, unknown>): void {
  if (!payload.url && payload.path) {
    const path = String(payload.path);
    payload.url = path.includes("://") ? path : `file://${path}`;
  }
  if (!payload.method) {
    payload.method = "GET";
  }
}

function mapExecuteResult(
  mcpTool: string,
  acrTool: ToolId,
  result: ExecuteResult,
): McpCheckResult {
  if (result.ok) {
    return {
      allowed: true,
      reason: "policy allowed",
      mcpTool,
      acrTool,
      decision: result.decision,
      auditId: result.auditId,
    };
  }
  return {
    allowed: false,
    reason: result.reason ?? "denied by policy",
    mcpTool,
    acrTool,
    decision: result.decision,
    auditId: result.auditId,
  };
}
