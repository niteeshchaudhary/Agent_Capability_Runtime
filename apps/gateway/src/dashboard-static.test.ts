import { describe, expect, it } from "vitest";
import { resolveDashboardRoot } from "./dashboard-static.js";

describe("dashboard static", () => {
  it("resolveDashboardRoot finds dist when built", () => {
    const root = resolveDashboardRoot();
    // Optional in dev before `pnpm --filter @acr/dashboard build`
    if (root) {
      expect(root).toContain("dashboard");
    } else {
      expect(root).toBeNull();
    }
  });
});
