"use strict";

const path = require("path");
const fs = require("fs");

function localPythonSiteDir(skillRoot) {
  const configured = process.env.SLIDECLONE_PYTHON_SITE_DIR;
  if (configured !== undefined && configured !== "") {
    return validatedDirectory(configured, "SLIDECLONE_PYTHON_SITE_DIR");
  }
  return path.resolve(skillRoot, "..", "..", ".tools", "python-site");
}

function pythonEnv(skillRoot, options = {}) {
  if (isTruthy(process.env.SLIDECLONE_SKIP_LOCAL_PYTHON_SITE)) {
    return {};
  }
  if (usesBundledPython(options.python)) {
    return {};
  }
  const siteDir = localPythonSiteDir(skillRoot);
  const existing = process.env.PYTHONPATH ? process.env.PYTHONPATH.split(path.delimiter).filter(Boolean) : [];
  return {
    PYTHONPATH: [siteDir, ...existing].join(path.delimiter)
  };
}

function resolvePythonExecutable(explicit) {
  const bundled = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  return [
    explicit,
    process.env.PYTHON_BIN,
    process.env.SLIDECLONE_PYTHON,
    process.env.PYTHON,
    bundled,
    "python"
  ].filter(Boolean).find((candidate) => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || "python";
}

function usesBundledPython(python) {
  if (!python || !path.isAbsolute(python)) {
    return false;
  }
  const normalized = path.normalize(python).toLowerCase();
  return normalized.endsWith(path.normalize(".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe").toLowerCase());
}

function isTruthy(value) {
  return value === true || ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function validatedDirectory(value, name) {
  if (typeof value !== "string" || value.length > 32_768 || /[\r\n\0]/u.test(value) || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute directory path`);
  }
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${name} is unavailable`);
  }
  return resolved;
}

module.exports = {
  localPythonSiteDir,
  pythonEnv,
  resolvePythonExecutable,
  validatedDirectory,
  usesBundledPython
};
