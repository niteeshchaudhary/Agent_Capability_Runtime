/** In-memory action counter keyed by capability token jti (v1) */
export class ActionCounter {
  private readonly counts = new Map<string, number>();

  get(jti: string): number {
    return this.counts.get(jti) ?? 0;
  }

  increment(jti: string): number {
    const next = this.get(jti) + 1;
    this.counts.set(jti, next);
    return next;
  }

  reset(jti?: string): void {
    if (jti !== undefined) {
      this.counts.delete(jti);
      return;
    }
    this.counts.clear();
  }
}
