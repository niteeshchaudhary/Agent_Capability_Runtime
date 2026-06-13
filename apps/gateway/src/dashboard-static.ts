import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve built dashboard assets (Vite `dist/`). */
export function resolveDashboardRoot(): string | null {
  const candidates = [
    join(__dirname, "../../dashboard/dist"),
    join(process.cwd(), "apps/dashboard/dist"),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, "index.html"))) {
      return root;
    }
  }
  return null;
}

/** Mount `/dashboard/*` static UI when the build output exists. */
export function mountDashboard(app: Hono, enabled = true): boolean {
  if (!enabled) return false;
  const root = resolveDashboardRoot();
  if (!root) return false;

  app.get("/dashboard", (c) => c.redirect("/dashboard/"));
  app.use(
    "/dashboard/*",
    serveStatic({
      root,
      rewriteRequestPath: (path) => path.replace(/^\/dashboard/, "") || "/",
    }),
  );
  return true;
}
