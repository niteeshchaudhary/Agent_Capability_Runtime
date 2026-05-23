import type { ToolAdapter, HttpRequestResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export function createHttpAdapter(options?: { timeoutMs?: number }): ToolAdapter {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    tool: "http.request",

    async execute(payload: Record<string, unknown>): Promise<HttpRequestResult> {
      const url = String(payload.url ?? "");
      const method = String(payload.method ?? "GET").toUpperCase();

      if (!url) {
        throw new Error("http.request requires payload.url");
      }

      const headers: Record<string, string> = {};
      if (payload.headers && typeof payload.headers === "object") {
        for (const [key, value] of Object.entries(payload.headers as Record<string, unknown>)) {
          if (typeof value === "string") headers[key] = value;
        }
      }

      let body: string | undefined;
      if (payload.body !== undefined && method !== "GET" && method !== "HEAD") {
        body = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") ?? "";
        let responseBody: unknown;
        if (contentType.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        return {
          status: response.status,
          statusText: response.statusText,
          url,
          method,
          body: responseBody,
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`http.request timed out after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Default HTTP adapter (live fetch). */
export const httpAdapter = createHttpAdapter();
