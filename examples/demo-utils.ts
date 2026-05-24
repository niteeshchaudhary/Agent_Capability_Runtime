import { createInterface } from "node:readline";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export const colors = {
  title: (s: string) => `${CYAN}${BOLD}${s}${RESET}`,
  ok: (s: string) => `${GREEN}${s}${RESET}`,
  deny: (s: string) => `${RED}${s}${RESET}`,
  warn: (s: string) => `${YELLOW}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  bold: (s: string) => `${BOLD}${s}${RESET}`,
};

export function banner(): void {
  console.log("");
  console.log(colors.title("  ╔══════════════════════════════════════════════════════════╗"));
  console.log(colors.title("  ║     Agent Capability Runtime (ACR) — Live Demo           ║"));
  console.log(colors.title("  ╚══════════════════════════════════════════════════════════╝"));
  console.log("");
}

export function section(step: number, title: string, subtitle?: string): void {
  console.log("");
  console.log(colors.bold(`── Step ${step}: ${title} ──`));
  if (subtitle) console.log(colors.dim(`   ${subtitle}`));
  console.log("");
}

export function logDecision(
  label: string,
  outcome: {
    ok: boolean;
    decision?: string;
    reason?: string;
    result?: unknown;
    approvalId?: string;
    evaluatedConditions?: unknown;
  },
): void {
  const decision = outcome.decision ?? (outcome.ok ? "ALLOW" : "DENY");

  if (decision === "SIMULATE") {
    console.log(colors.warn(`   ◆ ${label}: SIMULATE (no side effects)`));
    if (outcome.reason) console.log(colors.dim(`     ${outcome.reason}`));
    if (outcome.evaluatedConditions) {
      console.log(colors.dim(`     conditions: ${JSON.stringify(outcome.evaluatedConditions)}`));
    }
    return;
  }

  if (outcome.ok) {
    console.log(colors.ok(`   ✓ ${label}: ALLOW`));
    if (outcome.result !== undefined) {
      console.log(colors.dim(`     ${JSON.stringify(outcome.result)}`));
    }
    return;
  }

  if (decision === "REQUIRE_APPROVAL") {
    console.log(colors.warn(`   ⏸ ${label}: REQUIRE_APPROVAL`));
    if (outcome.reason) console.log(colors.dim(`     ${outcome.reason}`));
    if (outcome.approvalId) console.log(colors.dim(`     approvalId: ${outcome.approvalId}`));
    return;
  }
  console.log(colors.deny(`   ✗ ${label}: DENY`));
  if (outcome.reason) console.log(colors.dim(`     ${outcome.reason}`));
}

export function logJson(label: string, value: unknown): void {
  console.log(colors.dim(`   ${label}:`));
  console.log(
    colors.dim(
      JSON.stringify(value, null, 2)
        .split("\n")
        .map((line) => `     ${line}`)
        .join("\n"),
    ),
  );
}

export async function pause(message = "Press Enter to continue…"): Promise<void> {
  if (process.env.DEMO_AUTO === "1" || process.argv.includes("--auto")) {
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(colors.dim(`\n   ${message} `), () => {
      rl.close();
      resolve();
    });
  });
}

export function truncateToken(token: string, len = 48): string {
  return token.length <= len ? token : `${token.slice(0, len)}…`;
}
