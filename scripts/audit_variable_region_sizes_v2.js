#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_MAX_REGION_SIZE,
  DEFAULT_MIN_REGION_SIZE,
  VARIABLE_REQUIRED_CANONICAL_TARGET,
  buildVariableRegionFeasibilityManifest,
} from "./generator-v2/variable-feasibility.js";

function readOption(name, fallback) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return String(fallback);
}

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(readOption(name, fallback), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

const minRegionSize = readPositiveInteger("min", DEFAULT_MIN_REGION_SIZE);
const maxRegionSize = readPositiveInteger("max", DEFAULT_MAX_REGION_SIZE);
const requiredCanonicalTarget = readPositiveInteger(
  "target",
  VARIABLE_REQUIRED_CANONICAL_TARGET
);
const output = resolve(
  process.cwd(),
  readOption("output", "generated/stage-bank-variable-feasibility-v2.json")
);
const stdoutOnly = process.argv.includes("--stdout");

const manifest = buildVariableRegionFeasibilityManifest({
  minRegionSize,
  maxRegionSize,
  requiredCanonicalTarget,
});
if (!manifest.targetFeasible) {
  throw new Error(manifest.conclusion);
}
const body = `${JSON.stringify(manifest, null, 2)}\n`;
if (stdoutOnly) {
  process.stdout.write(body);
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, body, "utf8");
  console.error(
    `wrote ${output} (${manifest.canonicalStageCount} stages, partitions=${manifest.connectedPartitionCountVisited}, patterns=${manifest.patternsVisited})`
  );
}
