import type { RevocationRecord, RevocationStore } from "./types.js";

/** Minimal Redis client surface for revocation (node-redis `createClient`) */
export interface RedisRevocationClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  scan(
    cursor: number,
    options?: { MATCH?: string; COUNT?: number },
  ): Promise<{ cursor: number; keys: string[] }>;
}

export interface RedisRevocationOptions {
  keyPrefix?: string;
  ttlSec?: number;
}

export class RedisRevocationStore implements RevocationStore {
  private readonly prefix: string;
  private readonly ttlSec: number;

  constructor(
    private readonly client: RedisRevocationClient,
    options?: RedisRevocationOptions,
  ) {
    this.prefix = options?.keyPrefix ?? "acr:revoke";
    this.ttlSec = options?.ttlSec ?? 86_400;
  }

  private key(jti: string): string {
    return `${this.prefix}:${jti}`;
  }

  private matchPattern(): string {
    return `${this.prefix}:*`;
  }

  async revoke(
    jti: string,
    options?: { reason?: string; revokedBy?: string },
  ): Promise<RevocationRecord> {
    const record: RevocationRecord = {
      jti,
      revokedAt: new Date().toISOString(),
      reason: options?.reason,
      revokedBy: options?.revokedBy,
    };
    await this.client.set(this.key(jti), JSON.stringify(record), { EX: this.ttlSec });
    return record;
  }

  async isRevoked(jti: string): Promise<boolean> {
    const raw = await this.client.get(this.key(jti));
    return raw !== null;
  }

  async get(jti: string): Promise<RevocationRecord | undefined> {
    const raw = await this.client.get(this.key(jti));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as RevocationRecord;
    } catch {
      return {
        jti,
        revokedAt: new Date().toISOString(),
        reason: "revoked",
      };
    }
  }

  async list(): Promise<RevocationRecord[]> {
    const records: RevocationRecord[] = [];
    let cursor = 0;
    do {
      const page = await this.client.scan(cursor, {
        MATCH: this.matchPattern(),
        COUNT: 100,
      });
      cursor = page.cursor;
      for (const key of page.keys) {
        const raw = await this.client.get(key);
        if (raw === null) continue;
        try {
          records.push(JSON.parse(raw) as RevocationRecord);
        } catch {
          const jti = key.slice(this.prefix.length + 1);
          records.push({ jti, revokedAt: new Date().toISOString() });
        }
      }
    } while (cursor !== 0);
    return records;
  }
}
