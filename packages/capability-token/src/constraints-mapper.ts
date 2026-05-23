import type { ConstraintSet, JwtConstraintSet } from "./types.js";

export function constraintsToJwt(constraints: ConstraintSet): JwtConstraintSet {
  const jwt: JwtConstraintSet = {};

  if (constraints.allowedDomains !== undefined) {
    jwt.allowed_domains = constraints.allowedDomains;
  }
  if (constraints.maxActions !== undefined) {
    jwt.max_actions = constraints.maxActions;
  }
  if (constraints.allowedMethods !== undefined) {
    jwt.allowed_methods = constraints.allowedMethods.map((m) => m.toUpperCase());
  }
  if (constraints.allowedUrls !== undefined) {
    jwt.allowed_urls = constraints.allowedUrls;
  }
  if (constraints.attachments !== undefined) {
    jwt.attachments = constraints.attachments;
  }
  if (constraints.spendingLimit !== undefined) {
    jwt.spending_limit = constraints.spendingLimit;
  }
  if (constraints.allowedHours !== undefined) {
    jwt.allowed_hours = constraints.allowedHours;
  }
  if (constraints.approvalRequired !== undefined) {
    jwt.approval_required = constraints.approvalRequired;
  }
  if (constraints.approvalRequiredIfExternal !== undefined) {
    jwt.approval_required_if_external = constraints.approvalRequiredIfExternal;
  }

  return jwt;
}

export function constraintsFromJwt(jwt: JwtConstraintSet): ConstraintSet {
  const constraints: ConstraintSet = {};

  if (jwt.allowed_domains !== undefined) {
    constraints.allowedDomains = jwt.allowed_domains;
  }
  if (jwt.max_actions !== undefined) {
    constraints.maxActions = jwt.max_actions;
  }
  if (jwt.allowed_methods !== undefined) {
    constraints.allowedMethods = jwt.allowed_methods;
  }
  if (jwt.allowed_urls !== undefined) {
    constraints.allowedUrls = jwt.allowed_urls;
  }
  if (jwt.attachments !== undefined) {
    constraints.attachments = jwt.attachments;
  }
  if (jwt.spending_limit !== undefined) {
    constraints.spendingLimit = jwt.spending_limit;
  }
  if (jwt.allowed_hours !== undefined) {
    constraints.allowedHours = jwt.allowed_hours;
  }
  if (jwt.approval_required !== undefined) {
    constraints.approvalRequired = jwt.approval_required;
  }
  if (jwt.approval_required_if_external !== undefined) {
    constraints.approvalRequiredIfExternal = jwt.approval_required_if_external;
  }

  return constraints;
}
