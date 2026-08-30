"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertManagedPath, bootstrapPaddleOcrRuntime, pythonInVenv, runChecked, versionProbeArgs } = require("../scripts/bootstrap-paddleocr-runtime");

test("PaddleOCR bootstrap confines replacement to its managed tools directory", () => {
  const tools = path.resolve(".tools");
  assert.doesNotThrow(() => assertManagedPath(tools, path.join(tools, "paddleocr-venv")));
  assert.throws(() => assertManagedPath(tools, path.resolve("outside")), /outside/);
  assert.match(pythonInVenv(path.resolve("runtime")), process.platform === "win32" ? /Scripts[\\/]python\.exe$/ : /bin[\\/]python$/);
});

test("PaddleOCR bootstrap fails closed when a setup process fails", () => {
  assert.throws(() => runChecked(() => ({ status: 7 }), "python", [], {}), /exit code 7/);
  assert.match(versionProbeArgs()[1], /paddleocr\.__version__ == '3\.7\.0'/);
});

test("PaddleOCR bootstrap installs once and reuses the Runner tool cache", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paddle-bootstrap-workspace-"));
  const runnerToolCache = fs.mkdtempSync(path.join(os.tmpdir(), "paddle-runner-cache-"));
  const githubEnvironmentFile = path.join(workspaceRoot, "github-env.txt");
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(runnerToolCache, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspaceRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "scripts", "paddleocr-requirements.lock.txt"), "locked\n");
  let venvCreates = 0;
  const run = (_command, args) => {
    if (args[0] === "-m" && args[1] === "venv") {
      venvCreates += 1;
      const executable = pythonInVenv(args[2]);
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, "python");
    }
    return { status: 0 };
  };
  const options = {
    workspaceRoot,
    runnerToolCache,
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64",
    githubEnvironmentFile,
    run
  };

  const first = bootstrapPaddleOcrRuntime(options);
  const second = bootstrapPaddleOcrRuntime(options);

  assert.equal(second, first);
  assert.equal(venvCreates, 1);
  assert.match(first, /common-tools[\\/]paddleocr-venv[\\/][a-f0-9]{64}[\\/](Scripts[\\/]python[.]exe|bin[\\/]python)$/u);
  assert.match(fs.readFileSync(githubEnvironmentFile, "utf8"), /SLIDECLONE_PADDLEOCR_PYTHON=/u);
});

test("PaddleOCR bootstrap keeps a valid cache completed by a concurrent run", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paddle-bootstrap-race-workspace-"));
  const runnerToolCache = fs.mkdtempSync(path.join(os.tmpdir(), "paddle-runner-race-cache-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(runnerToolCache, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspaceRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "scripts", "paddleocr-requirements.lock.txt"), "locked\n");
  let winnerPython;
  const run = (command, args) => {
    if (args[0] === "-m" && args[1] === "venv") {
      const executable = pythonInVenv(args[2]);
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, "candidate");
    }
    if (args[0] === "-c" && command.includes("-staging-") && !winnerPython) {
      const stagingDir = path.dirname(path.dirname(command));
      const marker = stagingDir.indexOf("-staging-");
      const winnerDir = stagingDir.slice(0, marker);
      winnerPython = pythonInVenv(winnerDir);
      fs.mkdirSync(path.dirname(winnerPython), { recursive: true });
      fs.writeFileSync(winnerPython, "winner");
    }
    return { status: 0 };
  };
  const resolved = bootstrapPaddleOcrRuntime({
    workspaceRoot,
    runnerToolCache,
    runtimeIdentity: "CPython|3.12.9|cpython-312|win-amd64",
    githubEnvironmentFile: "",
    run
  });

  assert.equal(resolved, winnerPython);
  assert.equal(fs.readFileSync(resolved, "utf8"), "winner");
});
