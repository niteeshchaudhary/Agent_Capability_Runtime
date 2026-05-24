import type { RevocationRecord, RevocationStore } from "./types.js";

export class InMemoryRevocationStore implements RevocationStore {
  private readonly records = new Map<string, RevocationRecord>();

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
    this.records.set(jti, record);
    return record;
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.records.has(jti);
  }

  async get(jti: string): Promise<RevocationRecord | undefined> {
    return this.records.get(jti);
  }

  async list(): Promise<RevocationRecord[]> {
    return [...this.records.values()];
  }
}
