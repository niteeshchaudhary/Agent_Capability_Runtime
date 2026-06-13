/** Thin client for the ACR gateway HTTP API. */

export const SUPPORTED_TOOLS = ["gmail.send", "slack.send", "http.request"] as const;

export type ToolId = (typeof SUPPORTED_TOOLS)[number];

export interface GatewayClientOptions {
  baseUrl?: string;
  adminKey?: string;
  fetchFn?: typeof fetch;
}

export interface GrantInput {
  agentId: string;
  tool: ToolId;
  constraints?: Record<string, unknown>;
  expiresIn?: string | number;
}

export interface ExecuteInput {
  token: string;
  tool: ToolId;
  payload: Record<string, unknown>;
  simulate?: boolean;
  approvalId?: string;
}

export class GatewayClient {
  private readonly baseUrl: string;
  private readonly adminKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GatewayClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.adminKey = options.adminKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private adminHeaders(): Record<string, string> {
    if (!this.adminKey) return {};
    return { Authorization: `Bearer ${this.adminKey}` };
  }

  async health(): Promise<{ status: string; version?: string }> {
    const res = await this.fetchFn(this.url("/health"));
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return (await res.json()) as { status: string; version?: string };
  }

  async grant(input: GrantInput): Promise<{ token: string; claims: unknown; expiresAt?: string }> {
    const res = await this.fetchFn(this.url("/capabilities/grant"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.adminHeaders(),
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof (body as { message?: string }).message === "string"
          ? (body as { message: string }).message
          : `grant failed: ${res.status}`,
      );
    }
    return body as { token: string; claims: unknown; expiresAt?: string };
  }

  async execute(input: ExecuteInput): Promise<unknown> {
    const res = await this.fetchFn(this.url("/runtime/execute"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.json();
  }

  async listAudit(params?: {
    agentId?: string;
    tool?: string;
    decision?: string;
    limit?: number;
  }): Promise<{ events: AuditEvent[] }> {
    const q = new URLSearchParams();
    if (params?.agentId) q.set("agentId", params.agentId);
    if (params?.tool) q.set("tool", params.tool);
    if (params?.decision) q.set("decision", params.decision);
    if (params?.limit) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q}` : "";
    const res = await this.fetchFn(this.url(`/audit${suffix}`));
    if (!res.ok) throw new Error(`audit failed: ${res.status}`);
    return (await res.json()) as { events: AuditEvent[] };
  }

  async listApprovals(params?: {
    status?: string;
    agentId?: string;
    tool?: string;
  }): Promise<{ approvals: ApprovalRecord[] }> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.agentId) q.set("agentId", params.agentId);
    if (params?.tool) q.set("tool", params.tool);
    const suffix = q.toString() ? `?${q}` : "";
    const res = await this.fetchFn(this.url(`/approvals${suffix}`));
    if (!res.ok) throw new Error(`approvals failed: ${res.status}`);
    return (await res.json()) as { approvals: ApprovalRecord[] };
  }

  async approve(id: string, resolvedBy?: string): Promise<unknown> {
    const res = await this.fetchFn(this.url(`/approvals/${encodeURIComponent(id)}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resolvedBy ? { resolvedBy } : {}),
    });
    return res.json();
  }

  async reject(id: string, resolvedBy?: string): Promise<unknown> {
    const res = await this.fetchFn(this.url(`/approvals/${encodeURIComponent(id)}/reject`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resolvedBy ? { resolvedBy } : {}),
    });
    return res.json();
  }
}

export interface AuditEvent {
  id: string;
  agentId: string;
  tool: string;
  decision: string;
  reason?: string;
  createdAt?: string;
  auditId?: string;
}

export interface ApprovalRecord {
  id: string;
  agentId: string;
  tool: string;
  status: string;
  reason?: string;
  createdAt?: string;
}

export function loadSettings(): { baseUrl: string; adminKey: string } {
  return {
    baseUrl: sessionStorage.getItem("acr.gatewayUrl") ?? "",
    adminKey: sessionStorage.getItem("acr.adminKey") ?? "",
  };
}

export function saveSettings(baseUrl: string, adminKey: string): void {
  sessionStorage.setItem("acr.gatewayUrl", baseUrl);
  sessionStorage.setItem("acr.adminKey", adminKey);
}
