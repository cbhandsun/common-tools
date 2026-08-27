#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;
const REQUIRED_FILES = Object.freeze([
  ".agents/plugins/marketplace.json",
  "package.json",
  "packages/cli/bin/common-tools.js",
  "packages/mcp-server/core.js",
  "scripts/generate-sbom.js",
  "scripts/release-evidence.js",
  "scripts/generate-image-ocr-release-input.js",
  "scripts/generate-remote-plugin-bundles.js",
  "scripts/common-tools-docker-engine.ps1",
  "scripts/team-runtime-compose-smoke.ps1",
  "scripts/team-runtime-local-deploy.ps1",
  "scripts/team-keycloak-mcp-client-sync.ps1",
  "scripts/team-keycloak-recovery-admin.ps1",
  "scripts/team-runtime-production-deploy.ps1",
  "scripts/team-runtime-operation-lock.ps1",
  "scripts/team-runtime-postgres-restore-drill.ps1",
  "scripts/team-runtime-object-store-restore-drill.ps1",
  "scripts/team-postgres-volume-backup.ps1",
  "scripts/team-keycloak-volume-backup.ps1",
  "scripts/team-keycloak-volume-restore-drill.ps1",
  "scripts/team-keycloak-persistence-migrate.ps1",
  "scripts/team-minio-volume-backup.ps1",
  "scripts/team-runtime-local-fresh-reset.ps1",
  "scripts/team-runtime-doctor.js",
  "skills/pd-hifi-slideclone/scripts/slideclone.js",
  "skills/pd-hifi-slideclone/schemas/slideclone.config.schema.json",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj"
]);
const FORBIDDEN_PREFIXES = Object.freeze([
  ".codex-tmp/",
  "node_modules/",
  "runs/",
  "test/",
  "skills/pd-hifi-slideclone/examples/",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/bin/",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/obj/"
]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function normalFile(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.includes("../")) throw new Error(`${label} is invalid`);
  return value;
}

function parsePackMetadata(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("npm pack returned invalid metadata"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !plainObject(parsed[0])) throw new Error("npm pack returned invalid metadata");
  const metadata = parsed[0];
  const filename = normalFile(metadata.filename, "package filename");
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_PACKAGE_BYTES) throw new Error("runtime package size is invalid");
  if (!Array.isArray(metadata.files) || metadata.files.length === 0 || metadata.files.length > 5000) throw new Error("runtime package file list is invalid");
  const files = metadata.files.map((entry) => {
    if (!plainObject(entry) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error("runtime package file list is invalid");
    return normalFile(entry.path, "runtime package file");
  });
  if (new Set(files).size !== files.length) throw new Error("runtime package file list is invalid");
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error("runtime package is missing a required file");
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (files.some((file) => file.startsWith(prefix))) throw new Error("runtime package includes a forbidden file");
  }
  return Object.freeze({ filename, size: metadata.size, files: Object.freeze(files) });
}

function normalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`${label} is invalid`);
  const details = fs.statSync(value);
  if (!details.isDirectory()) throw new Error(`${label} is invalid`);
  return value;
}

function run(commandRunner, command, argumentsList, cwd, failureMessage) {
  const result = commandRunner(command, argumentsList, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 5 * 60 * 1000,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES
  });
  if (!result || result.error || result.status !== 0 || typeof result.stdout !== "string") throw new Error(failureMessage);
  return result.stdout;
}

function npmCliPath() {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  let details;
  try { details = fs.lstatSync(candidate); } catch { throw new Error("Node npm CLI is unavailable"); }
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Node npm CLI is unavailable");
  return candidate;
}

function npmInvocation(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.some((value) => typeof value !== "string")) throw new TypeError("npm invocation is invalid");
  return Object.freeze({ command: process.execPath, arguments: Object.freeze([npmCliPath(), ...argumentsList]) });
}

