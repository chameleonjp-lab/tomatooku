#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildStageBankFeasibilityManifest } from "./generator-v2/feasibility.js";

function readOption(name, fallback) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const output = resolve(
  process.cwd(),
  readOption("output", "generated/stage-bank-feasibility-v2.json")
);
const stdoutOnly = process.argv.includes("--stdout");
const manifest = buildStageBankFeasibilityManifest();
const body = `${JSON.stringify(manifest, null, 2)}\n`;

if (stdoutOnly) {
  process.stdout.write(body);
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, body, "utf8");
  console.error(
    `wrote ${output}: partitions=${manifest.connectedPartitionCount}, unique=${manifest.uniqueSolutionCount}, canonical=${manifest.maximumCanonicalStageCount}, targetFeasible=${manifest.targetFeasible}`
  );
}
