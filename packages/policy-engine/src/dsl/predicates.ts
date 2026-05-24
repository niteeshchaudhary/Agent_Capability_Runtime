/** Predicate passed to `can(tool).where(...)` */

export interface DomainInPredicate {
  readonly type: "domain_in";
  readonly domains: string[];
}

export interface MethodInPredicate {
  readonly type: "method_in";
  readonly methods: string[];
}

export interface UrlInPredicate {
  readonly type: "url_in";
  readonly urls: string[];
}

export interface HoursBetweenPredicate {
  readonly type: "hours_between";
  readonly start: number;
  readonly end: number;
}

export interface IntentCategoryPredicate {
  readonly type: "intent_category";
  readonly category: string;
}

export interface IntentActionPredicate {
  readonly type: "intent_action";
  readonly category: string;
  readonly action: string;
}

export type PolicyPredicate =
  | DomainInPredicate
  | MethodInPredicate
  | UrlInPredicate
  | HoursBetweenPredicate
  | IntentCategoryPredicate
  | IntentActionPredicate;

export const domain = {
  in: (domains: string[]): DomainInPredicate => ({
    type: "domain_in",
    domains,
  }),
};

export const method = {
  in: (methods: string[]): MethodInPredicate => ({
    type: "method_in",
    methods: methods.map((m) => m.toUpperCase()),
  }),
};

export const url = {
  in: (urls: string[]): UrlInPredicate => ({
    type: "url_in",
    urls,
  }),
};

export const hours = {
  between: (start: number, end: number): HoursBetweenPredicate => ({
    type: "hours_between",
    start,
    end,
  }),
};

/** Restrict capability to a semantic intent category (e.g. customer_support). */
export const intent = {
  category: (category: string): IntentCategoryPredicate => ({
    type: "intent_category",
    category,
  }),
  action: (category: string, action: string): IntentActionPredicate => ({
    type: "intent_action",
    category,
    action,
  }),
};
