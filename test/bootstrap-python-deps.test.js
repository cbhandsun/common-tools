"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  assertManagedPath,
  buildPipArgs,
  installPythonDeps,
  renameWithRetry
} = require("../scripts/bootstrap-python-deps");

test("Python bootstrap always installs from the hashed lock without resolving dependencies", () => {
  const args = buildPipArgs("staging", "requirements.lock.txt");
  assert.ok(args.includes("--require-hashes"));
  assert.ok(args.includes("--no-deps"));
  assert.deepEqual(args.slice(-2), ["--requirement", "requirements.lock.txt"]);
});

test("Python dependency lock covers supported Windows CPython 3.12 and 3.13 wheels", () => {
  const lock = fs.readFileSync(path.join(__dirname, "..", "scripts", "python-requirements.lock.txt"), "utf8");
  assert.match(lock, /supported Windows CPython 3\.12 and 3\.13/u);
  assert.match(lock, /7f84204dee22a783350679a0333981df803dac21a0190d706a50475e361c93f5/u);
  assert.match(lock, /390ede346628ccc626e5730107cde16c42d3836b89662a115a921f28440e6a3b/u);
  assert.match(lock, /26e6eda8d38c1fcab1090dd196ee87cbd13788e531937610e2589085de074e77/u);
  assert.match(lock, /a10bd2fd62e8ce916ececb342f348f190724a098c1faa056fdfb2a22ad5e8660/u);
});

test("Python bootstrap atomically replaces a validated environment", (t) => {
  const workspaceRoot = makeWorkspace(t, "old");
  const calls = [];
  let installed = false;
  const siteDir = installPythonDeps({
    workspaceRoot,
    runnerToolCache: "",
    runCommand(_command, args, commandOptions) {
      calls.push(args);
      const targetIndex = args.indexOf("--target");
      if (targetIndex >= 0) {
        fs.writeFileSync(path.join(args[targetIndex + 1], "new.txt"), "new");
        installed = true;
      }
      const pythonPath = args[0] === "-c" ? commandOptions?.env?.PYTHONPATH : null;
      return { status: installed && pythonPath !== path.join(workspaceRoot, ".tools", "python-site") ? 0 : 1 };
    }
  });

  assert.equal(fs.readFileSync(path.join(siteDir, "new.txt"), "utf8"), "new");
  assert.equal(fs.existsSync(path.join(siteDir, "old.txt")), false);
  assert.equal(calls.length, 4);
});

test("Python bootstrap reuses a content-addressed Runner tool cache", (t) => {
  const workspaceRoot = makeWorkspace(t, "old");
  const runnerToolCache = fs.mkdtempSync(path.join(os.tmpdir(), "runner-tool-cache-test-"));
  const githubEnvironmentFile = path.join(workspaceRoot, "github-env.txt");
  t.after(() => fs.rmSync(runnerToolCache, { recursive: true, force: true }));
  let installs = 0;
  const runCommand = (_command, args) => {
    const targetIndex = args.indexOf("--target");
    if (targetIndex >= 0) {
      installs += 1;
      fs.writeFileSync(path.join(args[targetIndex + 1], "installed.txt"), "ok");
    }
    return { status: 0 };
  };
  const options = {
    workspaceRoot,
    runnerToolCache,
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64",
    githubEnvironmentFile,
    runCommand
  };

  const first = installPythonDeps(options);
  const second = installPythonDeps(options);

  assert.equal(second, first);
  assert.equal(installs, 1);
  assert.match(first, /ct[\\/]p[\\/][a-f0-9]{32}$/u);
  assert.match(fs.readFileSync(githubEnvironmentFile, "utf8"), /SLIDECLONE_PYTHON_SITE_DIR=/u);
});

test("Python bootstrap keeps a valid cache completed by a concurrent run", (t) => {
  const workspaceRoot = makeWorkspace(t, "old");
  const runnerToolCache = fs.mkdtempSync(path.join(os.tmpdir(), "runner-tool-cache-race-"));
  t.after(() => fs.rmSync(runnerToolCache, { recursive: true, force: true }));
  let winnerDir;
  const siteDir = installPythonDeps({
    workspaceRoot,
    runnerToolCache,
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64",
    githubEnvironmentFile: "",
    runCommand(_command, args, commandOptions) {
      const targetIndex = args.indexOf("--target");
      if (targetIndex >= 0) fs.writeFileSync(path.join(args[targetIndex + 1], "candidate.txt"), "candidate");
      const pythonPath = commandOptions?.env?.PYTHONPATH;
      if (typeof pythonPath === "string" && /-s-[^\\/]+$/u.test(pythonPath) && !winnerDir) {
        winnerDir = pythonPath.slice(0, pythonPath.lastIndexOf("-s-"));
        fs.mkdirSync(winnerDir, { recursive: true });
        fs.writeFileSync(path.join(winnerDir, "winner.txt"), "winner");
      }
      return { status: 0 };
    }
  });

  assert.equal(siteDir, winnerDir);
  assert.equal(fs.readFileSync(path.join(siteDir, "winner.txt"), "utf8"), "winner");
  assert.equal(fs.existsSync(path.join(siteDir, "candidate.txt")), false);
});

test("Python bootstrap preserves the previous environment when installation fails", (t) => {
  const workspaceRoot = makeWorkspace(t, "old");
  assert.throws(() => installPythonDeps({
    workspaceRoot,
    runnerToolCache: "",
    runCommand() {
      return { status: 1 };
    }
  }), /pip install failed/);

  assert.equal(
    fs.readFileSync(path.join(workspaceRoot, ".tools", "python-site", "old.txt"), "utf8"),
    "old"
  );
});

test("Python bootstrap refuses broad or escaping cleanup paths", () => {
  const toolsDir = path.resolve("workspace/.tools");
  assert.throws(() => assertManagedPath(toolsDir, toolsDir), /Refusing/);
  assert.throws(() => assertManagedPath(toolsDir, path.resolve("workspace")), /Refusing/);
});

test("Python bootstrap retries transient Windows rename locks with a bounded backoff", () => {
  const waits = [];
  let calls = 0;
  renameWithRetry("staging", "site", {
    attempts: 4,
    initialDelayMs: 10,
    rename() {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
    },
    wait(milliseconds) {
      waits.push(milliseconds);
    }
  });

  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("Python bootstrap does not retry non-locking rename failures", () => {
  let calls = 0;
  assert.throws(() => renameWithRetry("staging", "site", {
    rename() {
      calls += 1;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    wait() {
      assert.fail("non-locking failures must not wait");
    }
  }), /missing/);
  assert.equal(calls, 1);
});

function makeWorkspace(t, marker) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "python-bootstrap-test-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspaceRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "scripts", "python-requirements.lock.txt"), "# test");
  const siteDir = path.join(workspaceRoot, ".tools", "python-site");
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, `${marker}.txt`), marker);
  return workspaceRoot;
}
