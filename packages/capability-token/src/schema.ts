import { z } from "zod";
import { SUPPORTED_TOOLS } from "./types.js";

const allowedHoursSchema = z
  .object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
  })
  .refine((h) => h.start <= h.end, {
    message: "allowedHours.start must be <= allowedHours.end",
  });

export const constraintSetSchema = z
  .object({
    allowedDomains: z.array(z.string().min(1)).optional(),
    maxActions: z.number().int().positive().optional(),
    allowedMethods: z
      .array(z.string().regex(/^[A-Z]+$/))
      .optional(),
    allowedUrls: z.array(z.string().min(1)).optional(),
    attachments: z.boolean().optional(),
    spendingLimit: z.number().nonnegative().optional(),
    allowedHours: allowedHoursSchema.optional(),
    approvalRequired: z.boolean().optional(),
    approvalRequiredIfExternal: z.boolean().optional(),
    allowedIntentCategories: z.array(z.string().min(1)).optional(),
    allowedIntentActions: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const executionIntentSchema = z.object({
  category: z.string().min(1),
  action: z.string().min(1).optional(),
});

export const jwtConstraintSetSchema = z
  .object({
    allowed_domains: z.array(z.string().min(1)).optional(),
    max_actions: z.number().int().positive().optional(),
    allowed_methods: z
      .array(z.string().regex(/^[A-Z]+$/))
      .optional(),
    allowed_urls: z.array(z.string().min(1)).optional(),
    attachments: z.boolean().optional(),
    spending_limit: z.number().nonnegative().optional(),
    allowed_hours: allowedHoursSchema.optional(),
    approval_required: z.boolean().optional(),
    approval_required_if_external: z.boolean().optional(),
    allowed_intent_categories: z.array(z.string().min(1)).optional(),
    allowed_intent_actions: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const toolIdSchema = z.enum(SUPPORTED_TOOLS as unknown as [string, ...string[]]);

export const grantCapabilityInputSchema = z
  .object({
    agentId: z.string().min(1),
    tool: toolIdSchema,
    constraints: constraintSetSchema,
    expiresIn: z.union([z.string(), z.number()]).optional(),
    delegator: z.string().min(1).optional(),
    session: z.string().min(1).optional(),
    task: z.string().min(1).optional(),
    intent: z.union([z.string().min(1), executionIntentSchema]).optional(),
    metadata: z.record(z.unknown()).optional(),
    issuer: z.string().min(1).optional(),
    parentJti: z.string().regex(/^cap_[0-9a-f-]{36}$/).optional(),
    delegationDepth: z.number().int().min(0).max(16).optional(),
    delegatorChain: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const capabilityTokenClaimsSchema = z
  .object({
    iss: z.string().min(1),
    sub: z.string().min(1),
    delegator: z.string().min(1).optional(),
    session: z.string().min(1).optional(),
    task: z.string().min(1).optional(),
    tool: toolIdSchema,
    constraints: jwtConstraintSetSchema,
    metadata: z.record(z.unknown()).optional(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    jti: z.string().regex(/^cap_[0-9a-f-]{36}$/),
    parent_jti: z.string().regex(/^cap_[0-9a-f-]{36}$/).optional(),
    delegation_depth: z.number().int().min(0).max(16).optional(),
    delegator_chain: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((c) => c.exp > c.iat, { message: "exp must be after iat" });

export type GrantCapabilityInputParsed = z.infer<typeof grantCapabilityInputSchema>;
