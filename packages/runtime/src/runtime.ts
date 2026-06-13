import {
  claimsToExecutionCapability,
  createAdapterRegistry,
  type AdapterRegistry,
} from "@acr/adapters";
import type { AuditStore } from "@acr/audit";
import {
  constraintsFromJwt,
  delegateCapability,
  executionIntentFromMetadata,
  executionIntentKey,
  grantCapability,
  normalizeExecutionIntent,
  validateCapability,
  type CapabilityTokenClaims,
  type DelegateCapabilityInput,
  type ExecutionIntent,
  type GrantCapabilityInput,
  type GrantCapabilityResult,
  createHs256SigningMaterial,
  type SigningMaterial,
  type ToolId,
  toSignerOptions,
  toValidatorOptions,
} from "@acr/capability-token";
import {
  evaluatePolicyAst,
  PolicyVersionRegistry,
  compilePolicyVersioned,
  OpaPolicyBackend,
  buildOpaInputFromClaims,
} from "@acr/policy-engine";
import { ConsumptionLedger } from "./consumption/consumption-ledger.js";
import type { ConsumptionStore } from "./consumption/types.js";
import {
  approvalMatchesExecution,
  type ApprovalRequest,
  type ApprovalStore,
} from "./approval-store.js";
import { createApprovalStore, createAuditStore } from "./stores.js";
import {
  InMemoryExecutionSessionStore,
  type ExecutionPhase,
  type ExecutionSessionStore,
} from "./execution-state.js";
import { InMemoryRevocationStore } from "./revocation/in-memory-revocation-store.js";
import type { RevocationStore } from "./revocation/types.js";
import { executeInSandbox } from "./sandbox/executor.js";
import { resolveSandboxConfig } from "./sandbox/resolve-config.js";
import { SandboxViolation } from "./sandbox/types.js";
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

function intentFromClaims(
  claims: CapabilityTokenClaims,
  override?: ExecutionIntent | string,
): ExecutionIntent | undefined {
  if (override !== undefined) {
    return normalizeExecutionIntent(override);
  }
  return executionIntentFromMetadata(claims.metadata);
}

function intentAuditFields(intent: ExecutionIntent | undefined) {
  if (!intent) return {};
  return {
    intent: intent.action ? `${intent.category}:${intent.action}` : intent.category,
    intentCategory: intent.category,
    intentAction: intent.action,
  };
}

function policyVersionFromClaims(claims: CapabilityTokenClaims): string | undefined {
  const id = claims.metadata?.policy_version_id;
  return typeof id === "string" ? id : undefined;
}

function defaultTraceId(input: ExecuteInput): string | undefined {
  return input.traceId ?? input.requestId;
}

export class AgentCapabilityRuntime {
  readonly audit: AuditStore;
  readonly approvals: ApprovalStore;
  readonly consumption: ConsumptionStore;
  readonly revocations: RevocationStore;
  readonly policyVersions: PolicyVersionRegistry;
  readonly sessions: ExecutionSessionStore;
  readonly adapters: AdapterRegistry;

  /** @deprecated Use `consumption` — kept for demo compatibility */
  get actions(): ConsumptionStore {
    return this.consumption;
  }

  private readonly config: RuntimeConfig;
  private readonly sandbox: ReturnType<typeof resolveSandboxConfig>;
  private readonly signingMaterial: SigningMaterial;
  private readonly opaBackend: OpaPolicyBackend | null;

