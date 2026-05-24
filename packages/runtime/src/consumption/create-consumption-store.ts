import { ConsumptionLedger } from "./consumption-ledger.js";
import type { RedisEvalClient } from "./redis-consumption-store.js";
import { RedisConsumptionStore } from "./redis-consumption-store.js";
import type { ConsumptionConfig, ConsumptionStore } from "./types.js";

export async function createConsumptionStore(
  config?: ConsumptionConfig,
): Promise<ConsumptionStore> {
  const mode = config?.mode ?? (config?.redisUrl || process.env.ACR_REDIS_URL ? "redis" : "memory");

  if (mode === "memory") {
    return new ConsumptionLedger();
  }

  const redisUrl = config?.redisUrl ?? process.env.ACR_REDIS_URL;
  if (!redisUrl) {
    throw new Error("Redis consumption requires redisUrl or ACR_REDIS_URL");
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: redisUrl });
  await client.connect();

  return new RedisConsumptionStore(client as unknown as RedisEvalClient, {
    keyPrefix: config?.keyPrefix,
    ttlSec: config?.ttlSec ?? 86_400,
  });
}
