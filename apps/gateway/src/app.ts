import { grantCapabilityInputSchema, toolIdSchema, type ToolId } from "@acr/capability-token";
import type { AgentCapabilityRuntime } from "@acr/runtime";
import { Hono } from "hono";
import { z } from "zod";

export const GATEWAY_VERSION = "0.1.0";

const executeBodySchema = z.object({
  token: z.string().min(1),
  tool: toolIdSchema,
  payload: z.record(z.unknown()),
  approvalId: z.string().optional(),
});

const auditQuerySchema = z.object({
  agentId: z.string().optional(),
  tool: z.string().optional(),
  decision: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const approvalQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  agentId: z.string().optional(),
  tool: toolIdSchema.optional(),
});

export function createApp(runtime: AgentCapabilityRuntime): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ status: "ok", version: GATEWAY_VERSION }),
  );

  app.post("/capabilities/grant", async (c) => {
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
    });

    if (result.ok) {
      return c.json({
        decision: result.decision,
        result: result.result,
        auditId: result.auditId,
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
      result.code === "invalid_token" || result.code === "token_expired" ? 401 : 403;

    return c.json(
      {
        decision: result.decision,
        reason: result.reason,
        auditId: result.auditId,
        code: result.code,
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

  return app;
}
