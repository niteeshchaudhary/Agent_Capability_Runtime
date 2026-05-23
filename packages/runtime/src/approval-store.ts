import type { ToolId } from "@acr/capability-token";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  status: ApprovalStatus;
  agentId: string;
  tool: ToolId;
  token: string;
  payload: Record<string, unknown>;
  reason: string;
  auditId: string;
  jti?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface CreateApprovalInput {
  agentId: string;
  tool: ToolId;
  token: string;
  payload: Record<string, unknown>;
  reason: string;
  auditId: string;
  jti?: string;
}

export interface ApprovalQuery {
  status?: ApprovalStatus;
  agentId?: string;
  tool?: ToolId;
}

export type ApprovalHook = (request: ApprovalRequest) => void | Promise<void>;

export interface ApprovalStore {
  create(input: CreateApprovalInput): ApprovalRequest;
  getById(id: string): ApprovalRequest | undefined;
  list(query?: ApprovalQuery): ApprovalRequest[];
  approve(id: string, resolvedBy?: string): ApprovalRequest;
  reject(id: string, resolvedBy?: string): ApprovalRequest;
}

function createApprovalId(): string {
  return `appr_${crypto.randomUUID()}`;
}

function payloadMatches(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function approvalMatchesExecution(
  approval: ApprovalRequest,
  input: { token: string; tool: ToolId; payload: Record<string, unknown> },
): boolean {
  return (
    approval.status === "approved" &&
    approval.token === input.token &&
    approval.tool === input.tool &&
    payloadMatches(approval.payload, input.payload)
  );
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();

  /** Restore requests from persistent storage. */
  importRequests(requests: ApprovalRequest[]): void {
    for (const request of requests) {
      this.requests.set(request.id, request);
    }
  }

  create(input: CreateApprovalInput): ApprovalRequest {
    const request: ApprovalRequest = {
      id: createApprovalId(),
      status: "pending",
      agentId: input.agentId,
      tool: input.tool,
      token: input.token,
      payload: input.payload,
      reason: input.reason,
      auditId: input.auditId,
      jti: input.jti,
      createdAt: new Date().toISOString(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  getById(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  list(query?: ApprovalQuery): ApprovalRequest[] {
    return [...this.requests.values()]
      .filter((request) => {
        if (query?.status !== undefined && request.status !== query.status) return false;
        if (query?.agentId !== undefined && request.agentId !== query.agentId) return false;
        if (query?.tool !== undefined && request.tool !== query.tool) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  approve(id: string, resolvedBy?: string): ApprovalRequest {
    const request = this.requests.get(id);
    if (!request) throw new Error(`approval not found: ${id}`);
    if (request.status !== "pending") {
      throw new Error(`approval already ${request.status}: ${id}`);
    }
    const updated: ApprovalRequest = {
      ...request,
      status: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    };
    this.requests.set(id, updated);
    return updated;
  }

  reject(id: string, resolvedBy?: string): ApprovalRequest {
    const request = this.requests.get(id);
    if (!request) throw new Error(`approval not found: ${id}`);
    if (request.status !== "pending") {
      throw new Error(`approval already ${request.status}: ${id}`);
    }
    const updated: ApprovalRequest = {
      ...request,
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    };
    this.requests.set(id, updated);
    return updated;
  }
}
