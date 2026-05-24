import type {
  CapabilityTokenClaims,
  ConstraintSet,
  DelegateCapabilityInput,
  GrantCapabilityInput,
  ToolId,
} from "@acr/capability-token";
import { AgentCapabilityRuntime, type ExecuteResult, type RuntimeConfig } from "@acr/runtime";

export interface AcrClientHttpConfig {
  baseUrl: string;
  /** When set, grant/execute use local runtime instead of HTTP */
  local?: RuntimeConfig;
  /** RFC-0005: Bearer token for POST /capabilities/grant and /delegate */
  adminApiKey?: string;
}

export interface GrantResponse {
  token: string;
  claims: CapabilityTokenClaims;
  expiresAt: string;
}

export interface ExecuteHttpResponse {
  decision: string;
  result?: unknown;
  reason?: string;
  auditId: string;
  approvalId?: string;
  code?: string;
  evaluatedConditions?: { kind: string; passed: boolean; reason?: string }[];
}

export interface ExecuteInput {
  token: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  approvalId?: string;
  requestId?: string;
  intent?: string;
  simulate?: boolean;
}

/**
 * HTTP client for ACR gateway, or in-process runtime when `local` config is provided.
 */
export class AcrClient {
  private readonly baseUrl: string;
  private readonly adminApiKey?: string;
  private readonly localRuntime?: AgentCapabilityRuntime;

  constructor(config: AcrClientHttpConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.adminApiKey = config.adminApiKey;
    if (config.local) {
      this.localRuntime = new AgentCapabilityRuntime(config.local);
    }
  }

  private issuanceHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.adminApiKey) {
      headers.Authorization = `Bearer ${this.adminApiKey}`;
    }
    return headers;
  }

  async grant(input: GrantCapabilityInput): Promise<GrantResponse> {
    if (this.localRuntime) {
      const result = await this.localRuntime.grant(input);
      return {
        token: result.token,
        claims: result.claims,
        expiresAt: result.expiresAt.toISOString(),
      };
    }

    const res = await fetch(`${this.baseUrl}/capabilities/grant`, {
      method: "POST",
      headers: this.issuanceHeaders(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Grant failed: ${res.status}`);
    }

    return res.json() as Promise<GrantResponse>;
  }

  async listApprovals(query?: {
    status?: "pending" | "approved" | "rejected";
    agentId?: string;
    tool?: ToolId;
  }): Promise<{ approvals: import("@acr/runtime").ApprovalRequest[] }> {
    if (this.localRuntime) {
      return { approvals: this.localRuntime.approvals.list(query) };
    }

    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.agentId) params.set("agentId", query.agentId);
    if (query?.tool) params.set("tool", query.tool);

    const res = await fetch(`${this.baseUrl}/approvals?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`List approvals failed: ${res.status}`);
    }
    return res.json() as Promise<{ approvals: import("@acr/runtime").ApprovalRequest[] }>;
  }

  async approve(approvalId: string, resolvedBy?: string): Promise<void> {
    if (this.localRuntime) {
      this.localRuntime.approve(approvalId, resolvedBy);
      return;
    }

    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resolvedBy ? { resolvedBy } : {}),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Approve failed: ${res.status}`);
    }
  }

  async reject(approvalId: string, resolvedBy?: string): Promise<void> {
    if (this.localRuntime) {
      this.localRuntime.reject(approvalId, resolvedBy);
      return;
    }

    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resolvedBy ? { resolvedBy } : {}),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Reject failed: ${res.status}`);
    }
  }

  async delegate(
    parentToken: string,
    input: DelegateCapabilityInput,
  ): Promise<GrantResponse> {
    if (this.localRuntime) {
      const result = await this.localRuntime.delegate(parentToken, input);
      return {
        token: result.token,
        claims: result.claims,
        expiresAt: result.expiresAt.toISOString(),
      };
    }

    const res = await fetch(`${this.baseUrl}/capabilities/delegate`, {
      method: "POST",
      headers: this.issuanceHeaders(),
      body: JSON.stringify({ parentToken, ...input }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Delegate failed: ${res.status}`);
    }

    return res.json() as Promise<GrantResponse>;
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    if (this.localRuntime) {
      return this.localRuntime.execute(input);
    }

    const res = await fetch(`${this.baseUrl}/runtime/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const body = (await res.json()) as ExecuteHttpResponse;

    if (res.status === 200 && body.decision === "SIMULATE") {
      return {
        ok: true,
        decision: "SIMULATE",
        reason: body.reason,
        auditId: body.auditId,
        claims: {} as CapabilityTokenClaims,
        evaluatedConditions: body.evaluatedConditions,
      };
    }

    if (res.status === 200 && body.decision === "ALLOW") {
      return {
        ok: true,
        decision: "ALLOW",
        result: body.result,
        auditId: body.auditId,
        claims: {} as CapabilityTokenClaims,
      };
    }

    if (res.status === 202 && body.decision === "REQUIRE_APPROVAL") {
      return {
        ok: false,
        decision: "REQUIRE_APPROVAL",
        reason: body.reason ?? "approval required",
        auditId: body.auditId,
        approvalId: body.approvalId ?? "",
      };
    }

    return {
      ok: false,
      decision: "DENY",
      reason: body.reason ?? "denied",
      auditId: body.auditId,
      code:
        body.code === "token_expired"
          ? "token_expired"
          : body.code === "tool_mismatch"
            ? "tool_mismatch"
            : body.code === "invalid_token"
              ? "invalid_token"
              : "policy_denied",
    };
  }

  /** In-process runtime only */
  getRuntime(): AgentCapabilityRuntime | undefined {
    return this.localRuntime;
  }
}

export type { ConstraintSet, ExecuteResult, GrantCapabilityInput, ToolId };
