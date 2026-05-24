export interface RevocationRecord {
  jti: string;
  revokedAt: string;
  reason?: string;
  revokedBy?: string;
}

/**
 * Capability revocation store — in-memory (single process) or Redis (multi-instance).
 * All methods are async so Redis backends do not block the event loop.
 */
export interface RevocationStore {
  revoke(jti: string, options?: { reason?: string; revokedBy?: string }): Promise<RevocationRecord>;
  isRevoked(jti: string): Promise<boolean>;
  get(jti: string): Promise<RevocationRecord | undefined>;
  list(): Promise<RevocationRecord[]>;
}

export interface RevocationConfig {
  /** `memory` (default) or `redis` — Redis is opt-in only */
  mode?: "memory" | "redis";
  /** Redis URL when mode is `redis`. Falls back to `ACR_REDIS_URL`. */
  redisUrl?: string;
  /** Key prefix (default `acr:revoke`) */
  keyPrefix?: string;
  /** TTL for revocation keys in seconds (align with max token lifetime; default 86400) */
  ttlSec?: number;
}
