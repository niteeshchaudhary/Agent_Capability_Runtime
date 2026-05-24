import type { CapabilitySigningAlgorithm, SigningMaterial } from "./signing-config.js";

export type { CapabilitySigningAlgorithm, SigningConfig, SigningMaterial } from "./signing-config.js";

/** Supported tool identifiers in ACR v1 */
export type ToolId = "gmail.send" | "slack.send" | "http.request";

export const SUPPORTED_TOOLS: readonly ToolId[] = [
  "gmail.send",
  "slack.send",
  "http.request",
] as const;

/** UTC hour window for allowed execution */
export interface AllowedHours {
  start: number;
  end: number;
}

/** Semantic execution intent — why an action is performed (agent-native governance). */
export interface ExecutionIntent {
  category: string;
  action?: string;
}

/** Runtime constraint set (SDK camelCase) */
export interface ConstraintSet {
  allowedDomains?: string[];
  maxActions?: number;
  allowedMethods?: string[];
  allowedUrls?: string[];
  attachments?: boolean;
  spendingLimit?: number;
  allowedHours?: AllowedHours;
  approvalRequired?: boolean;
  approvalRequiredIfExternal?: boolean;
  /** Allowed intent categories for execute (semantic governance) */
  allowedIntentCategories?: string[];
  /** When set, execute intent.action must be one of these (requires category match) */
  allowedIntentActions?: string[];
}

/** JWT payload shape (snake_case in token) */
export interface CapabilityTokenClaims {
  iss: string;
  sub: string;
  delegator?: string;
  session?: string;
  task?: string;
  tool: ToolId;
  constraints: JwtConstraintSet;
  metadata?: Record<string, unknown>;
  iat: number;
  exp: number;
  jti: string;
  /** Parent capability this token was delegated from */
  parent_jti?: string;
  /** Depth in delegation chain (0 = root grant) */
  delegation_depth?: number;
  /** Ordered chain of delegators for lineage */
  delegator_chain?: string[];
}

/** Constraints as stored in JWT */
export interface JwtConstraintSet {
  allowed_domains?: string[];
  max_actions?: number;
  allowed_methods?: string[];
  allowed_urls?: string[];
  attachments?: boolean;
  spending_limit?: number;
  allowed_hours?: AllowedHours;
  approval_required?: boolean;
  approval_required_if_external?: boolean;
  allowed_intent_categories?: string[];
  allowed_intent_actions?: string[];
}

/** Lineage fields for transitive delegation (v1 foundation) */
export interface DelegationLineage {
  parentJti?: string;
  delegationDepth?: number;
  delegatorChain?: string[];
}

export interface GrantCapabilityInput {
  agentId: string;
  tool: ToolId;
  constraints: ConstraintSet;
  expiresIn?: string | number;
  delegator?: string;
  session?: string;
  task?: string;
  /** Semantic intent label at grant time (stored in metadata.intent) */
  intent?: ExecutionIntent | string;
  metadata?: Record<string, unknown>;
  issuer?: string;
  /** Delegation: parent capability jti */
  parentJti?: string;
  delegationDepth?: number;
  delegatorChain?: string[];
}

export interface SignerOptions {
  /** @deprecated Prefer `signingMaterial` — HS256 shared secret */
  secret?: string;
  algorithm?: CapabilitySigningAlgorithm;
  signingMaterial?: SigningMaterial;
  issuer?: string;
}

export interface ValidatorOptions {
  /** @deprecated Prefer `signingMaterial` — HS256 shared secret */
  secret?: string;
  algorithm?: CapabilitySigningAlgorithm;
  signingMaterial?: SigningMaterial;
  issuer?: string;
  expectedTool?: ToolId;
  /** Reject tokens whose exp is within this many seconds (clock skew buffer) */
  clockToleranceSec?: number;
}

export type ValidationErrorCode =
  | "INVALID_FORMAT"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "INVALID_CLAIMS"
  | "ISSUER_MISMATCH"
  | "TOOL_MISMATCH"
  | "UNSUPPORTED_TOOL";

export interface ValidationSuccess {
  valid: true;
  claims: CapabilityTokenClaims;
}

export interface ValidationFailure {
  valid: false;
  error: {
    code: ValidationErrorCode;
    message: string;
  };
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface GrantCapabilityResult {
  token: string;
  claims: CapabilityTokenClaims;
  expiresAt: Date;
}

export const DEFAULT_ISSUER = "acr-runtime";
export const DEFAULT_EXPIRES_IN = "15m";
export const MAX_EXPIRES_SEC = 86_400; // 24 hours
