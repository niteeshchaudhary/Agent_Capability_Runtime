/**
 * Query scope guard — block off-topic user prompts before they reach the LLM.
 * Zero LLM cost: keyword and regex rules only.
 */

export type ScopeMatchMode = "any_allowed" | "deny_only";

export interface TopicRuleInput {
  id?: string;
  name?: string;
  description?: string;
  keywords?: string[];
  terms?: string[];
  patterns?: string[];
}

export interface QueryScopeConfigInput {
  enabled?: boolean;
  purpose?: string;
  allowed_topics?: Array<TopicRuleInput | string>;
  denied_topics?: Array<TopicRuleInput | string>;
  deny_patterns?: string[];
  allow_greetings?: boolean;
  allow_empty?: boolean;
  match_mode?: ScopeMatchMode;
  refusal_message?: string;
}

export interface TopicRule {
  id: string;
  description: string;
  keywords: string[];
  patterns: string[];
}

export interface ScopeResult {
  allowed: boolean;
  reason: string;
  matchedTopic?: string;
  blockedBy?: string;
}

export interface QueryScopeConfig {
  enabled: boolean;
  purpose: string;
  allowedTopics: TopicRule[];
  deniedTopics: TopicRule[];
  denyPatterns: string[];
  allowGreetings: boolean;
  allowEmpty: boolean;
  matchMode: ScopeMatchMode;
  refusalMessage: string;
}

const DEFAULT_REFUSAL =
  "I can only help with topics related to my purpose. Please ask something within that scope.";

const GREETING_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|bye|goodbye|good morning|good evening)(\s|!|\?|\.|$)/i;

interface CompiledTopic {
  rule: TopicRule;
  keywordPatterns: RegExp[];
  regexPatterns: RegExp[];
}

interface CompiledDenyPattern {
  pattern: RegExp;
  label: string;
}

export class QueryScopeGuard {
  private readonly config: QueryScopeConfig;
  private readonly denyRegexes: CompiledDenyPattern[];
  private readonly allowed: CompiledTopic[];
  private readonly denied: CompiledTopic[];

  constructor(config: QueryScopeConfig) {
    this.config = config;
    this.denyRegexes = config.denyPatterns.map((p) => ({
      pattern: compilePattern(p),
      label: p,
    }));
    this.allowed = config.allowedTopics.map(compileTopicRule);
    this.denied = config.deniedTopics.map(compileTopicRule);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get purpose(): string {
    return this.config.purpose;
  }

  get refusalMessage(): string {
    return this.config.refusalMessage;
  }

  static disabled(): QueryScopeGuard {
    return new QueryScopeGuard({
      enabled: false,
      purpose: "",
      allowedTopics: [],
      deniedTopics: [],
      denyPatterns: [],
      allowGreetings: true,
      allowEmpty: true,
      matchMode: "any_allowed",
      refusalMessage: DEFAULT_REFUSAL,
    });
  }

  static fromConfig(input: QueryScopeConfigInput): QueryScopeGuard {
    const matchMode = input.match_mode ?? "any_allowed";
    if (matchMode !== "any_allowed" && matchMode !== "deny_only") {
      throw new Error("match_mode must be 'any_allowed' or 'deny_only'");
    }
    return new QueryScopeGuard({
      enabled: input.enabled ?? true,
      purpose: input.purpose ?? "",
      allowedTopics: (input.allowed_topics ?? []).map(parseTopicRule),
      deniedTopics: (input.denied_topics ?? []).map(parseTopicRule),
      denyPatterns: input.deny_patterns ?? [],
      allowGreetings: input.allow_greetings ?? true,
      allowEmpty: input.allow_empty ?? true,
      matchMode,
      refusalMessage: input.refusal_message ?? DEFAULT_REFUSAL,
    });
  }

  /** Load scope from JSON file (expects a top-level `scope` object or scope-only root). */
  static async loadJson(path: string): Promise<QueryScopeGuard> {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const scopeBlock = (raw.scope ?? raw) as QueryScopeConfigInput;
    if (typeof scopeBlock !== "object" || scopeBlock === null) {
      throw new Error(`Missing 'scope' object in ${path}`);
    }
    return QueryScopeGuard.fromConfig(scopeBlock);
  }

  check(query: string): ScopeResult {
    if (!this.config.enabled) {
      return { allowed: true, reason: "scope guard disabled" };
    }

    const text = query.trim();
    const normalized = text.toLowerCase();

    if (!text) {
      if (this.config.allowEmpty) {
        return { allowed: true, reason: "empty query allowed" };
      }
      return {
        allowed: false,
        reason: "empty query not allowed",
        blockedBy: "empty",
      };
    }

    if (this.config.allowGreetings && GREETING_PATTERN.test(text)) {
      return { allowed: true, reason: "greeting allowed", matchedTopic: "greeting" };
    }

    for (const { pattern, label } of this.denyRegexes) {
      if (pattern.test(text)) {
        return {
          allowed: false,
          reason: `matched deny pattern: ${label}`,
          blockedBy: label,
        };
      }
    }

    for (const compiled of this.denied) {
      if (topicMatches(compiled, normalized, text)) {
        return {
          allowed: false,
          reason: `matched denied topic: ${compiled.rule.id}`,
          blockedBy: compiled.rule.id,
        };
      }
    }

    if (this.config.matchMode === "deny_only") {
      return { allowed: true, reason: "deny-only mode, no deny match" };
    }

    if (this.allowed.length === 0) {
      return { allowed: true, reason: "no allowed_topics configured" };
    }

    for (const compiled of this.allowed) {
      if (topicMatches(compiled, normalized, text)) {
        return {
          allowed: true,
          reason: `matched allowed topic: ${compiled.rule.id}`,
          matchedTopic: compiled.rule.id,
        };
      }
    }

    return {
      allowed: false,
      reason: "query does not match any allowed topic",
      blockedBy: "out_of_scope",
    };
  }

  /** Return refusal text if denied, else `undefined` (safe to call LLM). */
  checkOrRefuse(query: string): string | undefined {
    const result = this.check(query);
    return result.allowed ? undefined : this.config.refusalMessage;
  }
}

function parseTopicRule(raw: TopicRuleInput | string): TopicRule {
  if (typeof raw === "string") {
    return { id: raw, description: "", keywords: [raw.toLowerCase()], patterns: [] };
  }
  const id = raw.id ?? raw.name;
  if (!id) {
    throw new Error("Topic rule requires 'id' or 'name'");
  }
  const keywords = (raw.keywords ?? raw.terms ?? []).map((k) => k.toLowerCase());
  return {
    id,
    description: raw.description ?? "",
    keywords,
    patterns: raw.patterns ?? [],
  };
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch (err) {
    throw new Error(`Invalid deny pattern ${JSON.stringify(pattern)}: ${String(err)}`);
  }
}

function compileTopicRule(rule: TopicRule): CompiledTopic {
  const keywordPatterns = rule.keywords
    .filter((kw) => kw.trim())
    .map((kw) => new RegExp(escapeRegex(kw.toLowerCase()), "i"));
  const regexPatterns = rule.patterns.map(compilePattern);
  return { rule, keywordPatterns, regexPatterns };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topicMatches(compiled: CompiledTopic, normalized: string, original: string): boolean {
  if (compiled.keywordPatterns.some((p) => p.test(normalized))) return true;
  if (compiled.regexPatterns.some((p) => p.test(original))) return true;
  return false;
}
