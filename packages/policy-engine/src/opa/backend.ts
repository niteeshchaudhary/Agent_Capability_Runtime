import type { FetchFn } from "./http-client.js";
import { queryOpaHttp } from "./http-client.js";
import { queryOpaLocalBundle } from "./local-bundle.js";
import type {
  OpaBackendConfig,
  OpaDecision,
  OpaEvaluationInput,
  OpaEvaluationResult,
  OpaMode,
} from "./types.js";

const DEFAULT_DECISION_PATH = "acr/decision";

export class OpaPolicyBackend {
  readonly config: OpaBackendConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: OpaBackendConfig, fetchFn?: FetchFn) {
    this.config = {
      decisionPath: DEFAULT_DECISION_PATH,
      mode: "enforce",
      timeoutMs: 3000,
      ...config,
    };
    this.fetchFn = fetchFn ?? config.fetchFn ?? fetch;
  }

  get mode(): OpaMode {
    return this.config.mode ?? "enforce";
  }

  get enabled(): boolean {
    return this.mode !== "disabled" && Boolean(this.config.url || this.config.bundlePath);
  }

  async evaluate(input: OpaEvaluationInput): Promise<OpaEvaluationResult> {
    if (this.mode === "disabled" || (!this.config.url && !this.config.bundlePath)) {
      return {
        allowed: true,
        decision: "ALLOW",
        shadowOnly: false,
        source: "disabled",
      };
    }

    let decision: OpaDecision | null = null;
    let source: OpaEvaluationResult["source"] = "skipped";

    if (this.config.url) {
      decision = await queryOpaHttp(
        input,
        {
          url: this.config.url,
          decisionPath: this.config.decisionPath ?? DEFAULT_DECISION_PATH,
          timeoutMs: this.config.timeoutMs,
          headers: this.config.headers,
        },
        this.fetchFn,
      );
      source = "opa-http";
    } else if (this.config.bundlePath) {
      decision = await queryOpaLocalBundle(
        input,
        this.config.bundlePath,
        this.config.decisionPath ?? DEFAULT_DECISION_PATH,
      );
      source = "opa-local";
    }

    if (!decision || decision.decision === "ALLOW" || decision.decision === "SIMULATE") {
      return {
        allowed: true,
        decision: decision?.decision ?? "ALLOW",
        reason: decision?.reason,
        shadowOnly: false,
        source,
      };
    }

    const shadowOnly = this.mode === "shadow";
    return {
      allowed: shadowOnly,
      decision: decision.decision,
      reason: decision.reason ?? "denied by OPA policy",
      shadowOnly,
      source,
    };
  }
}

export function mergeOpaWithAstDecision(
  astDecision: string,
  opa: OpaEvaluationResult,
): { block: boolean; decision: string; reason?: string; shadowOnly: boolean } {
  if (astDecision === "DENY" || astDecision === "REQUIRE_APPROVAL") {
    return { block: true, decision: astDecision, shadowOnly: false };
  }
  if (opa.source === "disabled") {
    return { block: false, decision: astDecision, shadowOnly: false };
  }
  if (opa.allowed) {
    return { block: false, decision: astDecision, shadowOnly: opa.shadowOnly };
  }
  return {
    block: !opa.shadowOnly,
    decision: opa.decision,
    reason: opa.reason,
    shadowOnly: opa.shadowOnly,
  };
}