  constructor(
    config: RuntimeConfig,
    options?: {
      audit?: AuditStore;
      approvals?: ApprovalStore;
      consumption?: ConsumptionStore;
      revocations?: RevocationStore;
      policyVersions?: PolicyVersionRegistry;
      sessions?: ExecutionSessionStore;
      signingMaterial?: SigningMaterial;
      /** @deprecated */
      actions?: ConsumptionStore;
    },
  ) {
    this.config = config;
    this.sandbox = resolveSandboxConfig(config.sandbox);
    if (options?.signingMaterial) {
      this.signingMaterial = options.signingMaterial;
    } else if (config.signing && (config.signing.algorithm !== "HS256" || config.signing.privateKey)) {
      throw new Error(
        "RS256/EdDSA signing requires createAgentCapabilityRuntime() — keys are loaded asynchronously",
      );
    } else if (config.secret) {
      this.signingMaterial = createHs256SigningMaterial(config.secret);
    } else if (config.signing?.secret) {
      this.signingMaterial = createHs256SigningMaterial(config.signing.secret);
    } else {
      throw new Error("Runtime requires secret, signing config, or signingMaterial");
    }
    this.audit = options?.audit ?? createAuditStore(config);
    this.approvals = options?.approvals ?? createApprovalStore(config);
    this.consumption = options?.consumption ?? options?.actions ?? new ConsumptionLedger();
    this.revocations = options?.revocations ?? new InMemoryRevocationStore();
    this.policyVersions = options?.policyVersions ?? new PolicyVersionRegistry();
    this.sessions = options?.sessions ?? new InMemoryExecutionSessionStore();
    this.adapters = createAdapterRegistry(
      config.adapters ?? { mode: "stub" },
    );
    this.opaBackend = config.opa ? new OpaPolicyBackend(config.opa) : null;
  }

  private signerOptions() {
    return toSignerOptions(this.signingMaterial, this.config.issuer);
  }

  private validatorOptions(expectedTool?: ToolId) {
    return toValidatorOptions(this.signingMaterial, {
      issuer: this.config.issuer,
      expectedTool,
    });
  }

  async grant(input: GrantCapabilityInput): Promise<GrantCapabilityResult> {
    const { policyVersionId } = this.policyVersions.register(input.tool, input.constraints);
    return grantCapability(
      {
        ...input,
        metadata: { ...input.metadata, policy_version_id: policyVersionId },
      },
      this.signerOptions(),
    );
  }

  async delegate(
    parentToken: string,
    input: DelegateCapabilityInput,
  ): Promise<GrantCapabilityResult> {
    const { policyVersionId } = this.policyVersions.register(input.tool, input.constraints);
    return delegateCapability(
      parentToken,
      {
        ...input,
        metadata: { ...input.metadata, policy_version_id: policyVersionId },
      },
      this.signerOptions(),
    );
  }

  /** Immediately invalidate a capability by `jti` (enterprise revocation). */
  async revoke(
    capabilityId: string,
    options?: { reason?: string; revokedBy?: string },
  ) {
    return this.revocations.revoke(capabilityId, options);
  }

