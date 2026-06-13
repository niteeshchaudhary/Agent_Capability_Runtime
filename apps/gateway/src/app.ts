import {
  constraintSetSchema,
  executionIntentSchema,
  grantCapabilityInputSchema,
  toolIdSchema,
  type ToolId,
} from "@acr/capability-token";
import type { AgentCapabilityRuntime } from "@acr/runtime";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdminAuth, type AdminAuthConfig } from "./admin-auth.js";
import { mountDashboard } from "./dashboard-static.js";

export const GATEWAY_VERSION = "0.1.0";

export interface GatewayConfig {
  /** When non-empty, grant/delegate require admin Bearer token (RFC-0005) */
  adminAuth?: AdminAuthConfig;
  /** Serve built dashboard at /dashboard/ (default true when dist exists) */
  dashboard?: boolean;
}

const executeBodySchema = z.object({
  token: z.string().min(1),
  tool: toolIdSchema,
  payload: z.record(z.unknown()),
  approvalId: z.string().optional(),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  sessionId: z.string().optional(),
  intent: z.union([z.string().min(1), executionIntentSchema]).optional(),
  simulate: z.boolean().optional(),
});

const auditQuerySchema = z.object({
  agentId: z.string().optional(),
  tool: z.string().optional(),
  decision: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL", "SIMULATE"]).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const approvalQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  agentId: z.string().optional(),
  tool: toolIdSchema.optional(),
});

