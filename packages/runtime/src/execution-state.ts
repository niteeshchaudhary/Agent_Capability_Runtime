/**
 * Formal execution lifecycle phases (gap-fix2 §9).
 * Recorded on audit events and returned on execute responses.
 */
export type ExecutionPhase =
  | "PENDING"
  | "VALIDATING"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "DENIED"
  | "FAILED"
  | "REVOKED"
  | "EXPIRED"
  | "SIMULATED";

export interface ExecutionSession {
  sessionId: string;
  agentId: string;
  jti?: string;
  traceId?: string;
  tool?: string;
  actionCount: number;
  lastPhase: ExecutionPhase;
  approvalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionSessionStore {
  touch(input: {
    sessionId: string;
    agentId: string;
    jti?: string;
    traceId?: string;
    tool?: string;
    phase: ExecutionPhase;
    approvalId?: string;
    incrementAction?: boolean;
  }): ExecutionSession;
  get(sessionId: string): ExecutionSession | undefined;
  list(): ExecutionSession[];
}

export class InMemoryExecutionSessionStore implements ExecutionSessionStore {
  private readonly sessions = new Map<string, ExecutionSession>();

  touch(input: {
    sessionId: string;
    agentId: string;
    jti?: string;
    traceId?: string;
    tool?: string;
    phase: ExecutionPhase;
    approvalId?: string;
    incrementAction?: boolean;
  }): ExecutionSession {
    const now = new Date().toISOString();
    const existing = this.sessions.get(input.sessionId);
    const approvalIds = existing?.approvalIds ?? [];
    if (input.approvalId && !approvalIds.includes(input.approvalId)) {
      approvalIds.push(input.approvalId);
    }

    const session: ExecutionSession = {
      sessionId: input.sessionId,
      agentId: input.agentId,
      jti: input.jti ?? existing?.jti,
      traceId: input.traceId ?? existing?.traceId,
      tool: input.tool ?? existing?.tool,
      actionCount: (existing?.actionCount ?? 0) + (input.incrementAction ? 1 : 0),
      lastPhase: input.phase,
      approvalIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.sessions.set(input.sessionId, session);
    return session;
  }

  get(sessionId: string): ExecutionSession | undefined {
    return this.sessions.get(sessionId);
  }

  list(): ExecutionSession[] {
    return [...this.sessions.values()];
  }
}