  async isRevoked(capabilityId: string): Promise<boolean> {
    return this.revocations.isRevoked(capabilityId);
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const validation = await validateCapability(
      input.token,
      this.validatorOptions(input.tool),
    );

    if (!validation.valid) {
      const audit = this.audit.record({
        agentId: "unknown",
        tool: input.tool,
        decision: "DENY",
        reason: validation.error.message,
        payload: input.payload,
        requestId: input.requestId,
        ...intentAuditFields(normalizeExecutionIntent(input.intent)),
        traceId: defaultTraceId(input),
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

    if (await this.revocations.isRevoked(claims.jti)) {
      const record = await this.revocations.get(claims.jti);
      const audit = this.audit.record({
        agentId: claims.sub,
        tool: input.tool,
        decision: "DENY",
        reason: record?.reason ?? "capability revoked",
        jti: claims.jti,
        payload: input.payload,
        requestId: input.requestId,
        traceId: defaultTraceId(input),
        sessionId: input.sessionId,
        executionPhase: "REVOKED",
        lineage: lineageFromClaims(claims),
      });
      return {
        ok: false,
        decision: "DENY",
        reason: record?.reason ?? "capability revoked",
        auditId: audit.id,
        code: "token_revoked",
        executionPhase: "REVOKED",
      };
    }

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
          ...intentAuditFields(intentFromClaims(claims, input.intent)),
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
          ...intentAuditFields(intentFromClaims(claims, input.intent)),
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
      approvalId: input.approvalId,
      requestId: input.requestId,
      traceId: defaultTraceId(input),
      sessionId: input.sessionId,
      intent: input.intent,
      simulate: input.simulate,
    });
  }

  private resolvePolicyDocument(
    tool: ToolId,
    constraints: ReturnType<typeof constraintsFromJwt>,
    expectedVersionId?: string,
  ) {
    if (expectedVersionId) {
      const stored = this.policyVersions.get(expectedVersionId);
      if (stored) return stored;
      const compiled = compilePolicyVersioned(tool, constraints);
      if (compiled.policyVersionId !== expectedVersionId) {
        return undefined;
      }
      this.policyVersions.register(tool, constraints);
      return compiled;
    }
    return compilePolicyVersioned(tool, constraints);
  }

  async executeWithClaims(
    claims: CapabilityTokenClaims,
    payload: Record<string, unknown>,
    options?: {
      token?: string;
      approvalGranted?: boolean;
      approvalId?: string;
      requestId?: string;
      traceId?: string;
      sessionId?: string;
      intent?: ExecutionIntent | string;
      simulate?: boolean;
    },
  ): Promise<ExecuteResult> {
    const tool = claims.tool;
    const constraints = constraintsFromJwt(claims.constraints);
    const actionCount = await this.consumption.get(claims.jti);
    const intent = intentFromClaims(claims, options?.intent);
    const lineage = lineageFromClaims(claims);
    const policyVersionId = policyVersionFromClaims(claims);
    const traceId = options?.traceId;
    const sessionId = options?.sessionId;

    const policyDoc = this.resolvePolicyDocument(tool, constraints, policyVersionId);
    if (!policyDoc) {
      const audit = this.audit.record({
        agentId: claims.sub,
        tool,
        decision: "DENY",
        reason: "policy version mismatch — token constraints do not match registered policy",
        jti: claims.jti,
        payload,
        policyVersionId,
        traceId,
        sessionId,
        executionPhase: "DENIED",
        policySnapshot: constraints,
        lineage,
      });
      return {
        ok: false,
        decision: "DENY",
        reason: "policy version mismatch",
        auditId: audit.id,
        code: "policy_denied",
        executionPhase: "DENIED",
      };
    }

    const policy = evaluatePolicyAst(policyDoc, {
      tool,
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
      ...intentAuditFields(intent),
      requestId: options?.requestId,
      policyVersionId: policyDoc.policyVersionId,
      traceId,
      sessionId,
      payload,
      policySnapshot: constraints,
      lineage,
    };

    const touchSession = (phase: ExecutionPhase, incrementAction = false) => {
      if (!sessionId) return;
      this.sessions.touch({
        sessionId,
        agentId: claims.sub,
        jti: claims.jti,
        traceId,
        tool,
        phase,
        approvalId: options?.approvalId,
        incrementAction,
      });
    };

    if (policy.decision === "DENY") {
      touchSession("DENIED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: policy.reason,
        executionPhase: "DENIED",
      });
      return {
        ok: false,
        decision: "DENY",
        reason: policy.reason ?? "policy denied",
        auditId: audit.id,
        code: "policy_denied",
        executionPhase: "DENIED",
      };
    }

    if (policy.decision === "REQUIRE_APPROVAL") {
      touchSession("APPROVAL_REQUIRED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "REQUIRE_APPROVAL",
        reason: policy.reason,
        executionPhase: "APPROVAL_REQUIRED",
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
        executionPhase: "APPROVAL_REQUIRED",
      };
    }

    if (this.opaBackend?.enabled) {
      const opaResult = await this.opaBackend.evaluate(
        buildOpaInputFromClaims(claims, {
          payload,
          constraints,
          actionCount,
          approvalGranted: options?.approvalGranted,
          simulate: options?.simulate ?? policy.decision === "SIMULATE",
          intent,
          policyVersionId: policyDoc.policyVersionId,
        }),
      );

      if (!opaResult.allowed && !opaResult.shadowOnly) {
        if (opaResult.decision === "REQUIRE_APPROVAL") {
          touchSession("APPROVAL_REQUIRED");
          const audit = this.audit.record({
            ...baseAudit,
            decision: "REQUIRE_APPROVAL",
            reason: opaResult.reason ?? "OPA policy requires approval",
            executionPhase: "APPROVAL_REQUIRED",
          });
          const approval = this.approvals.create({
            agentId: claims.sub,
            tool,
            token: options?.token ?? "",
            payload,
            reason: opaResult.reason ?? "OPA policy requires approval",
            auditId: audit.id,
            jti: claims.jti,
          });
          await this.config.onApprovalRequired?.(approval);
          return {
            ok: false,
            decision: "REQUIRE_APPROVAL",
            reason: opaResult.reason ?? "OPA policy requires approval",
            auditId: audit.id,
            approvalId: approval.id,
            executionPhase: "APPROVAL_REQUIRED",
          };
        }

        touchSession("DENIED");
        const audit = this.audit.record({
          ...baseAudit,
          decision: "DENY",
          reason: opaResult.reason ?? "denied by OPA policy",
          executionPhase: "DENIED",
        });
        return {
          ok: false,
          decision: "DENY",
          reason: opaResult.reason ?? "denied by OPA policy",
          auditId: audit.id,
          code: "policy_denied",
          executionPhase: "DENIED",
        };
      }
    }

    if (policy.decision === "SIMULATE" || options?.simulate) {
      touchSession("SIMULATED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "SIMULATE",
        reason: policy.reason ?? "simulated allow",
        executionPhase: "SIMULATED",
      });
      return {
        ok: true,
        decision: "SIMULATE",
        reason: policy.reason,
        auditId: audit.id,
        claims,
        evaluatedConditions: policy.evaluatedConditions,
        executionPhase: "SIMULATED",
      };
    }

    if (options?.approvalGranted) {
      touchSession("APPROVED");
    }

    touchSession("EXECUTING");
    const consume = await this.consumption.tryConsume(
      claims.jti,
      constraints.maxActions,
      options?.requestId,
    );

    if (!consume.allowed) {
      touchSession("DENIED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: consume.reason ?? "max_actions exceeded",
        executionPhase: "DENIED",
      });
      return {
        ok: false,
        decision: "DENY",
        reason: consume.reason ?? "max_actions exceeded",
        auditId: audit.id,
        code: "policy_denied",
        executionPhase: "DENIED",
      };
    }

