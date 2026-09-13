#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function safeCommand(value, label) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4096 || /[\r\n\0]/u.test(trimmed)) throw new Error(`${label} is invalid`);
  return trimmed;
}

function pathEntries(env) {
  const source = typeof env.PATH === "string" ? env.PATH : env.Path;
  if (typeof source !== "string" || !source) return [];
  return source.split(path.delimiter).filter((entry) => entry && !/[\r\n\0]/u.test(entry));
}

function codexRuntimePythonCandidates(env = process.env) {
  const home = safeCommand(env.USERPROFILE, "USERPROFILE") || safeCommand(env.HOME, "HOME") || os.homedir();
  if (!home) return [];
  const executable = process.platform === "win32"
    ? path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3");
  return fs.existsSync(executable) ? [{ command: executable, prefix: [], source: "codex-runtime-python" }] : [];
}

function pathPythonCandidates(command, env = process.env) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const names = extensions.map((extension) => `${command}${extension}`);
  const results = [];
  for (const directory of pathEntries(env)) {
    for (const name of names) {
      const executable = path.join(directory, name);
      try {
        const stat = fs.statSync(executable);
        if (stat.isFile() && !stat.isSymbolicLink()) results.push({ command: executable, prefix: [], source: `${command} on PATH` });
      } catch {
        // PATH entries may be stale or inaccessible; keep scanning later candidates.
      }
    }
  }
  return results;
}

function pythonCandidates(env = process.env) {
  const rawCandidates = [
    { command: safeCommand(env.PYTHON_BIN, "PYTHON_BIN"), prefix: [], source: "PYTHON_BIN" },
    { command: safeCommand(env.PYTHON, "PYTHON"), prefix: [], source: "PYTHON" },
    ...codexRuntimePythonCandidates(env),
    { command: "python3", prefix: [], source: "python3" },
    ...pathPythonCandidates("python3", env),
    { command: "python", prefix: [], source: "python" },
    ...pathPythonCandidates("python", env),
    { command: "py", prefix: ["-3"], source: "py -3" }
  ];
  const seen = new Set();
  return rawCandidates.filter((candidate) => {
    if (!candidate.command) return false;
    const key = `${candidate.command}\0${candidate.prefix.join("\0")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pipDryRunArgs(requirementsFile) {
  return [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--dry-run",
    "--ignore-installed",
    "--require-hashes",
    "--no-deps",
    "--requirement",
    requirementsFile
  ];
}

function runPython(commandRunner, candidate, args, cwd) {
  return commandRunner(candidate.command, [...candidate.prefix, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 5 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024
  });
}

function summarizeFailure(candidate, result) {
  if (!result) return `${candidate.source}: did not start`;
  if (result.error) return `${candidate.source}: ${result.error.message}`;
  const detail = [result.stderr, result.stdout].filter((value) => typeof value === "string" && value.trim()).join(" ").trim();
  const exitCode = result.status ?? "unknown";
  return detail ? `${candidate.source}: exited ${exitCode}: ${detail}` : `${candidate.source}: exited ${exitCode}`;
}

function verifyPythonLock(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || path.resolve(__dirname, ".."));
  const requirementsFile = path.resolve(
    options.requirementsFile || path.join(workspaceRoot, "scripts", "python-requirements.lock.txt")
  );
  const runCommand = options.runCommand || childProcess.spawnSync;
  const env = options.env || process.env;

  if (!fs.existsSync(requirementsFile) || !fs.statSync(requirementsFile).isFile()) {
    throw new Error(`Python dependency lock file was not found: ${requirementsFile}`);
  }

  const failures = [];
  for (const candidate of pythonCandidates(env)) {
    const version = runPython(runCommand, candidate, ["--version"], workspaceRoot);
    if (!version || version.error || version.status !== 0) {
      failures.push(summarizeFailure(candidate, version));
      continue;
    }
    const result = runPython(runCommand, candidate, pipDryRunArgs(requirementsFile), workspaceRoot);
    if (result && !result.error && result.status === 0) {
      if (typeof result.stdout === "string" && result.stdout) process.stdout.write(result.stdout);
      if (typeof result.stderr === "string" && result.stderr) process.stderr.write(result.stderr);
      return Object.freeze({ command: candidate.command, source: candidate.source });
    }
    failures.push(summarizeFailure(candidate, result));
    if (candidate.source === "PYTHON_BIN" || candidate.source === "PYTHON") break;
  }
  throw new Error(`No usable Python runtime could verify ${requirementsFile}. ${failures.join("; ")}`);
}

function main() {
  try {
    verifyPythonLock();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  pipDryRunArgs,
  pythonCandidates,
  verifyPythonLock
};
