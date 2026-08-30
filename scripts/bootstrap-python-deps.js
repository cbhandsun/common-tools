#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { exportGitHubEnvironment, resolvePythonToolLocation } = require("./lib/python-tool-cache");

function installPythonDeps(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || path.resolve(__dirname, ".."));
  const fallbackToolsDir = path.join(workspaceRoot, ".tools");
  const fallbackSiteDir = path.join(fallbackToolsDir, "python-site");
  const requirementsFile = path.resolve(
    options.requirementsFile || path.join(workspaceRoot, "scripts", "python-requirements.lock.txt")
  );
  const python = options.python || process.env.PYTHON_BIN || "python";
  const runCommand = options.runCommand || defaultRunCommand;

  if (!fs.existsSync(requirementsFile)) {
    throw new Error(`Python dependency lock file was not found: ${requirementsFile}`);
  }

  const location = resolvePythonToolLocation({
    workspaceRoot,
    fallbackDir: fallbackSiteDir,
    requirementsFile,
    toolName: "python-site",
    python,
    runnerToolCache: options.runnerToolCache ?? process.env.RUNNER_TOOL_CACHE,
    runtimeIdentity: options.runtimeIdentity,
    runIdentityCommand: options.runIdentityCommand
  });
  const toolsDir = location.managedRoot;
  const siteDir = location.targetDir;
  fs.mkdirSync(toolsDir, { recursive: true });
  if (pythonDepsMatch(runCommand, python, siteDir, workspaceRoot)) {
    exportGitHubEnvironment("SLIDECLONE_PYTHON_SITE_DIR", siteDir, options.githubEnvironmentFile);
    return siteDir;
  }
  const stagingDir = fs.mkdtempSync(path.join(toolsDir, `${path.basename(siteDir)}-s-`));
  const backupDir = path.join(toolsDir, `${path.basename(siteDir)}-b-${process.pid}`);
  assertManagedPath(toolsDir, stagingDir);
  assertManagedPath(toolsDir, backupDir);

  try {
    const install = runCommand(python, buildPipArgs(stagingDir, requirementsFile), {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: "inherit"
    });
    if (install.status !== 0) {
      throw new Error(`pip install failed with exit code ${install.status ?? "unknown"}`);
    }

    const probe = runCommand(python, [
      "-c",
      "import lxml, PIL, pptx, typing_extensions, xlsxwriter"
    ], {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        PYTHONPATH: stagingDir
      }
    });
    if (probe.status !== 0) {
      throw new Error(`Python dependency import probe failed with exit code ${probe.status ?? "unknown"}`);
    }

    if (pythonDepsMatch(runCommand, python, siteDir, workspaceRoot)) {
      removeManagedDirectory(toolsDir, stagingDir);
      exportGitHubEnvironment("SLIDECLONE_PYTHON_SITE_DIR", siteDir, options.githubEnvironmentFile);
      return siteDir;
    }
    if (fs.existsSync(siteDir)) renameWithRetry(siteDir, backupDir);
    try {
      renameWithRetry(stagingDir, siteDir);
    } catch (error) {
      if (fs.existsSync(backupDir) && !fs.existsSync(siteDir)) {
        renameWithRetry(backupDir, siteDir);
      }
      throw error;
    }
    removeManagedDirectory(toolsDir, backupDir);
    exportGitHubEnvironment("SLIDECLONE_PYTHON_SITE_DIR", siteDir, options.githubEnvironmentFile);
    return siteDir;
  } catch (error) {
    removeManagedDirectory(toolsDir, stagingDir);
    throw error;
  }
}

function pythonDepsMatch(runCommand, python, siteDir, workspaceRoot) {
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) return false;
  const result = runCommand(python, ["-c", "import lxml, PIL, pptx, typing_extensions, xlsxwriter"], {
    cwd: workspaceRoot,
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, PYTHONPATH: siteDir }
  });
  return Boolean(result && result.status === 0);
}

function buildPipArgs(targetDir, requirementsFile) {
  return [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--require-hashes",
    "--no-deps",
    "--target",
    targetDir,
    "--requirement",
    requirementsFile
  ];
}

function defaultRunCommand(command, args, options) {
  return spawnSync(command, args, options);
}

function renameWithRetry(source, destination, options = {}) {
  const rename = options.rename || fs.renameSync;
  const wait = options.wait || waitSynchronously;
  const attempts = options.attempts ?? 6;
  const initialDelayMs = options.initialDelayMs ?? 25;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new TypeError("rename attempts must be an integer from 1 through 10");
  }
  if (!Number.isInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 1_000) {
    throw new TypeError("rename initialDelayMs must be an integer from 0 through 1000");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rename(source, destination);
      return;
    } catch (error) {
      const retryable = error && ["EACCES", "EBUSY", "EPERM"].includes(error.code);
      if (!retryable || attempt === attempts) throw error;
      wait(initialDelayMs * (2 ** (attempt - 1)));
    }
  }
}

function waitSynchronously(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function removeManagedDirectory(toolsDir, targetDir) {
  if (!fs.existsSync(targetDir)) return;
  assertManagedPath(toolsDir, targetDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
}

function assertManagedPath(toolsDir, targetDir) {
  const relative = path.relative(path.resolve(toolsDir), path.resolve(targetDir));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a path outside the managed tools directory: ${targetDir}`);
  }
}

function main() {
  try {
    const siteDir = installPythonDeps();
    process.stdout.write(`Python dependencies ready at ${siteDir}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertManagedPath,
  buildPipArgs,
  installPythonDeps,
  pythonDepsMatch,
  renameWithRetry
};
