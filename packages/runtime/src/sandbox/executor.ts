import type { ConstraintSet, ToolId } from "@acr/capability-token";
import type { ExecutionContext, ToolAdapter } from "@acr/adapters";
import { assertSafeHttpUrl } from "./network.js";
import type { ResolvedSandboxConfig } from "./types.js";
import { SandboxViolation } from "./types.js";

function assertToolPermitted(tool: ToolId, sandbox: ResolvedSandboxConfig): void {
  if (!sandbox.allowedTools?.length) return;
  if (!sandbox.allowedTools.includes(tool)) {
    throw new SandboxViolation(
      "tool_not_permitted",
      `tool not permitted in sandbox: ${tool}`,
    );
  }
}

function validateBeforeExecute(
  tool: ToolId,
  payload: Record<string, unknown>,
  sandbox: ResolvedSandboxConfig,
): void {
  assertToolPermitted(tool, sandbox);

  if (tool === "http.request" && sandbox.blockPrivateNetworks) {
    const url = payload.url;
    if (typeof url === "string" && url.length > 0) {
      assertSafeHttpUrl(url, true);
    }
  }
}

function responseByteSize(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function assertHttpResponseSize(
  tool: ToolId,
  result: unknown,
  maxBytes: number,
): void {
  if (tool !== "http.request") return;
  const body =
    result !== null && typeof result === "object" && "body" in result
      ? (result as { body?: unknown }).body
      : result;
  const size = responseByteSize(body);
  if (size > maxBytes) {
    throw new SandboxViolation(
      "response_too_large",
      `HTTP response body exceeds sandbox limit (${size} > ${maxBytes} bytes)`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new SandboxViolation(
          "timeout",
          `adapter execution exceeded ${timeoutMs}ms sandbox limit`,
        ),
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface SandboxedExecuteInput {
  adapter: ToolAdapter;
  tool: ToolId;
  payload: Record<string, unknown>;
  execCtx: ExecutionContext;
  constraints: ConstraintSet;
  sandbox: ResolvedSandboxConfig;
}

/**
 * Run an adapter inside v1 sandbox limits (timeout, network guard, response cap).
 * Policy still evaluates domains/URLs/methods first; sandbox adds defense-in-depth.
 */
export async function executeInSandbox(input: SandboxedExecuteInput): Promise<unknown> {
  const { adapter, tool, payload, execCtx, sandbox } = input;

  if (!sandbox.enabled) {
    return invokeAdapter(adapter, execCtx, payload);
  }

  validateBeforeExecute(tool, payload, sandbox);

  const result = await withTimeout(
    invokeAdapter(adapter, execCtx, payload),
    sandbox.executionTimeoutMs,
  );

  assertHttpResponseSize(tool, result, sandbox.maxHttpResponseBytes);
  return result;
}

async function invokeAdapter(
  adapter: ToolAdapter,
  execCtx: ExecutionContext,
  payload: Record<string, unknown>,
): Promise<unknown> {
  if (adapter.executeWithContext !== undefined) {
    return adapter.executeWithContext(execCtx);
  }
  return adapter.execute(payload);
}
