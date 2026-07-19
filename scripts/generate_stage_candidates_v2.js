#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  DEFAULT_STAGE_CANDIDATE_SEED,
  buildStageCandidateProbeManifest,
} from "./generator-v2/regions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function parseArguments(argv) {
  const options = {
    seed: DEFAULT_STAGE_CANDIDATE_SEED,
    maxAttempts: DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
    output: "generated/stage-candidates-v2.json",
    stdout: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--seed") options.seed = argv[++index];
    else if (value === "--max-attempts") options.maxAttempts = Number(argv[++index]);
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--stdout") options.stdout = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const manifest = buildStageCandidateProbeManifest(options.seed, {
  maxAttemptsPerPattern: options.maxAttempts,
});
const json = `${JSON.stringify(manifest, null, 2)}\n`;

if (options.stdout) {
  process.stdout.write(json);
} else {
  const outputPath = resolve(ROOT, options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, json, "utf8");
  console.error(
    `wrote ${options.output}: success=${manifest.successCount} ` +
      `attemptLimit=${manifest.attemptLimitCount} uniqueStages=${manifest.uniqueStageCount}`
  );
}
