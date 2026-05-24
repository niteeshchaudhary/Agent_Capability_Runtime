export interface ConsumeResult {
  /** Whether this execution may proceed (under max_actions) */
  allowed: boolean;
  /** Current consumption count after this operation */
  count: number;
  /** Same requestId was already consumed successfully — do not double-execute */
  replay: boolean;
  reason?: string;
}

/**
 * Shared consumption ledger for `max_actions` and idempotent `requestId`.
 * Implementations MUST be safe under concurrent execute calls (same jti).
 */
export interface ConsumptionStore {
  get(jti: string): Promise<number>;
  tryConsume(jti: string, limit: number | undefined, requestId?: string): Promise<ConsumeResult>;
  /** Roll back a consume if adapter execution failed after reservation */
  release(jti: string, requestId?: string): Promise<void>;
  reset(jti?: string): Promise<void>;
}

export interface ConsumptionConfig {
  /** `memory` (default) or `redis` */
  mode?: "memory" | "redis";
  /** Redis connection URL (e.g. redis://localhost:6379). Falls back to ACR_REDIS_URL. */
  redisUrl?: string;
  /** Key prefix for Redis keys (default `acr:consume`) */
  keyPrefix?: string;
  /** TTL for Redis keys in seconds (should align with token max lifetime) */
  ttlSec?: number;
}
