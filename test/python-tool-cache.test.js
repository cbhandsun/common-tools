"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportGitHubEnvironment,
  readPythonRuntimeIdentity,
  resolvePythonToolLocation
} = require("../scripts/lib/python-tool-cache");

test("Python tool cache key changes with the lock and runtime identity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "python-cache-key-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lock = path.join(root, "requirements.lock.txt");
  const runnerToolCache = path.join(root, "runner-cache");
  fs.writeFileSync(lock, "one\n");
  const base = {
    workspaceRoot: root,
    fallbackDir: path.join(root, ".tools", "python-site"),
    requirementsFile: lock,
    toolName: "python-site",
    python: "python",
    runnerToolCache,
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64"
  };

  const first = resolvePythonToolLocation(base);
  const same = resolvePythonToolLocation(base);
  const newRuntime = resolvePythonToolLocation({ ...base, runtimeIdentity: "CPython|3.13.2|cpython-313|win-amd64" });
  fs.writeFileSync(lock, "two\n");
  const newLock = resolvePythonToolLocation(base);

  assert.equal(same.targetDir, first.targetDir);
  assert.notEqual(newRuntime.targetDir, first.targetDir);
  assert.notEqual(newLock.targetDir, first.targetDir);
  assert.equal(first.persistent, true);
  assert.match(first.targetDir, /ct[\\/]p[\\/][a-f0-9]{32}$/u);
  assert.ok(path.relative(runnerToolCache, first.targetDir).length <= 40, "cache suffix must stay Windows DLL-safe");
});

test("Python tool cache rejects relative and filesystem-root cache paths", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "python-cache-boundary-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lock = path.join(root, "requirements.lock.txt");
  fs.writeFileSync(lock, "locked\n");
  const options = {
    workspaceRoot: root,
    fallbackDir: path.join(root, ".tools", "python-site"),
    requirementsFile: lock,
    toolName: "python-site",
    python: "python",
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64"
  };
  assert.throws(() => resolvePythonToolLocation({ ...options, runnerToolCache: "relative" }), /absolute/u);
  assert.throws(() => resolvePythonToolLocation({ ...options, runnerToolCache: path.parse(root).root }), /filesystem root/u);
});

test("Python runtime identity parser validates subprocess output", () => {
  const valid = JSON.stringify({
    implementation: "CPython",
    version: "3.12.9",
    cacheTag: "cpython-312",
    platform: "win-amd64"
  });
  assert.equal(
    readPythonRuntimeIdentity("python", process.cwd(), () => ({ status: 0, stdout: `${valid}\n` })),
    "CPython|3.12.9|cpython-312|win-amd64"
  );
  assert.throws(
    () => readPythonRuntimeIdentity("python", process.cwd(), () => ({ status: 0, stdout: "not-json" })),
    /identity is invalid/u
  );
  assert.throws(
    () => readPythonRuntimeIdentity("python", process.cwd(), () => ({ status: 9, stdout: "" })),
    /exit 9/u
  );
});

test("GitHub environment export rejects multiline path injection", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "github-env-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const environmentFile = path.join(root, "env.txt");
  assert.equal(exportGitHubEnvironment("SLIDECLONE_PYTHON_SITE_DIR", root, environmentFile), true);
  assert.match(fs.readFileSync(environmentFile, "utf8"), /^SLIDECLONE_PYTHON_SITE_DIR=/u);
  assert.throws(() => exportGitHubEnvironment("SLIDECLONE_PYTHON_SITE_DIR", `${root}\nBAD=value`, environmentFile), /single-line/u);
});
