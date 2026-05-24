import { createHash } from "crypto";
import type { ConstraintSet, ToolId } from "@acr/capability-token";
import type { PolicyDocument } from "./ast.js";
import { compilePolicy } from "./compile.js";

/** Stable hash of compiled policy for immutable versioning and audit replay. */
export function computePolicyVersionId(doc: PolicyDocument): string {
  const canonical = JSON.stringify({
    tool: doc.tool,
    root: doc.root,
    source: doc.source,
  });
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `pol_${digest}`;
}

export function compilePolicyVersioned(
  tool: ToolId,
  constraints: ConstraintSet,
): PolicyDocument & { policyVersionId: string } {
  const doc = compilePolicy(tool, constraints);
  const policyVersionId = computePolicyVersionId(doc);
  return { ...doc, policyVersionId };
}

/** Immutable registry — first registration wins; enables audit replay. */
export class PolicyVersionRegistry {
  private readonly versions = new Map<string, PolicyDocument & { policyVersionId: string }>();

  register(tool: ToolId, constraints: ConstraintSet): {
    policyVersionId: string;
    document: PolicyDocument & { policyVersionId: string };
  } {
    const document = compilePolicyVersioned(tool, constraints);
    const existing = this.versions.get(document.policyVersionId);
    if (existing) {
      return { policyVersionId: document.policyVersionId, document: existing };
    }
    this.versions.set(document.policyVersionId, document);
    return { policyVersionId: document.policyVersionId, document };
  }

  get(policyVersionId: string): (PolicyDocument & { policyVersionId: string }) | undefined {
    return this.versions.get(policyVersionId);
  }

  has(policyVersionId: string): boolean {
    return this.versions.has(policyVersionId);
  }

  list(): string[] {
    return [...this.versions.keys()];
  }
}
