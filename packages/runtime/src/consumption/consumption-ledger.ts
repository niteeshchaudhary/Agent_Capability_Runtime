import type { ConsumeResult, ConsumptionStore } from "./types.js";

/**
 * In-memory consumption ledger (single-process runtimes).
 */
export class ConsumptionLedger implements ConsumptionStore {
  private readonly counts = new Map<string, number>();
  private readonly completedRequests = new Map<string, Set<string>>();

  async get(jti: string): Promise<number> {
    return this.counts.get(jti) ?? 0;
  }

  async tryConsume(
    jti: string,
    limit: number | undefined,
    requestId?: string,
  ): Promise<ConsumeResult> {
    if (requestId) {
      const seen = this.completedRequests.get(jti);
      if (seen?.has(requestId)) {
        return {
          allowed: true,
          count: await this.get(jti),
          replay: true,
          reason: "idempotent replay — request already consumed",
        };
      }
    }

    const current = await this.get(jti);
    if (limit !== undefined && current >= limit) {
      return {
        allowed: false,
        count: current,
        replay: false,
        reason: "max_actions exceeded",
      };
    }

    const next = current + 1;
    this.counts.set(jti, next);

    if (requestId) {
      let set = this.completedRequests.get(jti);
      if (!set) {
        set = new Set();
        this.completedRequests.set(jti, set);
      }
      set.add(requestId);
    }

    return { allowed: true, count: next, replay: false };
  }

  async release(jti: string, requestId?: string): Promise<void> {
    const current = await this.get(jti);
    if (current > 0) {
      this.counts.set(jti, current - 1);
    }
    if (requestId) {
      this.completedRequests.get(jti)?.delete(requestId);
    }
  }

  async reset(jti?: string): Promise<void> {
    if (jti !== undefined) {
      this.counts.delete(jti);
      this.completedRequests.delete(jti);
      return;
    }
    this.counts.clear();
    this.completedRequests.clear();
  }
}
