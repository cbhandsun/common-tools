#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const REQUIRED_ADRS = Object.freeze([
  "0001-local-runtime-baseline.md",
  "0002-local-job-storage.md",
  "0003-mcp-protocol-compatibility.md",
  "0004-team-job-persistence.md",
  "0005-artifact-and-archive-security.md",
  "0006-worker-isolation.md",
  "0007-version-distribution-and-release-provenance.md",
  "0008-editable-pptx-generation-engine.md",
  "0009-plugin-and-mcp-contract-boundary.md",
  "0010-ppt-create-shared-generation-architecture.md"
]);

function assertAdrDocuments(directory, { readFile = fs.readFileSync, readDirectory = fs.readdirSync } = {}) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new TypeError("ADR directory is invalid");
  const files = readDirectory(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && /^\d{4}-[a-z0-9-]+\.md$/.test(entry.name)).map((entry) => entry.name).sort();
  if (JSON.stringify(files) !== JSON.stringify(REQUIRED_ADRS)) throw new Error("ADR files are incomplete");
  for (const file of files) {
    const content = readFile(path.join(directory, file), "utf8");
    if (typeof content !== "string" || content.length > 64 * 1024 || !new RegExp(`^# ADR ${file.slice(0, 4)}: .+\n`, "m").test(content) || !/^## Decision\n[\s\S]*\S/m.test(content) || !/^## Consequences\n[\s\S]*\S/m.test(content)) throw new Error(`ADR is invalid: ${file}`);
  }
  return Object.freeze({ count: files.length, files: Object.freeze(files) });
}

function verifyAdrs(root = REPOSITORY_ROOT) {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("ADR repository root is invalid");
  const directory = path.join(root, "docs", "adr");
  const result = assertAdrDocuments(directory);
  const index = fs.readFileSync(path.join(directory, "README.md"), "utf8");
  if (typeof index !== "string" || result.files.some((file) => !index.includes(`](${file})`))) throw new Error("ADR index is incomplete");
  return result;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyAdrs())}\n`);

module.exports = { REQUIRED_ADRS, assertAdrDocuments, verifyAdrs };
