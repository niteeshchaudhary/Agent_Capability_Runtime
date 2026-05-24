import { SandboxViolation } from "./types.js";

function parseIpv4(host: string): number[] | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) return undefined;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return undefined;
  return nums;
}

function isPrivateIpv4(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  const a = octets[0]!;
  const b = octets[1]!;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".localhost")) return true;
  return false;
}

/**
 * SSRF guard for outbound HTTP — blocks loopback and private networks (v1).
 */
export function assertSafeHttpUrl(url: string, blockPrivateNetworks: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SandboxViolation("invalid_request", `invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SandboxViolation(
      "network_denied",
      `unsupported URL scheme: ${parsed.protocol}`,
    );
  }

  if (!blockPrivateNetworks) return;

  const host = parsed.hostname;
  if (isBlockedHostname(host)) {
    throw new SandboxViolation("network_denied", `blocked hostname: ${host}`);
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new SandboxViolation("network_denied", `blocked private network host: ${host}`);
  }
}
