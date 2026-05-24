/**
 * Micro-benchmarks for README / docs/benchmarks.md
 * Run: pnpm benchmark (after pnpm build)
 */
import { performance } from "node:perf_hooks";
import { grantCapability, validateCapability } from "@acr/capability-token";
import { compilePolicy, evaluatePolicyAst } from "@acr/policy-engine";
import { AgentCapabilityRuntime } from "@acr/runtime";

const SECRET = "benchmark-signing-secret-min-32-characters!!";
const ITERATIONS = 500;

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function bench(name: string, fn: () => Promise<void> | void): Promise<number> {
  // warmup
  for (let i = 0; i < 20; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  const ms = median(samples);
  console.log(`${name.padEnd(28)} ${ms.toFixed(3)} ms (p50, n=${ITERATIONS})`);
  return ms;
}

async function main() {
  console.log("\nACR micro-benchmarks (local, single process)\n");

  const { token } = await grantCapability(
    {
      agentId: "bench_agent",
      tool: "gmail.send",
      constraints: { allowedDomains: ["company.com"], maxActions: 10_000 },
    },
    { secret: SECRET },
  );

  const doc = compilePolicy("gmail.send", {
    allowedDomains: ["company.com"],
    maxActions: 10_000,
  });

  const runtime = new AgentCapabilityRuntime({
    secret: SECRET,
    adapters: { mode: "stub" },
  });

  const results: Record<string, number> = {};

  results.grant = await bench("JWT grant", async () => {
    await grantCapability(
      {
        agentId: "bench_agent",
        tool: "gmail.send",
        constraints: { allowedDomains: ["company.com"] },
      },
      { secret: SECRET },
    );
  });

  results.validate = await bench("JWT validate", async () => {
    await validateCapability(token, { secret: SECRET, expectedTool: "gmail.send" });
  });

  results.policy = await bench("Policy evaluate", async () => {
    evaluatePolicyAst(doc, {
      tool: "gmail.send",
      payload: { to: "u@company.com", subject: "Hi" },
      actionCount: 1,
    });
  });

  results.revokeCheck = await bench("Revoke lookup", async () => {
    await runtime.isRevoked("cap_nonexistent");
  });

  results.executeAllow = await bench("Runtime execute ALLOW", async () => {
    await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "u@company.com", subject: "Hi", body: "x" },
    });
  });

  results.executeDeny = await bench("Runtime execute DENY", async () => {
    await runtime.execute({
      token,
      tool: "gmail.send",
      payload: { to: "u@gmail.com", subject: "Hi", body: "x" },
    });
  });

  console.log("\nCopy to docs/benchmarks.md table (approximate, hardware-dependent).\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
