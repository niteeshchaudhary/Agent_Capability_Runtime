export { evaluatePolicy, compilePolicy, evaluatePolicyAst } from "./evaluate.js";
export type {
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  RuntimeDecision,
  PolicyDocument,
  PolicyNode,
  PolicyCondition,
} from "./evaluate.js";
export {
  computePolicyVersionId,
  compilePolicyVersioned,
  PolicyVersionRegistry,
} from "./policy-version.js";
export { can, domain, method, url, hours, intent, PolicyBuilder } from "./dsl/index.js";
export type {
  DomainInPredicate,
  HoursBetweenPredicate,
  MethodInPredicate,
  PolicyPredicate,
  UrlInPredicate,
} from "./dsl/index.js";
export type { ConstraintSet, ToolId } from "@acr/capability-token";
export {
  OpaPolicyBackend,
  buildOpaInput,
  buildOpaInputFromClaims,
  loadOpaConfigFromEnv,
  mergeOpaWithAstDecision,
  parseOpaDecision,
  queryOpaHttp,
} from "./opa/index.js";
export type {
  OpaBackendConfig,
  OpaDecision,
  OpaEvaluationInput,
  OpaEvaluationResult,
  OpaMode,
} from "./opa/index.js";
