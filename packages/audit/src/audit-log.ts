import type { ResolvedAuditChainConfig } from "./audit-chain-config.js";
import { buildAuditEvent } from "./build-event.js";
import {
  computeEventHash,
  restoreChainTip,
  signEventHash,
  verifyAuditChain,
  type AuditChainVerification,
} from "./hash-chain.js";
import type { AuditEvent, RecordAuditInput } from "./types.js";
import { matchesAuditQuery, sortAuditEvents, type AuditQuery, type AuditStore } from "./store.js";

export class AuditLog implements AuditStore {
  private readonly events = new Map<string, AuditEvent>();
  private readonly chain?: ResolvedAuditChainConfig;
  private tipHash: string;
  private sequence: number;

  constructor(chain?: ResolvedAuditChainConfig) {
    this.chain = chain?.enabled ? chain : undefined;
    this.tipHash = chain?.genesisHash ?? "0000000000000000000000000000000000000000000000000000000000000000";
    this.sequence = 0;
  }

  /** Restore events from persistent storage (does not re-summarize payloads). */
  importEvents(events: AuditEvent[]): void {
    for (const event of events) {
      this.events.set(event.id, event);
    }
    if (this.chain) {
      const tip = restoreChainTip(events);
      this.tipHash = tip.tipHash;
      this.sequence = tip.sequence;
    }
  }

  record(input: RecordAuditInput): AuditEvent {
    let event = buildAuditEvent(input);

    if (this.chain) {
      const seq = this.sequence + 1;
      const hashPrev = this.tipHash;
      const hash = computeEventHash(hashPrev, event, seq);
      const signature = this.chain.signingSecret
        ? signEventHash(hash, this.chain.signingSecret)
        : undefined;

      event = {
        ...event,
        sequence: seq,
        hashPrev,
        hash,
        ...(signature !== undefined ? { signature } : {}),
      };

      this.sequence = seq;
      this.tipHash = hash;
    }

    this.events.set(event.id, event);
    return event;
  }

  getById(id: string): AuditEvent | undefined {
    return this.events.get(id);
  }

  list(query?: AuditQuery): AuditEvent[] {
    const filtered = [...this.events.values()].filter((event) =>
      matchesAuditQuery(event, query),
    );
    const sorted = sortAuditEvents(filtered);
    if (query?.limit !== undefined && query.limit >= 0) {
      return sorted.slice(-query.limit);
    }
    return sorted;
  }

  verifyChain(): AuditChainVerification {
    if (!this.chain) {
      return { enabled: false, valid: true, eventCount: this.events.size, errors: [] };
    }
    return verifyAuditChain(sortAuditEvents([...this.events.values()]), this.chain);
  }

  clear(): void {
    this.events.clear();
    this.sequence = 0;
    this.tipHash =
      this.chain?.genesisHash ??
      "0000000000000000000000000000000000000000000000000000000000000000";
  }
}
