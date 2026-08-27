#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function bootstrapPaddleOcrRuntime(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || path.resolve(__dirname, ".."));
  const toolsDir = path.join(workspaceRoot, ".tools");
  const runtimeDir = path.join(toolsDir, "paddleocr-venv");
  const stagingDir = path.join(toolsDir, `paddleocr-venv-staging-${process.pid}-${Date.now()}`);
  const requirementsFile = path.resolve(options.requirementsFile || path.join(workspaceRoot, "scripts", "paddleocr-requirements.lock.txt"));
  const python = options.python || process.env.PYTHON_BIN || "python";
  const run = options.run || spawnSync;
  if (!fs.existsSync(requirementsFile) || !fs.statSync(requirementsFile).isFile()) throw new Error("PaddleOCR requirements file is unavailable");
  fs.mkdirSync(toolsDir, { recursive: true });
  assertManagedPath(toolsDir, stagingDir);
  assertManagedPath(toolsDir, runtimeDir);
  if (runtimeMatches(run, runtimeDir, workspaceRoot)) return pythonInVenv(runtimeDir);
  try {
    runChecked(run, python, ["-m", "venv", stagingDir], { cwd: workspaceRoot });
    const runtimePython = pythonInVenv(stagingDir);
    runChecked(run, runtimePython, ["-m", "pip", "install", "--disable-pip-version-check", "--requirement", requirementsFile], { cwd: workspaceRoot });
    runChecked(run, runtimePython, versionProbeArgs(), { cwd: workspaceRoot });
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
    return pythonInVenv(runtimeDir);
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
    process.stdout.write(`PaddleOCR runtime installed: ${bootstrapPaddleOcrRuntime()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "PaddleOCR runtime setup failed"}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { assertManagedPath, bootstrapPaddleOcrRuntime, pythonInVenv, runChecked, runtimeMatches, versionProbeArgs };
