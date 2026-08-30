#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { exportGitHubEnvironment, resolvePythonToolLocation } = require("./lib/python-tool-cache");

function bootstrapPaddleOcrRuntime(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || path.resolve(__dirname, ".."));
  const fallbackToolsDir = path.join(workspaceRoot, ".tools");
  const fallbackRuntimeDir = path.join(fallbackToolsDir, "paddleocr-venv");
  const requirementsFile = path.resolve(options.requirementsFile || path.join(workspaceRoot, "scripts", "paddleocr-requirements.lock.txt"));
  const python = options.python || process.env.PYTHON_BIN || "python";
  const run = options.run || spawnSync;
  if (!fs.existsSync(requirementsFile) || !fs.statSync(requirementsFile).isFile()) throw new Error("PaddleOCR requirements file is unavailable");
  const location = resolvePythonToolLocation({
    workspaceRoot,
    fallbackDir: fallbackRuntimeDir,
    requirementsFile,
    toolName: "paddleocr-venv",
    python,
    runnerToolCache: options.runnerToolCache ?? process.env.RUNNER_TOOL_CACHE,
    runtimeIdentity: options.runtimeIdentity,
    runIdentityCommand: options.runIdentityCommand
  });
  const toolsDir = location.managedRoot;
  const runtimeDir = location.targetDir;
  const stagingDir = path.join(toolsDir, `${path.basename(runtimeDir)}-staging-${process.pid}-${Date.now()}`);
  fs.mkdirSync(toolsDir, { recursive: true });
  assertManagedPath(toolsDir, stagingDir);
  assertManagedPath(toolsDir, runtimeDir);
  if (runtimeMatches(run, runtimeDir, workspaceRoot)) {
    const resolvedPython = pythonInVenv(runtimeDir);
    exportGitHubEnvironment("SLIDECLONE_PADDLEOCR_PYTHON", resolvedPython, options.githubEnvironmentFile);
    return resolvedPython;
  }
  try {
    runChecked(run, python, ["-m", "venv", stagingDir], { cwd: workspaceRoot });
    const runtimePython = pythonInVenv(stagingDir);
    runChecked(run, runtimePython, ["-m", "pip", "install", "--disable-pip-version-check", "--requirement", requirementsFile], { cwd: workspaceRoot });
    runChecked(run, runtimePython, versionProbeArgs(), { cwd: workspaceRoot });
    if (runtimeMatches(run, runtimeDir, workspaceRoot)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      const resolvedPython = pythonInVenv(runtimeDir);
      exportGitHubEnvironment("SLIDECLONE_PADDLEOCR_PYTHON", resolvedPython, options.githubEnvironmentFile);
      return resolvedPython;
    }
    if (fs.existsSync(runtimeDir)) {
      const backupDir = path.join(toolsDir, `paddleocr-venv-backup-${process.pid}-${Date.now()}`);
      assertManagedPath(toolsDir, backupDir);
      fs.renameSync(runtimeDir, backupDir);
      try {
        fs.renameSync(stagingDir, runtimeDir);
        fs.rmSync(backupDir, { recursive: true, force: true });
      } catch (error) {
        if (!fs.existsSync(runtimeDir) && fs.existsSync(backupDir)) fs.renameSync(backupDir, runtimeDir);
        throw error;
      }
    } else {
      fs.renameSync(stagingDir, runtimeDir);
    }
    const resolvedPython = pythonInVenv(runtimeDir);
    exportGitHubEnvironment("SLIDECLONE_PADDLEOCR_PYTHON", resolvedPython, options.githubEnvironmentFile);
    return resolvedPython;
  } catch (error) {
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function runChecked(run, command, args, options) {
  const result = run(command, args, { ...options, windowsHide: true, stdio: "inherit" });
  if (!result || result.status !== 0) throw new Error(`PaddleOCR runtime setup failed with exit code ${result?.status ?? "unknown"}`);
}

function pythonInVenv(venvDir) {
  return process.platform === "win32" ? path.join(venvDir, "Scripts", "python.exe") : path.join(venvDir, "bin", "python");
}

function runtimeMatches(run, runtimeDir, workspaceRoot) {
  const runtimePython = pythonInVenv(runtimeDir);
  if (!fs.existsSync(runtimePython)) return false;
  const result = run(runtimePython, versionProbeArgs(), { cwd: workspaceRoot, windowsHide: true, stdio: "ignore" });
  return Boolean(result && result.status === 0);
}

function versionProbeArgs() {
  return ["-c", "import paddle, paddleocr, paddlex; assert paddle.__version__ == '3.3.1' and paddleocr.__version__ == '3.7.0' and paddlex.__version__ == '3.7.2'"];
}

function assertManagedPath(toolsDir, targetDir) {
  const relative = path.relative(path.resolve(toolsDir), path.resolve(targetDir));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Refusing to modify a path outside the managed tools directory");
}

function main() {
  try {
    process.stdout.write(`PaddleOCR runtime ready: ${bootstrapPaddleOcrRuntime()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "PaddleOCR runtime setup failed"}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { assertManagedPath, bootstrapPaddleOcrRuntime, pythonInVenv, runChecked, runtimeMatches, versionProbeArgs };
