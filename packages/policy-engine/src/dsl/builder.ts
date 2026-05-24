import type { ConstraintSet, GrantCapabilityInput, ToolId } from "@acr/capability-token";
import { compilePolicy } from "../compile.js";
import type { PolicyDocument } from "../ast.js";
import type { PolicyPredicate } from "./predicates.js";
import { domain } from "./predicates.js";

export class PolicyBuilder {
  private readonly tool: ToolId;
  private predicates: PolicyPredicate[] = [];
  private constraints: ConstraintSet = {};
  private grantExpiresIn?: string | number;

  constructor(tool: ToolId) {
    this.tool = tool;
  }

  /** Gmail: only send to these recipient domains. */
  onlyDomain(domainName: string): this {
    return this.onlyDomains(domainName);
  }

  /** Gmail: allow-list recipient domains. */
  onlyDomains(...domainNames: string[]): this {
    return this.where(domain.in(domainNames));
  }

  /** Token TTL passed to grant (e.g. `"10m"`, `"1h"`). */
  expiresIn(duration: string | number): this {
    this.grantExpiresIn = duration;
    return this;
  }

  /** Max spend in USD cents; amounts over limit require human approval. */
  maxSpend(cents: number): this {
    return this.spendingLimit(cents);
  }

  /** Add declarative predicates (domain, method, url, hours). */
  where(...predicates: PolicyPredicate[]): this {
    this.predicates.push(...predicates);
    return this;
  }

  /** Alias for `maxActions` — matches DSL roadmap syntax `.limit(5)` */
  limit(maxActions: number): this {
    return this.maxActions(maxActions);
  }

  maxActions(maxActions: number): this {
    this.constraints = { ...this.constraints, maxActions };
    return this;
  }

  allowedHours(start: number, end: number): this {
    this.constraints = { ...this.constraints, allowedHours: { start, end } };
    return this;
  }

  requireApproval(): this {
    this.constraints = { ...this.constraints, approvalRequired: true };
    return this;
  }

  requireApprovalIfExternal(): this {
    this.constraints = { ...this.constraints, approvalRequiredIfExternal: true };
    return this;
  }

  noAttachments(): this {
    this.constraints = { ...this.constraints, attachments: false };
    return this;
  }

  spendingLimit(spendingLimit: number): this {
    this.constraints = { ...this.constraints, spendingLimit };
    return this;
  }

  /** Merge additional raw constraints (escape hatch). */
  with(constraints: ConstraintSet): this {
    this.constraints = { ...this.constraints, ...constraints };
    return this;
  }

  /**
   * Allow executions whose intent category matches (semantic governance).
   * @example .whenIntent("customer_support")
   */
  whenIntent(category: string): this {
    const existing = this.constraints.allowedIntentCategories ?? [];
    this.constraints = {
      ...this.constraints,
      allowedIntentCategories: [...existing, category],
    };
    return this;
  }

  /**
   * Allow a specific category + action pair at execute time.
   * @example .whenIntentAction("customer_support", "reply_email")
   */
  whenIntentAction(category: string, action: string): this {
    this.whenIntent(category);
    const existing = this.constraints.allowedIntentActions ?? [];
    this.constraints = {
      ...this.constraints,
      allowedIntentActions: [...existing, action],
    };
    return this;
  }

  build(): ConstraintSet {
    const fromPredicates = predicatesToConstraints(this.tool, this.predicates);
    return { ...fromPredicates, ...this.constraints };
  }

  compile(): PolicyDocument {
    return compilePolicy(this.tool, this.build());
  }

  /** Build a grant input — use with `grantCapability` or runtime.grant */
  toGrantInput(
    input: Omit<GrantCapabilityInput, "tool" | "constraints" | "expiresIn">,
  ): GrantCapabilityInput {
    return {
      ...input,
      tool: this.tool,
      constraints: this.build(),
      ...(this.grantExpiresIn !== undefined ? { expiresIn: this.grantExpiresIn } : {}),
    };
  }
}

export function can(tool: ToolId): PolicyBuilder {
  return new PolicyBuilder(tool);
}

function predicatesToConstraints(tool: ToolId, predicates: PolicyPredicate[]): ConstraintSet {
  const out: ConstraintSet = {};

  for (const p of predicates) {
    switch (p.type) {
      case "domain_in":
        if (tool !== "gmail.send") {
          throw new Error(`domain.in() is only valid for gmail.send, got ${tool}`);
        }
        out.allowedDomains = [...(out.allowedDomains ?? []), ...p.domains];
        break;
      case "method_in":
        if (tool !== "http.request") {
          throw new Error(`method.in() is only valid for http.request, got ${tool}`);
        }
        out.allowedMethods = [...(out.allowedMethods ?? []), ...p.methods];
        break;
      case "url_in":
        if (tool !== "http.request") {
          throw new Error(`url.in() is only valid for http.request, got ${tool}`);
        }
        out.allowedUrls = [...(out.allowedUrls ?? []), ...p.urls];
        break;
      case "hours_between":
        out.allowedHours = { start: p.start, end: p.end };
        break;
      case "intent_category": {
        const existing = out.allowedIntentCategories ?? [];
        out.allowedIntentCategories = [...existing, p.category];
        break;
      }
      case "intent_action": {
        const cats = out.allowedIntentCategories ?? [];
        out.allowedIntentCategories = [...cats, p.category];
        const acts = out.allowedIntentActions ?? [];
        out.allowedIntentActions = [...acts, p.action];
        break;
      }
      default: {
        const _exhaustive: never = p;
        throw new Error(`Unknown predicate: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  if (out.allowedDomains) {
    out.allowedDomains = [...new Set(out.allowedDomains.map((d) => d.toLowerCase()))];
  }
  if (out.allowedMethods) {
    out.allowedMethods = [...new Set(out.allowedMethods.map((m) => m.toUpperCase()))];
  }
  if (out.allowedIntentCategories) {
    out.allowedIntentCategories = [
      ...new Set(out.allowedIntentCategories.map((c) => c.toLowerCase())),
    ];
  }
  if (out.allowedIntentActions) {
    out.allowedIntentActions = [
      ...new Set(out.allowedIntentActions.map((a) => a.toLowerCase())),
    ];
  }

  return out;
}