export function createApp(runtime: AgentCapabilityRuntime, gatewayConfig?: GatewayConfig): Hono {
  const app = new Hono();
  const adminAuth = requireAdminAuth(gatewayConfig?.adminAuth ?? { apiKeys: [] });

  app.get("/health", (c) =>
    c.json({ status: "ok", version: GATEWAY_VERSION }),
  );

  app.get("/adapters/capabilities", (c) => {
    const tool = c.req.query("tool");
    const parsedTool = tool ? toolIdSchema.safeParse(tool) : { success: true as const, data: undefined };
    if (!parsedTool.success) {
      return c.json({ error: "invalid_request", message: "Invalid tool" }, 400);
    }
  const capabilities = runtime.adapters.supportedCapabilities(
    parsedTool.data as ToolId | undefined,
  );
    return c.json({ capabilities });
  });

  app.post("/capabilities/grant", adminAuth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "Invalid JSON body" }, 400);
    }

    const parsed = grantCapabilityInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    try {
      const result = await runtime.grant({
        ...parsed.data,
        tool: parsed.data.tool as ToolId,
      });
      return c.json(
        {
          token: result.token,
          claims: result.claims,
          expiresAt: result.expiresAt.toISOString(),
        },
        201,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  const delegateBodySchema = z.object({
    parentToken: z.string().min(1),
    agentId: z.string().min(1),
    tool: toolIdSchema,
    constraints: constraintSetSchema,
    expiresIn: z.union([z.string(), z.number()]).optional(),
    delegator: z.string().optional(),
    session: z.string().optional(),
    task: z.string().optional(),
    intent: z.union([z.string().min(1), executionIntentSchema]).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post("/capabilities/delegate", adminAuth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "Invalid JSON body" }, 400);
    }

    const parsed = delegateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    try {
      const result = await runtime.delegate(parsed.data.parentToken, {
        agentId: parsed.data.agentId,
        tool: parsed.data.tool as ToolId,
        constraints: parsed.data.constraints,
        expiresIn: parsed.data.expiresIn,
        delegator: parsed.data.delegator,
        session: parsed.data.session,
        task: parsed.data.task,
        intent: parsed.data.intent,
        metadata: parsed.data.metadata,
      });
      return c.json(
        {
          token: result.token,
          claims: result.claims,
          expiresAt: result.expiresAt.toISOString(),
        },
        201,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  const revokeBodySchema = z.object({
    capabilityId: z.string().min(1),
    reason: z.string().optional(),
    revokedBy: z.string().optional(),
  });

  app.post("/capabilities/revoke", adminAuth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "Invalid JSON body" }, 400);
    }

    const parsed = revokeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    const record = await runtime.revoke(parsed.data.capabilityId, {
      reason: parsed.data.reason,
      revokedBy: parsed.data.revokedBy,
    });
    return c.json({ revoked: true, record }, 200);
  });

  app.get("/capabilities/revoked", adminAuth, async (c) =>
    c.json({ revoked: await runtime.revocations.list() }),
  );

  app.post("/runtime/execute", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "Invalid JSON body" }, 400);
    }

    const parsed = executeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    const result = await runtime.execute({
      token: parsed.data.token,
      tool: parsed.data.tool as ToolId,
      payload: parsed.data.payload,
      approvalId: parsed.data.approvalId,
      requestId: parsed.data.requestId,
      traceId: parsed.data.traceId,
      sessionId: parsed.data.sessionId,
      intent: parsed.data.intent,
      simulate: parsed.data.simulate,
    });

    if (result.ok && result.decision === "SIMULATE") {
      return c.json({
        decision: result.decision,
        reason: result.reason,
        auditId: result.auditId,
        evaluatedConditions: result.evaluatedConditions,
        executionPhase: result.executionPhase,
      });
    }

    if (result.ok) {
      return c.json({
        decision: result.decision,
        result: result.result,
        auditId: result.auditId,
        executionPhase: result.executionPhase,
      });
    }

    if (result.decision === "REQUIRE_APPROVAL") {
      return c.json(
        {
          decision: result.decision,
          approvalId: result.approvalId,
          reason: result.reason,
          auditId: result.auditId,
        },
        202,
      );
    }

    const status =
      result.code === "invalid_token" || result.code === "token_expired"
        ? 401
        : result.code === "token_revoked"
          ? 403
          : 403;

    return c.json(
      {
        decision: result.decision,
        reason: result.reason,
        auditId: result.auditId,
        code: result.code,
        executionPhase: result.executionPhase,
      },
      status,
    );
  });

  app.get("/audit", (c) => {
    const parsed = auditQuerySchema.safeParse({
      agentId: c.req.query("agentId"),
      tool: c.req.query("tool"),
      decision: c.req.query("decision"),
      since: c.req.query("since"),
      until: c.req.query("until"),
      limit: c.req.query("limit"),
    });

    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    const events = runtime.audit.list(parsed.data);
    return c.json({ events });
  });

  app.get("/audit/verify", (c) => {
    if (typeof runtime.audit.verifyChain !== "function") {
      return c.json({
        enabled: false,
        valid: true,
        eventCount: runtime.audit.list().length,
        message: "audit hash chain not enabled",
      });
    }
    return c.json(runtime.audit.verifyChain());
  });

  app.get("/approvals", (c) => {
    const parsed = approvalQuerySchema.safeParse({
      status: c.req.query("status"),
      agentId: c.req.query("agentId"),
      tool: c.req.query("tool"),
    });

    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        400,
      );
    }

    const approvals = runtime.approvals.list({
      status: parsed.data.status,
      agentId: parsed.data.agentId,
      tool: parsed.data.tool as ToolId | undefined,
    });
    return c.json({ approvals });
  });

  app.get("/approvals/:id", (c) => {
    const approval = runtime.approvals.getById(c.req.param("id"));
    if (!approval) {
      return c.json({ error: "not_found", message: "Approval not found" }, 404);
    }
    return c.json({ approval });
  });

  app.post("/approvals/:id/approve", async (c) => {
    let resolvedBy: string | undefined;
    try {
      const body = (await c.req.json()) as { resolvedBy?: string };
      resolvedBy = body.resolvedBy;
    } catch {
      // empty body is fine
    }

    try {
      const approval = runtime.approve(c.req.param("id"), resolvedBy);
      return c.json({ approval });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  app.post("/approvals/:id/reject", async (c) => {
    let resolvedBy: string | undefined;
    try {
      const body = (await c.req.json()) as { resolvedBy?: string };
      resolvedBy = body.resolvedBy;
    } catch {
      // empty body is fine
    }

    try {
      const approval = runtime.reject(c.req.param("id"), resolvedBy);
      return c.json({ approval });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "invalid_request", message }, 400);
    }
  });

  mountDashboard(app, gatewayConfig?.dashboard !== false);

  return app;
}
