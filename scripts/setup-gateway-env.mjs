#!/usr/bin/env node
/** Copy apps/gateway/.env.example → .env if missing (one-time local setup). */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = resolve(root, "apps/gateway/.env");
const example = resolve(root, "apps/gateway/.env.example");

if (existsSync(env)) {
  console.log("apps/gateway/.env already exists — nothing to do");
} else if (!existsSync(example)) {
  console.error("Missing apps/gateway/.env.example");
  process.exit(1);
} else {
  copyFileSync(example, env);
  console.log("Created apps/gateway/.env from .env.example");
}
