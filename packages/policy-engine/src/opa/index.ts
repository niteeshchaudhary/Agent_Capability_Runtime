export type {
  OpaBackendConfig,
  OpaDecision,
  OpaEvaluationInput,
  OpaEvaluationResult,
  OpaMode,
} from "./types.js";
export { buildOpaInput, buildOpaInputFromClaims, toOpaRequestBody } from "./input.js";
export { parseOpaDecision, parseOpaHttpResponse } from "./parse.js";
export type { FetchFn } from "./types.js";
export { queryOpaHttp } from "./http-client.js";
export { queryOpaLocalBundle, isOpaCliAvailable } from "./local-bundle.js";
export { OpaPolicyBackend, mergeOpaWithAstDecision } from "./backend.js";
export { loadOpaConfigFromEnv } from "./load-config.js";
