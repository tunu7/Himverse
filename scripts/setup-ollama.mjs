#!/usr/bin/env node
// Prepares a local Ollama model for itinerary generation (ADR-0006).
//
// Ollama's OpenAI-compatible API ignores per-request context settings and
// silently truncates prompts to the server default (often 4k tokens, keeping
// only ~2k of the prompt). Itinerary prompts need more, so this pulls a base
// model and builds `himverse-planner` from it with a 16k context window.
// To switch models, re-run with another base; the app's env stays the same.
//
// Usage: npm run ai:ollama [-- <base-model>]   (default: gemma3:4b)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "gemma3:4b";
const target = "himverse-planner";
const contextTokens = 16_384;

if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(base)) {
  console.error(`Invalid model name: ${base}`);
  process.exit(1);
}

const run = (args) => execFileSync("ollama", args, { stdio: "inherit" });

try {
  execFileSync("ollama", ["--version"], { stdio: "ignore" });
} catch {
  console.error("Ollama is not installed or not running. See https://ollama.com/download");
  process.exit(1);
}

run(["pull", base]);

const dir = mkdtempSync(join(tmpdir(), "himverse-ollama-"));
try {
  const modelfile = join(dir, "Modelfile");
  writeFileSync(modelfile, `FROM ${base}\nPARAMETER num_ctx ${contextTokens}\n`);
  run(["create", target, "-f", modelfile]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nReady: ${target} (from ${base}, ${contextTokens}-token context).`);
console.log("Set AI_PROVIDER=ollama in .env.local and restart `npm run dev`.");
