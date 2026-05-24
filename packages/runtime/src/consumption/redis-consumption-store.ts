import { RELEASE_SCRIPT, TRY_CONSUME_SCRIPT } from "./lua.js";
import type { ConsumeResult, ConsumptionStore } from "./types.js";

/** Minimal Redis client surface (node-redis `createClient`) */
export interface RedisEvalClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
}

export interface RedisConsumptionOptions {
  keyPrefix?: string;
  ttlSec?: number;
}

function parseTryConsumeResult(raw: unknown): ConsumeResult {
  const row = raw as [number, number, number, string];
  const allowed = Number(row[0]) === 1;
  const count = Number(row[1]);
  const replay = Number(row[2]) === 1;
  const reason = String(row[3] ?? "");
  return {
    allowed,
    count,
    replay,
    reason: reason.length > 0 ? reason : undefined,
  };
}

export class RedisConsumptionStore implements ConsumptionStore {
  private readonly prefix: string;
  private readonly ttlSec?: number;

  constructor(
    private readonly client: RedisEvalClient,
    options?: RedisConsumptionOptions,
  ) {
    this.prefix = options?.keyPrefix ?? "acr:consume";
    this.ttlSec = options?.ttlSec;
  }

  private countKey(jti: string): string {
    return `${this.prefix}:${jti}:count`;
  }

  private reqsKey(jti: string): string {
    return `${this.prefix}:${jti}:reqs`;
  }

  private async touchTtl(jti: string): Promise<void> {
    if (this.ttlSec === undefined) return;
    await Promise.all([
      this.client.expire(this.countKey(jti), this.ttlSec),
      this.client.expire(this.reqsKey(jti), this.ttlSec),
    ]);
  }

  async get(jti: string): Promise<number> {
    const raw = await this.client.get(this.countKey(jti));
    return raw === null ? 0 : Number.parseInt(raw, 10);
  }

  async tryConsume(
    jti: string,
    limit: number | undefined,
    requestId?: string,
  ): Promise<ConsumeResult> {
    const limitArg = limit === undefined ? "" : String(limit);
    const raw = await this.client.eval(TRY_CONSUME_SCRIPT, {
      keys: [this.countKey(jti), this.reqsKey(jti)],
      arguments: [limitArg, requestId ?? ""],
    });
    await this.touchTtl(jti);
    return parseTryConsumeResult(raw);
  }

  async release(jti: string, requestId?: string): Promise<void> {
    await this.client.eval(RELEASE_SCRIPT, {
      keys: [this.countKey(jti), this.reqsKey(jti)],
      arguments: [requestId ?? ""],
    });
    await this.touchTtl(jti);
  }

  async reset(jti?: string): Promise<void> {
    if (jti !== undefined) {
      await this.client.del(this.countKey(jti), this.reqsKey(jti));
      return;
    }
    throw new Error("RedisConsumptionStore.reset() without jti is not supported — use FLUSHDB in ops");
  }
}
