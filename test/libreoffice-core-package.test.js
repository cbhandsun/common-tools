"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("renderer loads from core alone and its process adapter runs without Skill sources", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libreoffice-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  const modules = ["render-libreoffice", "renderer-process", "libreoffice-tools", "image-size"];
  for (const file of ["package.json", ...modules.map((name) => `${name}.js`)]) fs.copyFileSync(path.join(__dirname, "../packages/slideclone-core", file), path.join(installed, file));
  const load = createRequire(path.join(root, "consumer.cjs"));
  const renderer = load("@common-tools/slideclone-core/render-libreoffice");
  const tools = load("@common-tools/slideclone-core/libreoffice-tools");
  const { run } = load("@common-tools/slideclone-core/renderer-process");
  assert.deepEqual(await renderer({}, {}), { ok: false, error: "pptx.pptxFile is required for render-libreoffice" });
  assert.equal(tools.resolveLibreOffice("controlled-soffice"), "controlled-soffice");
  assert.equal(tools.resolvePdfToPpm("controlled-pdftoppm"), "controlled-pdftoppm");
  assert.equal((await run(process.execPath, ["-e", "process.stdout.write('ready')"], { timeout: 10000 })).stdout, "ready");
  await assert.rejects(run(process.execPath, ["-e", "process.exit(3)"], { timeout: 10000 }));
  if (process.platform === "win32") {
    const wrapper = path.join(root, "renderer wrapper.cmd");
    fs.writeFileSync(wrapper, "@echo off\r\necho [%~1]\r\n");
    assert.equal((await run(wrapper, ["value with spaces"], { timeout: 10000 })).stdout.trim(), "[value with spaces]");
    await assert.rejects(async () => run(wrapper, ["value & echo injected"]), /batch arguments are invalid/);
  }
  const input = path.join(root, "deck.pptx");
  fs.writeFileSync(input, "fixture");
  const staged = renderer._private.stageLibreOfficeConversion(input, root);
  try { assert.equal(fs.readFileSync(staged.pptxFile, "utf8"), "fixture"); }
  finally { renderer._private.cleanupStagedConversion(staged); }
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  for (const name of modules.slice(0, 3)) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`));
});

test("renderer command planning bounds batch syntax while preserving native argument arrays", () => {
  const { commandPlan } = require("../packages/slideclone-core/renderer-process");
  const native = commandPlan("tool.exe", ["a & b", "%PATH%"], "win32");
  assert.deepEqual(native.args, ["a & b", "%PATH%"]);
  assert.equal(native.windowsVerbatimArguments, false);
  assert.deepEqual(commandPlan("tool.cmd", ["space value"], "linux").args, ["space value"]);
  for (const value of ["a&b", "%PATH%", "!value!", "a\nb", 'a"b', "a|b", "a>b", "a<b", "a^b"]) assert.throws(() => commandPlan("tool.cmd", [value], "win32"), /batch arguments/);
  for (const args of [null, "value", [1], ["\0"], new Array(257).fill("x")]) assert.throws(() => commandPlan("tool.exe", args, "win32"), /command is invalid/);
});

test("renderer termination uses taskkill to stop the complete Windows process tree", () => {
  const { _private } = require("../packages/slideclone-core/renderer-process");
  const calls = [];
  _private.terminateProcessTree({ pid: 4321 }, "win32", (...args) => { calls.push(args); return { status: 0 }; });
  assert.deepEqual(calls, [["taskkill.exe", ["/pid", "4321", "/t", "/f"], { windowsHide: true, stdio: "ignore" }]]);
  assert.throws(() => _private.terminateProcessTree({ pid: 4321 }, "win32", () => ({ status: 1 })), /process tree/);
});

test("legacy rendering and benchmark entry points share the core implementation", () => {
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice"), require("../packages/slideclone-core/render-libreoffice"));
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/exec"), require("../packages/slideclone-core/renderer-process"));
  const benchmark = require("../skills/pd-hifi-slideclone/scripts/libreoffice-benchmark");
  const tools = require("../packages/slideclone-core/libreoffice-tools");
  for (const name of ["fileUrl", "resolveLibreOffice", "resolvePdfToPpm"]) assert.equal(benchmark[name], tools[name]);
  assert.equal(require("../scripts/verify-workspace-boundaries").verifyWorkspaceBoundaries().legacyEdges.some((edge) => edge.target.endsWith("/render-libreoffice.js")), false);
});


test("renderer process bounds output and timeout with safe startup errors", async () => {
  const { run } = require("../packages/slideclone-core/renderer-process");
  assert.deepEqual(await run(process.execPath, ["-e", ""]), { stdout: "", stderr: "" });
  await assert.rejects(run("missing-renderer-executable-fixture", []), /could not start/);
  for (const options of [{ timeout: -1 }, { timeout: Infinity }, { maxBuffer: 0 }, { maxBuffer: NaN }]) {
    assert.throws(() => run(process.execPath, [], options), /limits are invalid/);
  }
  for (const stream of ["stdout", "stderr"]) {
    await assert.rejects(run(process.execPath, ["-e", "process." + stream + ".write('x'.repeat(10000));setInterval(()=>{},1000)"], { maxBuffer: 100, timeout: 3000 }), (error) => {
      assert.match(error.message, /exceeds limits/);
      assert.ok(error.stdout.length <= 100 && error.stderr.length <= 100);
      return true;
    });
  }
  await assert.rejects(run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 100 }), /timed out/);
});


test("renderer stops active work and aborts retry and file waits on cancellation", async () => {
  const { run } = require("../packages/slideclone-core/renderer-process");
  const { runWithRetry, waitForStableFile } = require("../packages/slideclone-core/render-libreoffice")._private;
  for (const check of [async () => true, async () => { throw new Error("private-check-error"); }]) {
    await assert.rejects(run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 5000, isCancellationRequested: check }), /editable job was cancelled/);
    await assert.rejects(waitForStableFile("missing-file", { timeoutMs: 5000, isCancellationRequested: check }), /editable job was cancelled/);
  }
  let calls = 0;
  await assert.rejects(runWithRetry(process.execPath, ["-e", "process.stderr.write('permission denied');process.exit(1)"], {
    retries: 3, retryDelayMs: 5000, timeout: 3000,
    isCancellationRequested: async () => ++calls >= 3
  }), /editable job was cancelled/);
  assert.equal(calls, 3, "cancels during retry delay without starting another attempt");
});

test("renderer synchronous startup failures do not expose environment or working directory values", async () => {
  const { run } = require("../packages/slideclone-core/renderer-process");
  for (const options of [
    { env: { RENDERER_TEST_SECRET: "private-env-marker\0" } },
    { cwd: "private-directory-marker\0" }
  ]) {
    await assert.rejects(run(process.execPath, ["-e", ""], options), (error) => {
      assert.equal(error.message, "renderer process could not start");
      assert.equal(error.stdout, "");
      assert.equal(error.stderr, "");
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(error.stack + JSON.stringify(error), /private-env-marker|private-directory-marker|RENDERER_TEST_SECRET/);
      return true;
    });
  }
});

test("renderer cancellation terminates a live descendant before reporting completion", async (t) => {
  const { run } = require("../packages/slideclone-core/renderer-process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "renderer-tree-"));
  const marker = path.join(root, "child.json");
  t.after(() => {
    if (fs.existsSync(marker)) {
      const { pid } = JSON.parse(fs.readFileSync(marker, "utf8"));
      try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const descendant = path.join(root, "descendant.cjs");
  fs.writeFileSync(descendant, "require('node:fs').writeFileSync(process.argv[2],JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);");
  const source = `const {spawn}=require('node:child_process');
    spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:'inherit',windowsHide:true});
    setInterval(()=>{},1000);`;
  const script = path.join(root, "parent.cjs");
  fs.writeFileSync(script, source);
  await assert.rejects(run(process.execPath, [script, descendant, marker], {
    timeout: 10000, isCancellationRequested: () => fs.existsSync(marker)
  }), /editable job was cancelled/);
  const { pid } = JSON.parse(fs.readFileSync(marker, "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal((await run(process.execPath, ["-e", "process.stdout.write('recovered')"], { timeout: 5000 })).stdout, "recovered");
});
