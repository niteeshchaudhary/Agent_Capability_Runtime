import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  InMemoryApprovalStore,
  type ApprovalQuery,
  type ApprovalRequest,
  type ApprovalStore,
  type CreateApprovalInput,
} from "./approval-store.js";

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadFromFile(filePath: string): ApprovalRequest[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as ApprovalRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(filePath: string, requests: ApprovalRequest[]): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, JSON.stringify(requests, null, 2), "utf8");
}

/**
 * JSON file-backed approval store for pending human-in-the-loop workflows.
 */
export class FileApprovalStore implements ApprovalStore {
  private readonly memory: InMemoryApprovalStore;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.memory = new InMemoryApprovalStore();
    this.memory.importRequests(loadFromFile(filePath));
  }

  private sync(): void {
    persist(this.filePath, this.memory.list());
  }

  create(input: CreateApprovalInput): ApprovalRequest {
    const request = this.memory.create(input);
    this.sync();
    return request;
  }

  getById(id: string): ApprovalRequest | undefined {
    return this.memory.getById(id);
  }

  list(query?: ApprovalQuery): ApprovalRequest[] {
    return this.memory.list(query);
  }

  approve(id: string, resolvedBy?: string): ApprovalRequest {
    const request = this.memory.approve(id, resolvedBy);
    this.sync();
    return request;
  }

  reject(id: string, resolvedBy?: string): ApprovalRequest {
    const request = this.memory.reject(id, resolvedBy);
    this.sync();
    return request;
  }
}
