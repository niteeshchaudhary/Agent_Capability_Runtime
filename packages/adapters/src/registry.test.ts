import { describe, expect, it } from "vitest";
import { createAdapterRegistry } from "./registry.js";

describe("createAdapterRegistry", () => {
  it("uses stub adapters when mode is stub", () => {
    const registry = createAdapterRegistry({ mode: "stub" });
    expect(registry.list()).toEqual(["gmail.send", "slack.send", "http.request"]);
    expect(registry.config.mode).toBe("stub");
  });

  it("selects live gmail when credentials provided", () => {
    const registry = createAdapterRegistry({
      mode: "live",
      gmail: { accessToken: "token" },
    });
    expect(registry.config.mode).toBe("live");
    expect(registry.get("gmail.send").tool).toBe("gmail.send");
  });
});
