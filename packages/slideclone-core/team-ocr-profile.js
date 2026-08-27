"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { containsControlCharacter } = require("../capability-contracts");

const PROFILE_NAME = "tesseract-tsv-v1";
const ALLOWED_LANGUAGES = new Set(["eng", "chi_sim", "chi_tra", "jpn", "kor"]);
const MAX_OCR_OUTPUT_BYTES = 1024 * 1024;
const OCR_TIMEOUT_MS = 90 * 1000;
const OCR_STARTUP_TIMEOUT_MS = 10 * 1000;

function sha256File(file) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
}

function requiredEnvironmentValue(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required when raw OCR is enabled`);
  return value.trim();
}

function parseLanguages(value) {
  const languages = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!languages.length || languages.length > 5 || new Set(languages).size !== languages.length || languages.some((language) => !ALLOWED_LANGUAGES.has(language))) {
    throw new Error("COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES is invalid");
  }
  return Object.freeze(languages);
}

function parsePinnedRawImageOcrProfile(environment = process.env) {
  if (!environment || typeof environment !== "object") throw new TypeError("raw image OCR profile configuration is invalid");
  const profileName = environment.COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE;
  const profileVariables = ["COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE", "COMMON_TOOLS_IMAGE_RAW_OCR_SHA256", "COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES"];
  if (profileName === undefined || profileName === "") {
    if (profileVariables.some((name) => environment[name] !== undefined && environment[name] !== "")) throw new Error("raw image OCR settings require COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE");
    return Object.freeze({ enabled: false });
  }
  if (profileName !== PROFILE_NAME) throw new Error("COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE is unsupported");
  const executable = requiredEnvironmentValue(environment, "COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE");
  if (!path.isAbsolute(executable)) throw new Error("COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE is invalid");
  const expectedSha256 = requiredEnvironmentValue(environment, "COMMON_TOOLS_IMAGE_RAW_OCR_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("COMMON_TOOLS_IMAGE_RAW_OCR_SHA256 is invalid");
  return Object.freeze({ enabled: true, name: PROFILE_NAME, executable, languages: parseLanguages(requiredEnvironmentValue(environment, "COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES")), sha256: expectedSha256 });
}

function readPinnedRawImageOcrProfile(environment = process.env, { hashFile = sha256File } = {}) {
  if (typeof hashFile !== "function") throw new TypeError("raw image OCR profile configuration is invalid");
  const profile = parsePinnedRawImageOcrProfile(environment);
  if (!profile.enabled) return profile;
  let executableIsFile;
  try { executableIsFile = path.isAbsolute(profile.executable) && fs.statSync(profile.executable).isFile(); } catch { executableIsFile = false; }
  if (!executableIsFile) throw new Error("COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE is unavailable");
  const actualSha256 = hashFile(profile.executable);
  if (typeof actualSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(actualSha256) || !crypto.timingSafeEqual(Buffer.from(profile.sha256), Buffer.from(actualSha256.toLowerCase()))) {
    throw new Error("raw image OCR executable checksum does not match");
  }
  return profile;
}

function parseTesseractTsv(value, dimensions) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_OCR_OUTPUT_BYTES || !dimensions || !Number.isSafeInteger(dimensions.widthPx) || !Number.isSafeInteger(dimensions.heightPx) || dimensions.widthPx < 1 || dimensions.heightPx < 1) {
    throw new Error("raw image OCR output is invalid");
  }
  const rows = value.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = rows.shift();
  if (header !== "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext") throw new Error("raw image OCR output is invalid");
  const lines = new Map();
  for (const row of rows) {
    if (!row) continue;
    const fields = row.split("\t");
    if (fields.length < 12) throw new Error("raw image OCR output is invalid");
    if (fields[0] !== "5") continue;
    const text = fields.slice(11).join("\t").trim();
    const confidence = Number(fields[10]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    if (text.length > 512 || containsControlCharacter(text)) throw new Error("raw image OCR output contains invalid text");
    const numeric = fields.slice(1, 10).map((field) => Number(field));
    if (numeric.some((item) => !Number.isSafeInteger(item) || item < 0)) throw new Error("raw image OCR output contains invalid geometry");
    const [page, block, paragraph, line, , left, top, width, height] = numeric;
    if (width < 1 || height < 1 || left + width > dimensions.widthPx || top + height > dimensions.heightPx) throw new Error("raw image OCR output contains invalid geometry");
    const key = `${page}:${block}:${paragraph}:${line}`;
    const existing = lines.get(key);
    if (existing) {
      existing.text.push(text);
      existing.left = Math.min(existing.left, left); existing.top = Math.min(existing.top, top);
      existing.right = Math.max(existing.right, left + width); existing.bottom = Math.max(existing.bottom, top + height);
    } else {
      if (lines.size >= 10000) throw new Error("raw image OCR output exceeds limits");
      lines.set(key, { text: [text], left, top, right: left + width, bottom: top + height });
    }
  }
  return Object.freeze({ lines: Object.freeze([...lines.values()].map((line) => Object.freeze({ text: line.text.join(" "), box: Object.freeze({ x: line.left, y: line.top, w: line.right - line.left, h: line.bottom - line.top }) }))) });
}

function runProcess({ executable, args, timeoutMs, isCancellationRequested, spawn = childProcess.spawn }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH || "", LANG: "C.UTF-8" } });
    let settled = false;
    let terminationReason = "";
    const output = [];
    let outputBytes = 0;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(cancellationTimer);
      error ? reject(error) : resolve(value);
    };
    const stop = (reason) => {
      if (settled || terminationReason) return;
      terminationReason = reason;
      child.kill("SIGTERM");
    };
    const timeout = setTimeout(() => stop("timeout"), timeoutMs);
    const checkCancellation = () => {
      Promise.resolve().then(() => isCancellationRequested()).then((requested) => { if (requested) stop("cancelled"); }).catch(() => stop("cancelled"));
    };
    // Do not wait for the first polling interval. Besides reducing cancellation
    // latency, this prevents a loaded Worker event loop from treating an
    // already-cancelled Job as a timeout.
    const cancellationTimer = typeof isCancellationRequested === "function" ? setInterval(checkCancellation, 250) : undefined;
    if (cancellationTimer) checkCancellation();
    child.once("error", () => finish(new Error("raw image OCR process could not start")));
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OCR_OUTPUT_BYTES) stop("output-limit"); else output.push(chunk);
    });
    child.once("close", (code) => {
      if (terminationReason === "cancelled") return finish(new Error("raw image OCR was cancelled"));
      if (terminationReason === "timeout") return finish(new Error("raw image OCR timed out"));
      if (terminationReason === "output-limit" || outputBytes > MAX_OCR_OUTPUT_BYTES) return finish(new Error("raw image OCR output exceeds limits"));
      if (code !== 0) return finish(new Error("raw image OCR failed"));
      finish(null, Buffer.concat(output).toString("utf8"));
    });
  });
}

async function verifyPinnedRawImageOcrProfile(profile, { run = runProcess } = {}) {
  if (!profile || profile.enabled !== true || profile.name !== PROFILE_NAME || typeof run !== "function") throw new TypeError("raw image OCR profile is invalid");
  const output = await run({ executable: profile.executable, args: ["--list-langs"], timeoutMs: OCR_STARTUP_TIMEOUT_MS });
  const installed = new Set(output.split(/\r?\n/).map((item) => item.trim()).filter((item) => /^[a-z0-9_]{2,16}$/.test(item)));
  if (profile.languages.some((language) => !installed.has(language))) throw new Error("raw image OCR language pack is unavailable");
  return true;
}

function createPinnedRawImageOcr(profile, { run = runProcess } = {}) {
  if (!profile || profile.enabled !== true || profile.name !== PROFILE_NAME || typeof run !== "function") throw new TypeError("raw image OCR profile is invalid");
  return async ({ inputFile, dimensions, isCancellationRequested }) => {
    if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) throw new Error("raw image OCR input is invalid");
    if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("raw image OCR was cancelled");
    const output = await run({ executable: profile.executable, args: [inputFile, "stdout", "--psm", "3", "-l", profile.languages.join("+"), "tsv"], timeoutMs: OCR_TIMEOUT_MS, isCancellationRequested });
    if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("raw image OCR was cancelled");
    return parseTesseractTsv(output, dimensions);
  };
}

module.exports = { ALLOWED_LANGUAGES, OCR_STARTUP_TIMEOUT_MS, OCR_TIMEOUT_MS, PROFILE_NAME, createPinnedRawImageOcr, parsePinnedRawImageOcrProfile, parseTesseractTsv, readPinnedRawImageOcrProfile, runProcess, sha256File, verifyPinnedRawImageOcrProfile };
