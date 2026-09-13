"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { pipDryRunArgs, pythonCandidates, verifyPythonLock } = require("../scripts/verify-python-lock");

test("Python lock verifier prefers PYTHON_BIN and uses hash-enforced dry-run pip args", (t) => {
  const workspaceRoot = makeWorkspace(t);
  const calls = [];
  const result = verifyPythonLock({
    workspaceRoot,
    env: { PYTHON_BIN: "managed-python" },
    runCommand(command, args) {
      calls.push({ command, args });
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(result.command, "managed-python");
  assert.deepEqual(calls.map((call) => call.command), ["managed-python", "managed-python"]);
  assert.deepEqual(calls[1].args, pipDryRunArgs(path.join(workspaceRoot, "scripts", "python-requirements.lock.txt")));
  assert.ok(calls[1].args.includes("--require-hashes"));
  assert.ok(calls[1].args.includes("--no-deps"));
});

test("Python lock verifier reports silent Windows Python shims with candidate diagnostics", (t) => {
  const workspaceRoot = makeWorkspace(t);
  assert.throws(() => verifyPythonLock({
    workspaceRoot,
    env: {},
    runCommand() {
      return { status: 1, stdout: "", stderr: "" };
    }
  }), /No usable Python runtime.*python: exited 1/u);
});

test("Python candidate list keeps explicit overrides ahead of ambient runtimes", () => {
  const candidates = pythonCandidates({ PYTHON_BIN: "bin-python", PYTHON: "env-python" });
  assert.deepEqual(candidates.slice(0, 2).map((candidate) => candidate.source), ["PYTHON_BIN", "PYTHON"]);
});

test("Python candidate list discovers bundled and later PATH runtimes after command shims", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "python-candidates-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const home = path.join(root, "home");
  const pathA = path.join(root, "path-a");
  const pathB = path.join(root, "path-b");
  const bundled = process.platform === "win32"
    ? path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3");
  const pythonName = process.platform === "win32" ? "python.exe" : "python";
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  fs.mkdirSync(pathA, { recursive: true });
  fs.mkdirSync(pathB, { recursive: true });
  fs.writeFileSync(bundled, "");
  fs.writeFileSync(path.join(pathB, pythonName), "");

  const candidates = pythonCandidates({
    USERPROFILE: home,
    HOME: home,
    PATH: [pathA, pathB].join(path.delimiter)
  });

  assert.ok(candidates.some((candidate) => candidate.source === "codex-runtime-python" && candidate.command === bundled));
  assert.ok(candidates.some((candidate) => candidate.source === "python on PATH" && candidate.command === path.join(pathB, pythonName)));
});

function makeWorkspace(t) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "python-lock-verify-test-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspaceRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "scripts", "python-requirements.lock.txt"), "# test\n");
  return workspaceRoot;
}
