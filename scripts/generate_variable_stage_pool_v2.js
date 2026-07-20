#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildVariableStageCandidatePool } from "./generator-v2/variable-pool.js";

function option(name, fallback) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

const rawTargetPerClass = positiveInteger("raw-per-class", 84);
const selectedTargetTotal = positiveInteger("selected-total", 108);
const minimumSelectedPerClass = positiveInteger("minimum-per-class", 17);
const maxPartitionsPerClass = positiveInteger("max-partitions-per-class", 1000000);
const output = resolve(
  process.cwd(),
  option("output", "generated/variable-stage-candidate-pool-v2.json")
);
const stdoutOnly = process.argv.includes("--stdout");

const manifest = buildVariableStageCandidatePool({
  rawTargetPerClass,
  selectedTargetTotal,
  minimumSelectedPerClass,
  maxPartitionsPerClass,
});
const body = `${JSON.stringify(manifest, null, 2)}\n`;

if (stdoutOnly) {
  process.stdout.write(body);
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, body, "utf8");
  console.error(
    `wrote ${output}: raw=${manifest.rawStageCount}, selected=${manifest.stageCount}, ` +
      `minDistance=${manifest.minimumPairDistance}`
  );
}
