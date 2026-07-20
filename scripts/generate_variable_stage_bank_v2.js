#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVariableStageFinalBank,
  sha256Hex,
} from "./generator-v2/variable-final-bank.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidatePoolPath = resolve(
  ROOT,
  "generated/variable-stage-candidate-pool-v2.json"
);
const reviewPath = resolve(
  ROOT,
  "review/decisions/variable-stage-review-round1.json"
);
const outputPath = resolve(
  ROOT,
  process.argv[2] || "generated/variable-stage-bank-v2.json"
);

const candidatePoolSource = readFileSync(candidatePoolPath);
const reviewSource = readFileSync(reviewPath);
const bank = buildVariableStageFinalBank({
  candidatePool: JSON.parse(candidatePoolSource.toString("utf8")),
  review: JSON.parse(reviewSource.toString("utf8")),
  candidatePoolSha256: sha256Hex(candidatePoolSource),
  reviewSha256: sha256Hex(reviewSource),
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
console.log(
  `wrote ${outputPath}: stages=${bank.stageCount}, ` +
    `distance1Pairs=${bank.distanceOnePairCount}, ` +
    `status=${bank.status}`
);
