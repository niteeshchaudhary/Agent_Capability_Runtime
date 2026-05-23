import { createAdapterRegistry, type AdapterRegistry } from "@acr/adapters";
import type { AuditStore } from "@acr/audit";
import {
  constraintsFromJwt,
  grantCapability,
  validateCapability,
  type CapabilityTokenClaims,
  type GrantCapabilityInput,
  type GrantCapabilityResult,
} from "@acr/capability-token";
import { evaluatePolicy } from "@acr/policy-engine";
import { ActionCounter } from "./action-counter.js";
import {
  approvalMatchesExecution,
  type ApprovalRequest,
  type ApprovalStore,
} from "./approval-store.js";
import { createApprovalStore, createAuditStore } from "./stores.js";
import type {
  ExecuteDenied,
  ExecuteInput,
  ExecuteResult,
  RuntimeConfig,
} from "./types.js";

function validationCodeToHttp(
  code: string,
): ExecuteDenied["code"] {
  switch (code) {
    case "EXPIRED":
      return "token_expired";
    case "TOOL_MISMATCH":
      return "tool_mismatch";
    case "INVALID_SIGNATURE":
    case "INVALID_FORMAT":
    case "INVALID_CLAIMS":
    case "ISSUER_MISMATCH":
    case "UNSUPPORTED_TOOL":
      return "invalid_token";
    default:
      return "invalid_token";
  }
}

export class AgentCapabilityRuntime {
  readonly audit: AuditStore;
  readonly approvals: ApprovalStore;
  readonly actions: ActionCounter;
  readonly adapters: AdapterRegistry;

  private readonly config: RuntimeConfig;

  constructor(
    config: RuntimeConfig,
    options?: {
      audit?: AuditStore;
      approvals?: ApprovalStore;
      actions?: ActionCounter;
    },
  ) {
    this.config = config;
    this.audit = options?.audit ?? createAuditStore(config);
    this.approvals = options?.approvals ?? createApprovalStore(config);
    this.actions = options?.actions ?? new ActionCounter();
    this.adapters = createAdapterRegistry(
      config.adapters ?? { mode: "stub" },
    );
  }

  async grant(input: GrantCapabilityInput): Promise<GrantCapabilityResult> {
    return grantCapability(input, {
      secret: this.config.secret,
      issuer: this.config.issuer,
    });
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const validation = await validateCapability(input.token, {
      secret: this.config.secret,
      issuer: this.config.issuer,
      expectedTool: input.tool,
    });

    if (!validation.valid) {
      const audit = this.audit.record({
        agentId: "unknown",
        tool: input.tool,
        decision: "DENY",
        reason: validation.error.message,
        payload: input.payload,
      });

      return {
        ok: false,
        decision: "DENY",
        reason: validation.error.message,
        auditId: audit.id,
        code: validationCodeToHttp(validation.error.code),
      };
    }

    const claims = validation.claims;
    let approvalGranted = false;

    if (input.approvalId) {
      const approval = this.approvals.getById(input.approvalId);
      if (!approval) {
        const audit = this.audit.record({
          agentId: claims.sub,
          tool: input.tool,
          decision: "DENY",
          reason: `approval not found: ${input.approvalId}`,
          jti: claims.jti,
          payload: input.payload,
        });
        return {
          ok: false,
          decision: "DENY",
          reason: `approval not found: ${input.approvalId}`,
          auditId: audit.id,
          code: "policy_denied",
        };
      }

      if (!approvalMatchesExecution(approval, input)) {
        const audit = this.audit.record({
          agentId: claims.sub,
          tool: input.tool,
          decision: "DENY",
          reason: "approval does not match token, tool, or payload",
          jti: claims.jti,
          payload: input.payload,
          approvalId: input.approvalId,
        });
        return {
          ok: false,
          decision: "DENY",
          reason: "approval does not match token, tool, or payload",
          auditId: audit.id,
          code: "policy_denied",
        };
      }

      approvalGranted = true;
    }

    return this.executeWithClaims(claims, input.payload, {
      token: input.token,
      approvalGranted,
    });
  }

  /** Execute when claims are already validated (e.g. tests) */
  async executeWithClaims(
    claims: CapabilityTokenClaims,
    payload: Record<string, unknown>,
    options?: { token?: string; approvalGranted?: boolean },
  ): Promise<ExecuteResult> {
    const tool = claims.tool;
    const constraints = constraintsFromJwt(claims.constraints);
    const actionCount = this.actions.get(claims.jti);

    const policy = evaluatePolicy({
      tool,
      constraints,
      payload,
      actionCount,
      approvalGranted: options?.approvalGranted,
    });

    const baseAudit = {
      agentId: claims.sub,
      tool,
      delegator: claims.delegator,
      jti: claims.jti,
      task: claims.task,
      payload,
    };

    if (policy.decision === "DENY") {
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: policy.reason,
      });
      return {
        ok: false,
        decision: "DENY",
        reason: policy.reason ?? "policy denied",
        auditId: audit.id,
        code: "policy_denied",
      };
    }

    if (policy.decision === "REQUIRE_APPROVAL") {
      const audit = this.audit.record({
        ...baseAudit,
        decision: "REQUIRE_APPROVAL",
        reason: policy.reason,
      });

      const approval = this.approvals.create({
        agentId: claims.sub,
        tool,
        token: options?.token ?? "",
        payload,
        reason: policy.reason ?? "approval required",
        auditId: audit.id,
        jti: claims.jti,
      });

      await this.config.onApprovalRequired?.(approval);

      return {
        ok: false,
        decision: "REQUIRE_APPROVAL",
        reason: policy.reason ?? "approval required",
        auditId: audit.id,
        approvalId: approval.id,
      };
    }

    try {
      const adapter = this.adapters.get(tool);
      const result = await adapter.execute(payload);
      this.actions.increment(claims.jti);

      const audit = this.audit.record({
        ...baseAudit,
        decision: "ALLOW",
      });

      return {
        ok: true,
        decision: "ALLOW",
        result,
        auditId: audit.id,
        claims,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: message,
      });
      return {
        ok: false,
        decision: "DENY",
        reason: message,
        auditId: audit.id,
        code: "policy_denied",
      };
    }
  }

  approve(approvalId: string, resolvedBy?: string): ApprovalRequest {
    return this.approvals.approve(approvalId, resolvedBy);
  }

  reject(approvalId: string, resolvedBy?: string): ApprovalRequest {
    return this.approvals.reject(approvalId, resolvedBy);
  }
}
