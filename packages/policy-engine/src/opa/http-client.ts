import { parseOpaHttpResponse } from "./parse.js";
import { toOpaRequestBody } from "./input.js";
import type { OpaBackendConfig, OpaDecision, OpaEvaluationInput } from "./types.js";

export type FetchFn = typeof fetch;

export async function queryOpaHttp(
  input: OpaEvaluationInput,
  config: Required<Pick<OpaBackendConfig, "url" | "decisionPath">> &
    Pick<OpaBackendConfig, "timeoutMs" | "headers">,
  fetchFn: FetchFn = fetch,
): Promise<OpaDecision | null> {
  const base = config.url.replace(/\/$/, "");
  const path = config.decisionPath.replace(/^\//, "");
  const url = `${base}/v1/data/${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 3000,
  );

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(toOpaRequestBody(input)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OPA HTTP ${response.status}: ${text || response.statusText}`);
    }

    const body = (await response.json()) as unknown;
    return parseOpaHttpResponse(body, config.decisionPath);
  } finally {
    clearTimeout(timeout);
  }
}
