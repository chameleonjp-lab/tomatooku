#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_ATTEMPTS_PER_BATCH_CALL,
  DEFAULT_MAX_BATCH_ROUNDS,
  DEFAULT_POOL_TARGET,
  DEFAULT_STAGE_BANK_SEED,
  DEFAULT_STAGE_BANK_TARGET,
  buildStageBankManifest,
  validateStageBankManifest,
} from "./generator-v2/bank.js";

function readOption(name, fallback) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(readOption(name, String(fallback)), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

const seed = readOption("seed", DEFAULT_STAGE_BANK_SEED);
const targetCount = readPositiveInteger("target", DEFAULT_STAGE_BANK_TARGET);
const poolTarget = readPositiveInteger("pool", DEFAULT_POOL_TARGET);
const maxRounds = readPositiveInteger("rounds", DEFAULT_MAX_BATCH_ROUNDS);
const attemptsPerCall = readPositiveInteger("attempts", DEFAULT_ATTEMPTS_PER_BATCH_CALL);
const output = resolve(
  process.cwd(),
  readOption("output", "generated/stage-bank-v2.json")
);
const stdoutOnly = process.argv.includes("--stdout");

const manifest = buildStageBankManifest(seed, {
  targetCount,
  poolTarget,
  maxRounds,
  attemptsPerCall,
});
const validation = validateStageBankManifest(manifest);
if (!validation.valid) {
  throw new Error(`generated stage bank is invalid: ${validation.problems.join("; ")}`);
}

const body = `${JSON.stringify(manifest, null, 2)}\n`;
if (stdoutOnly) {
  process.stdout.write(body);
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, body, "utf8");
  console.error(
    `wrote ${output} (${manifest.stageCount} stages, pool=${manifest.pool.actualSize}, distance>=${manifest.selection.minimumRegionDistance})`
  );
}
