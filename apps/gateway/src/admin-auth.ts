import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

export interface AdminAuthConfig {
  /** When non-empty, grant/delegate require `Authorization: Bearer <key>` */
  apiKeys: string[];
}

function secureEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidAdminKey(provided: string, configured: string[]): boolean {
  return configured.some((key) => secureEqual(provided, key));
}

export function parseAdminApiKeysFromEnv(): string[] {
  const multi = process.env.ACR_ADMIN_API_KEYS?.trim();
  if (multi) {
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }
  const single = process.env.ACR_ADMIN_API_KEY?.trim();
  return single ? [single] : [];
}

/** Hono middleware — no-op when `apiKeys` is empty (dev mode). */
export function requireAdminAuth(config: AdminAuthConfig) {
  return async (c: Context, next: Next) => {
    if (config.apiKeys.length === 0) {
      await next();
      return;
    }

    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json(
        { error: "unauthorized", message: "Missing Authorization: Bearer <admin_api_key>" },
        401,
      );
    }

    const provided = header.slice("Bearer ".length).trim();
    if (!provided || !isValidAdminKey(provided, config.apiKeys)) {
      return c.json({ error: "unauthorized", message: "Invalid admin API key" }, 401);
    }

    await next();
  };
}
