"use strict";
// @ts-check

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync: defaultSpawnSync } = require("node:child_process");
const { resolvePptxBuildMode } = require("./pptx-build-mode");
const { normalizeBuildJobs } = require("./openxml-build-jobs");

const MAX_PATH_LENGTH = 32_768;
const PYTHON_TIMEOUT_MS = 120_000;
const PYTHON_MAX_BUFFER_BYTES = 1024 * 1024;

/** @typedef {{irFile: string, outFile: string, templatePptx: string, [key: string]: unknown}} PptxBuildJob */
/** @typedef {{status?: unknown, error?: unknown}} SpawnResult */
/** @typedef {(command: string, args: string[], options: {cwd: string, encoding: "utf8", timeout: number, maxBuffer: number, windowsHide: boolean}) => SpawnResult} SpawnSync */
/** @typedef {(jobs: PptxBuildJob[], context: object, builderDirectory: string, mode: object) => string[]} OpenXmlBuilder */

/**
 * Creates the delivery-stage PPTX executor.  The entry point supplies the
 * Skill-local Python and OpenXML adapters, keeping this package free of an
 * upward dependency on the Skill directory.
 * @param {{skillRoot: string, projectRoot: string, buildOpenXmlDecksSync: OpenXmlBuilder, spawnSync?: SpawnSync}} input
 */
function createPptxBuildExecutor(input) {
  if (!input || typeof input !== "object") throw new TypeError("PPTX build executor configuration is invalid");
  const { skillRoot, projectRoot, buildOpenXmlDecksSync, spawnSync = defaultSpawnSync } = input;
  if (!validPath(skillRoot) || !validPath(projectRoot) || typeof buildOpenXmlDecksSync !== "function" || typeof spawnSync !== "function") {
    throw new TypeError("PPTX build executor configuration is invalid");
  }
  const resolvedSkillRoot = path.resolve(skillRoot);
  const resolvedProjectRoot = path.resolve(projectRoot);

  /** @param {string} irFile @param {string} outFile @param {Record<string, unknown>} [options] */
  function buildPptx(irFile, outFile, options = {}) {
    if (resolvePptxBuildMode(options).engine === "openxml") {
      buildPptxBatch([{ irFile, outFile }], options);
      return;
    }
    const job = normalizePptxBuildJobs([{ irFile, outFile }])[0];
    if (!job) throw new TypeError("PPTX build job is invalid");
    const python = resolvePython(typeof options.python === "string" ? options.python : undefined);
    const script = path.join(resolvedSkillRoot, "scripts", "python", "build_pptx.py");
    let result;
    try {
      result = spawnSync(python, [script, "--ir", job.irFile, "--out", job.outFile], {
        cwd: resolvedProjectRoot,
        encoding: "utf8",
        timeout: PYTHON_TIMEOUT_MS,
        maxBuffer: PYTHON_MAX_BUFFER_BYTES,
        windowsHide: true
      });
    } catch {
      throw new Error("PPTX Python build failed");
    }
    if (!result || result.status !== 0) throw new Error("PPTX Python build failed");
  }

  /** @param {unknown} jobs @param {Record<string, unknown>} [options] */
  function buildPptxBatch(jobs, options = {}) {
    const normalizedJobs = normalizePptxBuildJobs(jobs);
    const firstJob = normalizedJobs[0];
    if (!firstJob) return [];
    const mode = resolvePptxBuildMode(options);
    if (mode.engine === "openxml") {
      const context = {
        skillRoot: resolvedSkillRoot,
        outputDir: path.dirname(firstJob.outFile),
        config: {
          openXmlBuilder: {
            ...(mode.openXmlBuilderExe ? { exePath: mode.openXmlBuilderExe } : {}),
            ...(mode.openXmlBuilderConfiguration ? { configuration: mode.openXmlBuilderConfiguration } : {}),
            ...(mode.openXmlBuilderTargetFramework ? { targetFramework: mode.openXmlBuilderTargetFramework } : {}),
            cache: mode.openXmlBuildCache,
            cacheDir: mode.openXmlBuildCacheDir,
            cacheMaxBytes: Number(mode.openXmlBuildCacheMaxBytes) || undefined
          }
        },
        configFile: path.join(process.cwd(), "slideclone.config.json")
      };
      return buildOpenXmlDecksSync(normalizedJobs, context, path.join(resolvedSkillRoot, "dotnet", "OpenXmlDeckBuilder"), mode);
    }
    for (const job of normalizedJobs) buildPptx(job.irFile, job.outFile, { ...options, "pptx-engine": "python" });
    return normalizedJobs.map((job) => job.outFile);
  }

  return Object.freeze({ buildPptx, buildPptxBatch });
}

/** @param {unknown} jobs @returns {PptxBuildJob[]} */
function normalizePptxBuildJobs(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError("PPTX build jobs are invalid");
  if (jobs.length === 0) return [];
  const normalized = normalizeBuildJobs(jobs);
  return normalized.map((validated, index) => ({ ...safeOwnDataProperties(jobs[index]), ...validated }));
}

/** @param {unknown} value @param {number} index */
function normalizeBuildTemplatePptx(value, index) {
  if (value == null || value === "") return "";
  const template = normalizedPath(value);
  if (!template) throw new Error(`PPTX build job ${index + 1} has an invalid templatePptx`);
  const templatePptx = path.resolve(template);
  if (!fs.existsSync(templatePptx) || !fs.statSync(templatePptx).isFile()) throw new Error(`PPTX build job ${index + 1} template PPTX was not found`);
  return templatePptx;
}

/** @param {Record<string, unknown>} [options] @param {{engine?: unknown}} [buildMode] */
function shouldRunPowerPointOpenGate(options = {}, buildMode = resolvePptxBuildMode(options)) {
  const configured = options["powerpoint-open-gate"] ?? options.powerPointOpenGate;
  if (configured !== undefined) return !isFlagDisabled(configured);
  return buildMode.engine === "openxml";
}

/** @param {string | undefined} explicit */
function resolvePython(explicit) {
  const bundled = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  return [explicit, process.env.SLIDECLONE_PYTHON, process.env.PYTHON, bundled, "python"]
    .filter((candidate) => typeof candidate === "string")
    .filter((candidate) => candidate.length > 0)
    .find((candidate) => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || "python";
}

/** @param {unknown} value */
function isFlagDisabled(value) { return value === false || String(value ?? "").trim().toLowerCase() === "false" || String(value ?? "").trim() === "0"; }
/** @param {unknown} value */
function normalizedPath(value) { return typeof value === "string" && validPath(value) ? value.trim() : ""; }
/** @param {unknown} value */
function validPath(value) { return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_PATH_LENGTH && !value.includes("\0"); }
/** @param {unknown} value */
function safeOwnDataProperties(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("PPTX build job is invalid");
  /** @type {Record<string, unknown>} */
  const copy = Object.create(null);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("PPTX build job accessor fields are invalid");
    copy[key] = descriptor.value;
  }
  return copy;
}

module.exports = { createPptxBuildExecutor, normalizePptxBuildJobs, normalizeBuildTemplatePptx, shouldRunPowerPointOpenGate, resolvePython, isFlagDisabled };
