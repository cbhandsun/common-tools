#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { npmInvocation } = require("./verify-runtime-package");

const MAX_PACKAGE_BYTES = 1024 * 1024;
const INCLUDED_DIRECTORIES = Object.freeze([
  "packages/capability-contracts",
  "packages/capability-manifests",
  "packages/capability-runtime",
  "packages/project-audit-core",
  "packages/project-audit-runtime"
]);
const FORBIDDEN_MARKERS = Object.freeze(["packages/slideclone", "skills/", "paddleocr", "openxmldeckbuilder", "docker", "packages/ppt-quality", "packages/ppt-improve", "packages/remote-mcp"]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`${label} is invalid`);
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} is invalid`);
  return value;
}
function packageManifest() {
  return Object.freeze({
    name: "@common-tools/project-audit-runtime",
    version: "0.1.0",
    private: true,
    description: "Lightweight local-only Common Tools project audit runtime.",
    type: "commonjs",
    bin: Object.freeze({ "common-tools-audit": "packages/project-audit-runtime/bin/common-tools-audit.js" }),
    files: Object.freeze(["packages/"]),
    engines: Object.freeze({ node: ">=18" })
  });
}
function createStage(repositoryRoot, stageRoot) {
  normalDirectory(repositoryRoot, "repository root");
  normalDirectory(stageRoot, "stage root");
  for (const relative of INCLUDED_DIRECTORIES) {
    const source = path.join(repositoryRoot, relative);
    const stat = fs.lstatSync(source);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("project audit package source is invalid");
    fs.cpSync(source, path.join(stageRoot, relative), { recursive: true, errorOnExist: true, force: false });
  }
  fs.writeFileSync(path.join(stageRoot, "package.json"), `${JSON.stringify(packageManifest(), null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
function parsePackResult(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("project audit npm pack output is invalid"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !plainObject(parsed[0]) || typeof parsed[0].filename !== "string" || !/^[a-zA-Z0-9._-]+\.tgz$/.test(parsed[0].filename) || !Number.isSafeInteger(parsed[0].size) || parsed[0].size < 1 || parsed[0].size > MAX_PACKAGE_BYTES || !Array.isArray(parsed[0].files)) throw new Error("project audit npm package metadata is invalid");
  const files = parsed[0].files.map((entry) => plainObject(entry) && typeof entry.path === "string" ? entry.path.replace(/\\/g, "/").toLowerCase() : "");
  if (files.some((file) => !file || file.includes("../") || FORBIDDEN_MARKERS.some((marker) => file.includes(marker)))) throw new Error("project audit npm package contains a forbidden file");
  for (const required of ["package.json", "packages/project-audit-runtime/bin/common-tools-audit.js", "packages/project-audit-core/index.js", "packages/capability-runtime/index.js", "packages/capability-contracts/index.js"]) if (!files.includes(required)) throw new Error("project audit npm package is incomplete");
  return Object.freeze({ filename: parsed[0].filename, size: parsed[0].size, files: Object.freeze(files) });
}
function run(commandRunner, command, argumentsList, cwd, message) {
  const result = commandRunner(command, argumentsList, { cwd, encoding: "utf8", windowsHide: true, shell: false, timeout: 5 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  if (!result || result.error || result.status !== 0 || typeof result.stdout !== "string") throw new Error(message);
  return result.stdout;
}
function buildProjectAuditRuntimePackage({ repositoryRoot = path.resolve(__dirname, ".."), outputDirectory, commandRunner = childProcess.spawnSync, temporaryDirectory = fs.mkdtempSync } = {}) {
  const root = normalDirectory(path.resolve(repositoryRoot), "repository root");
  const output = normalDirectory(path.resolve(outputDirectory || path.join(root, "dist", "project-audit-runtime")), "output directory");
  const temporaryRoot = temporaryDirectory(path.join(os.tmpdir(), "common-tools-project-audit-package-"));
  let cleanable = false;
  try {
    normalDirectory(temporaryRoot, "temporary root");
    cleanable = true;
    const stage = path.join(temporaryRoot, "stage");
    const packedOutput = path.join(temporaryRoot, "packed");
    const installRoot = path.join(temporaryRoot, "install");
    fs.mkdirSync(stage, { mode: 0o700 });
    fs.mkdirSync(packedOutput, { mode: 0o700 });
    fs.mkdirSync(installRoot, { mode: 0o700 });
    createStage(root, stage);
    const pack = npmInvocation(["pack", "--json", "--pack-destination", packedOutput]);
    const metadata = parsePackResult(run(commandRunner, pack.command, pack.arguments, stage, "project audit runtime pack failed"));
    const sourceArchive = path.join(packedOutput, metadata.filename);
    const destinationArchive = path.join(output, metadata.filename);
    fs.copyFileSync(sourceArchive, destinationArchive, fs.constants.COPYFILE_EXCL);
    const install = npmInvocation(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, destinationArchive]);
    run(commandRunner, install.command, install.arguments, root, "project audit runtime installation failed");
    const cli = path.join(installRoot, "node_modules", "@common-tools", "project-audit-runtime", "packages", "project-audit-runtime", "bin", "common-tools-audit.js");
    const doctor = JSON.parse(run(commandRunner, process.execPath, [cli, "doctor", "--workspace", root], installRoot, "installed project audit runtime doctor failed"));
    if (doctor?.healthy !== true || doctor?.runtime !== "project-audit-local" || !Array.isArray(doctor.excludedHeavyComponents)) throw new Error("installed project audit runtime doctor is invalid");
    return Object.freeze({ archive: destinationArchive, packedBytes: metadata.size, fileCount: metadata.files.length, heavyComponentsExcluded: true });
  } finally {
    if (cleanable) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length > 2 || argv.some((value) => typeof value !== "string" || value.length > 4096)) throw new Error("package arguments are invalid");
  if (argv.length === 0) return {};
  if (argv.length !== 2 || argv[0] !== "--out" || !argv[1].trim()) throw new Error("usage: build-project-audit-runtime-package --out <existing-directory>");
  return { outputDirectory: path.resolve(argv[1]) };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildProjectAuditRuntimePackage(parseArguments(process.argv.slice(2))))}\n`);

module.exports = { FORBIDDEN_MARKERS, INCLUDED_DIRECTORIES, MAX_PACKAGE_BYTES, buildProjectAuditRuntimePackage, createStage, packageManifest, parseArguments, parsePackResult };