function installedCliPath(installRoot) {
  const executable = process.platform === "win32" ? "common-tools.cmd" : "common-tools";
  const target = path.join(installRoot, "node_modules", ".bin", executable);
  const details = fs.lstatSync(target);
  if (!details.isFile() && !details.isSymbolicLink()) throw new Error("installed runtime CLI shim is missing");
  return path.join(installRoot, "node_modules", "common-tools", "packages", "cli", "bin", "common-tools.js");
}

function verifyInstalledCli({ installRoot, commandRunner }) {
  const cli = installedCliPath(installRoot);
  const packageRoot = path.join(installRoot, "node_modules", "common-tools");
  const help = run(commandRunner, process.execPath, [cli, "help"], installRoot, "installed runtime CLI help check failed");
  if (!help.includes("usage: common-tools <command>")) throw new Error("installed runtime CLI help is invalid");
  const listed = run(commandRunner, process.execPath, [cli, "plugin", "list"], installRoot, "installed runtime plugin check failed");
  let catalog;
  try { catalog = JSON.parse(listed); } catch { throw new Error("installed runtime plugin output is invalid"); }
  if (!plainObject(catalog) || catalog.distributionVerified !== true || !Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) throw new Error("installed runtime plugin output is invalid");
  const probe = "const path=require('node:path');const root=path.resolve(process.argv[1]);const api=require(path.join(root,'packages','cli','slideclone-runner.js'));const result=api.inspectBundledSlideclone({repositoryRoot:root});if(!result.available)process.exit(2);process.stdout.write('ready');";
  const imageEngine = run(commandRunner, process.execPath, ["-e", probe, packageRoot], installRoot, "installed image-to-editable engine check failed");
  if (imageEngine !== "ready") throw new Error("installed image-to-editable engine check failed");
  return Object.freeze({ capabilityCount: catalog.capabilities.length, imageToEditableEngine: true });
}

function verifyRuntimePackage({ repositoryRoot = path.resolve(__dirname, ".."), commandRunner = childProcess.spawnSync, temporaryDirectory = fs.mkdtempSync } = {}) {
  if (typeof commandRunner !== "function" || typeof temporaryDirectory !== "function") throw new TypeError("runtime package verifier options are invalid");
  const root = normalDirectory(repositoryRoot, "repository root");
  const temporaryRoot = temporaryDirectory(path.join(os.tmpdir(), "common-tools-runtime-package-"));
  let cleanable = false;
  try {
    const temporaryDetails = fs.lstatSync(temporaryRoot);
    if (!temporaryDetails.isDirectory() || temporaryDetails.isSymbolicLink()) throw new Error("runtime package temporary directory is invalid");
    cleanable = true;
    const packInvocation = npmInvocation(["pack", "--json", "--pack-destination", temporaryRoot]);
    const packed = parsePackMetadata(run(commandRunner, packInvocation.command, packInvocation.arguments, root, "runtime package build failed"));
    const tarball = path.join(temporaryRoot, packed.filename);
    const tarballDetails = fs.lstatSync(tarball);
    if (!tarballDetails.isFile() || tarballDetails.isSymbolicLink() || tarballDetails.size !== packed.size) throw new Error("runtime package archive is invalid");
    const installRoot = path.join(temporaryRoot, "install");
    fs.mkdirSync(installRoot, { recursive: true, mode: 0o700 });
    const installInvocation = npmInvocation(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball]);
    run(commandRunner, installInvocation.command, installInvocation.arguments, root, "runtime package installation failed");
    const installed = verifyInstalledCli({ installRoot, commandRunner });
    return Object.freeze({ packedBytes: packed.size, fileCount: packed.files.length, capabilityCount: installed.capabilityCount, imageToEditableEngine: installed.imageToEditableEngine });
  } finally {
    if (cleanable) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

if (require.main === module) {
  const result = verifyRuntimePackage();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { FORBIDDEN_PREFIXES, MAX_PACKAGE_BYTES, REQUIRED_FILES, installedCliPath, npmCliPath, npmInvocation, parsePackMetadata, verifyInstalledCli, verifyRuntimePackage };
