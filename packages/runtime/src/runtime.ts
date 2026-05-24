import {
  claimsToExecutionCapability,
  createAdapterRegistry,
  type AdapterRegistry,
} from "@acr/adapters";
import type { AuditStore } from "@acr/audit";
import {
  constraintsFromJwt,
  delegateCapability,
  grantCapability,
  validateCapability,
  type CapabilityTokenClaims,
  type DelegateCapabilityInput,
  type GrantCapabilityInput,
  type GrantCapabilityResult,
} from "@acr/capability-token";
import { evaluatePolicy } from "@acr/policy-engine";
import { ConsumptionLedger } from "./consumption/consumption-ledger.js";
import type { ConsumptionStore } from "./consumption/types.js";
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

function lineageFromClaims(claims: CapabilityTokenClaims) {
  return {
    parentJti: claims.parent_jti,
    delegationDepth: claims.delegation_depth,
    delegatorChain: claims.delegator_chain,
  };
}

function intentFromClaims(claims: CapabilityTokenClaims, override?: string): string | undefined {
  if (override) return override;
  const meta = claims.metadata?.intent;
  return typeof meta === "string" ? meta : undefined;
}

export class AgentCapabilityRuntime {
  readonly audit: AuditStore;
  readonly approvals: ApprovalStore;
  readonly consumption: ConsumptionStore;
  readonly adapters: AdapterRegistry;

  /** @deprecated Use `consumption` — kept for demo compatibility */
  get actions(): ConsumptionStore {
    return this.consumption;
  }

  private readonly config: RuntimeConfig;

  constructor(
    config: RuntimeConfig,
    options?: {
      audit?: AuditStore;
      approvals?: ApprovalStore;
      consumption?: ConsumptionStore;
      /** @deprecated */
      actions?: ConsumptionStore;
    },
  ) {
    this.config = config;
    this.audit = options?.audit ?? createAuditStore(config);
    this.approvals = options?.approvals ?? createApprovalStore(config);
    this.consumption = options?.consumption ?? options?.actions ?? new ConsumptionLedger();
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

  async delegate(
    parentToken: string,
    input: DelegateCapabilityInput,
  ): Promise<GrantCapabilityResult> {
    return delegateCapability(parentToken, input, {
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
        requestId: input.requestId,
        intent: input.intent,
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
          approvalId: input.approvalId,
          requestId: input.requestId,
          intent: intentFromClaims(claims, input.intent),
          lineage: lineageFromClaims(claims),
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
          requestId: input.requestId,
          intent: intentFromClaims(claims, input.intent),
          lineage: lineageFromClaims(claims),
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
      requestId: input.requestId,
      intent: input.intent,
      simulate: input.simulate,
    });
  }

  async executeWithClaims(
    claims: CapabilityTokenClaims,
    payload: Record<string, unknown>,
    options?: {
      token?: string;
      approvalGranted?: boolean;
      requestId?: string;
      intent?: string;
      simulate?: boolean;
    },
  ): Promise<ExecuteResult> {
    const tool = claims.tool;
    const constraints = constraintsFromJwt(claims.constraints);
    const actionCount = await this.consumption.get(claims.jti);
    const intent = intentFromClaims(claims, options?.intent);
    const lineage = lineageFromClaims(claims);

    const policy = evaluatePolicy({
      tool,
      constraints,
      payload,
      actionCount,
      approvalGranted: options?.approvalGranted,
      simulate: options?.simulate,
      intent,
    });

    const baseAudit = {
      agentId: claims.sub,
      tool,
      delegator: claims.delegator,
      jti: claims.jti,
      task: claims.task,
      intent,
      requestId: options?.requestId,
      payload,
      policySnapshot: constraints,
      lineage,
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

    if (policy.decision === "SIMULATE" || options?.simulate) {
      const audit = this.audit.record({
        ...baseAudit,
        decision: "SIMULATE",
        reason: policy.reason ?? "simulated allow",
      });
      return {
        ok: true,
        decision: "SIMULATE",
        reason: policy.reason,
        auditId: audit.id,
        claims,
        evaluatedConditions: policy.evaluatedConditions,
      };
    }

    const consume = await this.consumption.tryConsume(
      claims.jti,
      constraints.maxActions,
      options?.requestId,
    );

    if (!consume.allowed) {
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: consume.reason ?? "max_actions exceeded",
      });
      return {
        ok: false,
        decision: "DENY",
        reason: consume.reason ?? "max_actions exceeded",
        auditId: audit.id,
        code: "policy_denied",
      };
    }

    if (consume.replay) {
      const audit = this.audit.record({
        ...baseAudit,
        decision: "ALLOW",
        reason: consume.reason,
      });
      return {
        ok: true,
        decision: "ALLOW",
        result: { status: "replay", requestId: options?.requestId },
        auditId: audit.id,
        claims,
      };
    }

    try {
      const adapter = this.adapters.get(tool);
      const execCtx = {
        capability: claimsToExecutionCapability(claims),
        intent,
        payload,
        simulate: false,
        requestId: options?.requestId,
      };

      const result =
        adapter.executeWithContext !== undefined
          ? await adapter.executeWithContext(execCtx)
          : await adapter.execute(payload);

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
      await this.consumption.release(claims.jti, options?.requestId);
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
