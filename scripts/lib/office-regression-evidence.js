"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_PROBE_OUTPUT = 512;
const PROBE_ERROR_CODES = new Set(["ETIMEDOUT", "ENOENT", "EACCES", "EPERM", "EINVAL", "ENOBUFS", "EIO", "ENOMEM", "EMFILE", "ENFILE"]);
const PROBE_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGINT", "SIGHUP", "SIGPIPE", "SIGFPE"]);
const PROBE_LABELS = new Set(["PowerPoint", "LibreOffice", "pdftoppm", "dependency"]);

function collectOfficeRegressionEvidence(options = {}) {
  const commandRunner = options.commandRunner || spawnSync;
  const powerPointExecutable = requiredFile(options.powerPointExecutable, "PowerPoint executable");
  const libreOfficeExecutable = requiredFile(options.libreOfficeExecutable, "LibreOffice executable");
  const pdfToPpmExecutable = requiredFile(options.pdfToPpmExecutable, "pdftoppm executable");
  const corpusFile = requiredFile(options.corpusFile, "corpus manifest");
  const builderRoot = requiredDirectory(options.builderRoot, "OpenXML builder root");
  const components = Object.freeze({
    platform: boundedText(options.platform || process.platform, "platform"),
    architecture: boundedText(options.arch || process.arch, "architecture"),
    osRelease: boundedText(options.osRelease || os.release(), "OS release"),
    nodeVersion: boundedText(options.nodeVersion || process.version, "Node version"),
    powerPointVersion: options.powerPointVersion
      ? boundedText(options.powerPointVersion, "PowerPoint version")
      : probePowerPointVersion(powerPointExecutable, commandRunner),
    libreOfficeVersion: options.libreOfficeVersion
      ? boundedText(options.libreOfficeVersion, "LibreOffice version")
      : probeCommandVersion(libreOfficeExecutable, ["--version"], commandRunner, "LibreOffice"),
    pdfToPpmVersion: options.pdfToPpmVersion
      ? boundedText(options.pdfToPpmVersion, "pdftoppm version")
      : probeCommandVersion(pdfToPpmExecutable, ["-v"], commandRunner, "pdftoppm"),
    fontInventoryFingerprint: options.fontInventoryFingerprint
      ? sha256Digest(options.fontInventoryFingerprint, "font inventory fingerprint")
      : probeFontInventory(commandRunner),
    corpusManifestFingerprint: fingerprintFiles([corpusFile], path.dirname(corpusFile)),
    openXmlBuilderFingerprint: fingerprintFiles(listBuilderInputs(builderRoot), builderRoot)
  });
  return Object.freeze({
    provider: "office-regression-environment-v1",
    generatedAt: new Date().toISOString(),
    fingerprint: sha256(stableJson(components)),
    components
  });
}

function probePowerPointVersion(executable, commandRunner = spawnSync) {
  return runVersionProbe("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "[Diagnostics.FileVersionInfo]::GetVersionInfo($env:SLIDECLONE_POWERPNT_PROBE_PATH).ProductVersion"
  ], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    env: { ...process.env, SLIDECLONE_POWERPNT_PROBE_PATH: executable }
  }, commandRunner, "PowerPoint");
}

function probeCommandVersion(executable, args, commandRunner = spawnSync, label = "dependency") {
  return runVersionProbe(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000
  }, commandRunner, label);
}

function runVersionProbe(executable, args, options, commandRunner, label) {
  const startedAt = Date.now();
  let result;
  try { result = commandRunner(executable, args, options); }
  catch (error) { result = { error }; }
  return requireProbeOutput(result, label, Date.now() - startedAt);
}

function probeFontInventory(commandRunner = spawnSync) {
  const result = commandRunner("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
  ], { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result?.error || result?.status !== 0 || typeof result.stdout !== "string" || !result.stdout.trim()) {
    throw new Error("Windows font inventory preflight failed");
  }
  return sha256(result.stdout.replace(/\r\n/gu, "\n"));
}

function requireProbeOutput(result, label, elapsedMs) {
  const output = `${typeof result?.stdout === "string" ? result.stdout : ""}\n${typeof result?.stderr === "string" ? result.stderr : ""}`
    .replace(/./gsu, (character) => isControlCharacter(character) ? " " : character)
    .replace(/\s+/gu, " ")
    .trim();
  if (result?.error || result?.status !== 0 || !output) throw probeFailure(result, label, elapsedMs);
  return boundedText(output.slice(0, MAX_PROBE_OUTPUT), `${label} version`);
}

function probeFailure(result, label, elapsedMs) {
  const errorCode = result?.error ? (PROBE_ERROR_CODES.has(result.error.code) ? result.error.code : "unknown") : "none";
  const reason = !result || typeof result !== "object" ? "invalid-result"
    : result.error ? (errorCode === "ETIMEDOUT" ? "timeout" : "spawn-error")
      : result.status !== 0 ? "exit-status" : "empty-output";
  const diagnostic = {
    reason,
    errorCode,
    exitCode: Number.isSafeInteger(result?.status) && result.status >= -2147483648 && result.status <= 4294967295 ? result.status : null,
    signal: result?.signal == null ? null : PROBE_SIGNALS.has(result.signal) ? result.signal : "unknown",
    elapsedMs: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 ? Math.min(elapsedMs, 3600000) : 0,
    stdoutBytes: typeof result?.stdout === "string" ? Buffer.byteLength(result.stdout) : 0,
    stderrBytes: typeof result?.stderr === "string" ? Buffer.byteLength(result.stderr) : 0
  };
  return new Error(`${PROBE_LABELS.has(label) ? label : "dependency"} version preflight failed ${JSON.stringify(diagnostic)}`);
}

function listBuilderInputs(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (/\.cs$/iu.test(entry.name) || ["OpenXmlDeckBuilder.csproj", "packages.lock.json"].includes(entry.name)))
    .map((entry) => path.join(root, entry.name));
}

function fingerprintFiles(files, root) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("fingerprint input set must not be empty");
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(root, file).replace(/\\/gu, "/"));
    hash.update("\0");
    hash.update(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function requiredFile(value, label) {
  const file = path.resolve(String(value || ""));
  if (!value || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label} is unavailable`);
  return file;
}

function requiredDirectory(value, label) {
  const directory = path.resolve(String(value || ""));
  if (!value || !fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${label} is unavailable`);
  return directory;
}

function boundedText(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > MAX_PROBE_OUTPUT || [...text].some(isControlCharacter)) throw new TypeError(`${label} is invalid`);
  return text;
}

function isControlCharacter(character) {
  const code = character.codePointAt(0);
  return code < 32 || code === 127;
}

function sha256Digest(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new TypeError(`${label} must be a SHA-256 hex digest`);
  return text;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = {
  collectOfficeRegressionEvidence,
  fingerprintFiles,
  probeCommandVersion,
  probeFontInventory,
  probePowerPointVersion,
  stableJson
};
