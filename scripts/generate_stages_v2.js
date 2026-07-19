#!/usr/bin/env node
/**
 * 生成器v2 foundation manifestを書き出す。
 *
 * 現行のsrc/stages.jsは変更しない。後続sliceで領域生成・一意解検証・
 * 難易度分類を追加する前の、解配置と再現性契約だけを固定する。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_GENERATOR_SEED,
  buildSolutionPatternManifest,
} from "./generator-v2/core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = resolve(ROOT, "generated/solution-patterns-v2.json");

function parseArgs(argv) {
  let seed = DEFAULT_GENERATOR_SEED;
  let output = DEFAULT_OUTPUT;
  let stdout = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--stdout") {
      stdout = true;
      continue;
    }
    if (arg === "--seed") {
      if (index + 1 >= argv.length) throw new Error("--seed requires a value");
      seed = argv[++index];
      continue;
    }
    if (arg.startsWith("--seed=")) {
      seed = arg.slice("--seed=".length);
      continue;
    }
    if (arg === "--out") {
      if (index + 1 >= argv.length) throw new Error("--out requires a path");
      output = resolve(process.cwd(), argv[++index]);
      continue;
    }
    if (arg.startsWith("--out=")) {
      output = resolve(process.cwd(), arg.slice("--out=".length));
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return { seed, output, stdout };
}

function main() {
  const { seed, output, stdout } = parseArgs(process.argv.slice(2));
  const manifest = buildSolutionPatternManifest(seed);
  const body = `${JSON.stringify(manifest, null, 2)}\n`;

  if (stdout) {
    process.stdout.write(body);
  } else {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, body, "utf8");
    console.error(`wrote ${output}`);
  }

  console.error(
    `generator=${manifest.generatorVersion} seed=${manifest.normalizedSeed} ` +
      `patterns=${manifest.patternCount} symmetryClasses=${manifest.symmetryClassCount}`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