    if (consume.replay) {
      touchSession("COMPLETED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "ALLOW",
        reason: consume.reason,
        executionPhase: "COMPLETED",
      });
      return {
        ok: true,
        decision: "ALLOW",
        result: { status: "replay", requestId: options?.requestId },
        auditId: audit.id,
        claims,
        executionPhase: "COMPLETED",
      };
    }

    try {
      const adapter = this.adapters.get(tool);
      const execCtx = {
        capability: claimsToExecutionCapability(claims),
        intent: intent ? executionIntentKey(intent) : undefined,
        payload,
        simulate: false,
        requestId: options?.requestId,
        traceId,
        sessionId,
        policyVersionId: policyDoc.policyVersionId,
      };

      const result = await executeInSandbox({
        adapter,
        tool,
        payload,
        execCtx,
        constraints,
        sandbox: this.sandbox,
      });

      touchSession("COMPLETED", true);
      const audit = this.audit.record({
        ...baseAudit,
        decision: "ALLOW",
        executionPhase: "COMPLETED",
      });

      return {
        ok: true,
        decision: "ALLOW",
        result,
        auditId: audit.id,
        claims,
        executionPhase: "COMPLETED",
      };
    } catch (err) {
      await this.consumption.release(claims.jti, options?.requestId);
      const message = err instanceof Error ? err.message : String(err);
      const sandboxDenied = err instanceof SandboxViolation;
      touchSession("FAILED");
      const audit = this.audit.record({
        ...baseAudit,
        decision: "DENY",
        reason: sandboxDenied ? `sandbox: ${message}` : message,
        executionPhase: "FAILED",
      });
      return {
        ok: false,
        decision: "DENY",
        reason: message,
        auditId: audit.id,
        code: sandboxDenied ? "sandbox_denied" : "policy_denied",
        executionPhase: "FAILED",
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
