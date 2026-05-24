import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedAuditChainConfig } from "./audit-chain-config.js";
import { AuditLog } from "./audit-log.js";
import { verifyAuditChain, type AuditChainVerification } from "./hash-chain.js";
import { type AuditQuery, type AuditStore } from "./store.js";
import type { AuditEvent, RecordAuditInput } from "./types.js";

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadEventsFromFile(filePath: string): AuditEvent[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const events: AuditEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as AuditEvent);
    } catch {
      // skip corrupt lines
    }
  }
  return events;
}

/**
 * Append-only JSONL audit log that survives process restarts.
 */
export class FileAuditLog implements AuditStore {
  private readonly memory: AuditLog;
  private readonly filePath: string;
  private readonly chain?: ResolvedAuditChainConfig;

  constructor(filePath: string, chain?: ResolvedAuditChainConfig) {
    this.filePath = filePath;
    this.chain = chain?.enabled ? chain : undefined;
    this.memory = new AuditLog(chain);
    this.memory.importEvents(loadEventsFromFile(filePath));
  }

  record(input: RecordAuditInput): AuditEvent {
    const event = this.memory.record(input);
    ensureParentDir(this.filePath);
    appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  getById(id: string): AuditEvent | undefined {
    return this.memory.getById(id);
  }

  list(query?: AuditQuery): AuditEvent[] {
    return this.memory.list(query);
  }

  verifyChain(): AuditChainVerification {
    if (!this.chain) {
      return { enabled: false, valid: true, eventCount: this.memory.list().length, errors: [] };
    }
    return verifyAuditChain(this.memory.list(), this.chain);
  }
}
