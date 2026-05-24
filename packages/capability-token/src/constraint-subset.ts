import { constraintsFromJwt } from "./constraints-mapper.js";
import type { CapabilityTokenClaims, ConstraintSet, JwtConstraintSet } from "./types.js";

export interface ConstraintSubsetViolation {
  field: string;
  message: string;
}

function isSubsetDomains(parent: string[], child: string[]): boolean {
  const p = new Set(parent.map((d) => d.toLowerCase()));
  return child.every((d) => p.has(d.toLowerCase()));
}

function isSubsetList(parent: string[], child: string[]): boolean {
  const p = new Set(parent.map((s) => s.toUpperCase()));
  return child.every((s) => p.has(s.toUpperCase()));
}

/**
 * Verify child constraints are equal or stricter than parent (delegation cannot escalate).
 */
export function assertConstraintSubset(
  parent: ConstraintSet,
  child: ConstraintSet,
): ConstraintSubsetViolation[] {
  const violations: ConstraintSubsetViolation[] = [];

  if (parent.maxActions !== undefined && child.maxActions !== undefined) {
    if (child.maxActions > parent.maxActions) {
      violations.push({
        field: "maxActions",
        message: `child maxActions (${child.maxActions}) exceeds parent (${parent.maxActions})`,
      });
    }
  }

  if (parent.allowedDomains?.length && child.allowedDomains?.length) {
    if (!isSubsetDomains(parent.allowedDomains, child.allowedDomains)) {
      violations.push({
        field: "allowedDomains",
        message: "child allowedDomains must be a subset of parent",
      });
    }
  }

  if (parent.allowedMethods?.length && child.allowedMethods?.length) {
    if (!isSubsetList(parent.allowedMethods, child.allowedMethods)) {
      violations.push({
        field: "allowedMethods",
        message: "child allowedMethods must be a subset of parent",
      });
    }
  }

  if (parent.allowedUrls?.length && child.allowedUrls?.length) {
    const parentHosts = new Set(parent.allowedUrls.map((u) => u.toLowerCase()));
    const childOk = child.allowedUrls.every((u) =>
      [...parentHosts].some((p) => u.toLowerCase() === p || u.toLowerCase().endsWith(`.${p}`)),
    );
    if (!childOk) {
      violations.push({
        field: "allowedUrls",
        message: "child allowedUrls must be within parent allowlist",
      });
    }
  }

  if (parent.attachments === false && child.attachments === true) {
    violations.push({
      field: "attachments",
      message: "child cannot enable attachments when parent forbids them",
    });
  }

  if (parent.allowedHours && child.allowedHours) {
    const { start: ps, end: pe } = parent.allowedHours;
    const { start: cs, end: ce } = child.allowedHours;
    if (cs < ps || ce > pe) {
      violations.push({
        field: "allowedHours",
        message: "child allowedHours must fall within parent window",
      });
    }
  }

  if (parent.spendingLimit !== undefined && child.spendingLimit !== undefined) {
    if (child.spendingLimit > parent.spendingLimit) {
      violations.push({
        field: "spendingLimit",
        message: "child spendingLimit exceeds parent",
      });
    }
  }

  if (parent.approvalRequired && !child.approvalRequired) {
    violations.push({
      field: "approvalRequired",
      message: "child must keep approvalRequired when parent requires it",
    });
  }

  return violations;
}

export function assertConstraintSubsetFromClaims(
  parentClaims: CapabilityTokenClaims,
  child: ConstraintSet,
): void {
  const parent = constraintsFromJwt(parentClaims.constraints as JwtConstraintSet);
  const violations = assertConstraintSubset(parent, child);
  if (violations.length > 0) {
    throw new Error(
      `Delegation constraint escalation: ${violations.map((v) => v.message).join("; ")}`,
    );
  }
}
