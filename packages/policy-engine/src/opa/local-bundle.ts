import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseOpaDecision } from "./parse.js";
import { toOpaRequestBody } from "./input.js";
import type { OpaDecision, OpaEvaluationInput } from "./types.js";

function runOpaEval(
  bundlePath: string,
  inputJson: string,
  query: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "opa",
      ["eval", "-i", "-", "-d", bundlePath, query, "--format", "raw"],
      { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `opa eval exited ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.write(inputJson);
    child.stdin.end();
  });
}

/** Evaluate a local Rego bundle via the `opa` CLI (`opa eval`). */
export async function queryOpaLocalBundle(
  input: OpaEvaluationInput,
  bundlePath: string,
  decisionPath = "acr/decision",
): Promise<OpaDecision | null> {
  const query = `data.${decisionPath.replace(/\//g, ".")}`;
  const body = toOpaRequestBody(input);

  let tempDir: string | undefined;
  try {
    const inputJson = JSON.stringify(body);
    let raw: string;
    try {
      raw = await runOpaEval(bundlePath, inputJson, query);
    } catch {
      // Windows: opa eval -i - can be flaky — fall back to temp file.
      tempDir = await mkdtemp(join(tmpdir(), "acr-opa-"));
      const inputPath = join(tempDir, "input.json");
      await writeFile(inputPath, inputJson, "utf8");
      raw = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          "opa",
          ["eval", "-i", inputPath, "-d", bundlePath, query, "--format", "raw"],
          { shell: process.platform === "win32" },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => {
          stdout += c.toString();
        });
        child.stderr.on("data", (c: Buffer) => {
          stderr += c.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || `opa eval exited ${code}`));
            return;
          }
          resolve(stdout.trim());
        });
      });
    }

    if (!raw || raw === "undefined") {
      return null;
    }

    let parsed: unknown = raw;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      parsed = JSON.parse(raw);
    } else if (raw.startsWith('"')) {
      parsed = JSON.parse(raw);
    }
    return parseOpaDecision(parsed);
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function isOpaCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("opa", ["version"], { shell: process.platform === "win32" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Read bundle path from env for diagnostics (optional). */
export async function readBundleFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}
