/** Semantic execution intent — why an action is performed (agent-native governance). */
export interface ExecutionIntent {
  category: string;
  action?: string;
}

export function normalizeExecutionIntent(
  value: ExecutionIntent | string | undefined,
): ExecutionIntent | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? { category: trimmed } : undefined;
  }
  const category = value.category?.trim();
  if (!category) return undefined;
  const action = value.action?.trim();
  return action ? { category, action } : { category };
}

export function executionIntentFromMetadata(
  metadata: Record<string, unknown> | undefined,
): ExecutionIntent | undefined {
  if (!metadata) return undefined;
  const raw = metadata.intent;
  if (typeof raw === "string" || (typeof raw === "object" && raw !== null)) {
    return normalizeExecutionIntent(raw as ExecutionIntent | string);
  }
  return undefined;
}

export function executionIntentKey(intent: ExecutionIntent): string {
  return intent.action ? `${intent.category}:${intent.action}` : intent.category;
}
