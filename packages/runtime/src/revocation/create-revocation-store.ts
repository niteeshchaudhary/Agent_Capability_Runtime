import { InMemoryRevocationStore } from "./in-memory-revocation-store.js";
import type { RedisRevocationClient } from "./redis-revocation-store.js";
import { RedisRevocationStore } from "./redis-revocation-store.js";
import type { RevocationConfig, RevocationStore } from "./types.js";

/**
 * Create a revocation store. Defaults to in-memory unless `mode: "redis"` is set.
 * Redis is opt-in — omit `mode` or set `mode: "memory"` for single-process deployments.
 */
export async function createRevocationStore(
  config?: RevocationConfig,
): Promise<RevocationStore> {
  const mode = config?.mode ?? "memory";

  if (mode === "memory") {
    return new InMemoryRevocationStore();
  }

  const redisUrl = config?.redisUrl ?? process.env.ACR_REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      "Redis revocation requires mode 'redis' and redisUrl or ACR_REDIS_URL",
    );
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: redisUrl });
  await client.connect();

  return new RedisRevocationStore(client as unknown as RedisRevocationClient, {
    keyPrefix: config?.keyPrefix,
    ttlSec: config?.ttlSec ?? 86_400,
  });
}
