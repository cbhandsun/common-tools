"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");
const { coreModulePath } = require("./helpers/isolated-core-package.cjs");
const { writeStoredZipAtomic } = require("../packages/ooxml-core/pptx-zip");

test("renderer loads from core alone and its process adapter runs without Skill sources", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libreoffice-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  const modules = ["render-libreoffice", "renderer-process", "libreoffice-tools", "image-size", "presentation-frame", "slide-size", "libreoffice-grouped-text-connections", "libreoffice-gradient-evidence", "libreoffice-connector-evidence", "libreoffice-native-tracks"];
  const ooxml = path.join(root, "node_modules/@common-tools/ooxml-core");
  fs.mkdirSync(ooxml, { recursive: true });
  for (const file of ["package.json", "pptx-zip.js"]) fs.copyFileSync(path.join(__dirname, "../packages/ooxml-core", file), path.join(ooxml, file));
  for (const file of ["package.json", ...modules.map(coreModulePath), "python/libreoffice_native_plan.py", "python/libreoffice_native_render.py"]) {
    const target = path.join(installed, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "../packages/slideclone-core", file), target);
  }
  const load = createRequire(path.join(root, "consumer.cjs"));
  const renderer = load("@common-tools/slideclone-core/render-libreoffice");
  const tools = load("@common-tools/slideclone-core/libreoffice-tools");
  const { run } = load("@common-tools/slideclone-core/renderer-process");
  assert.deepEqual(await renderer({}, {}), { ok: false, error: "pptx.pptxFile is required for render-libreoffice" });
  assert.equal(tools.resolveLibreOffice("controlled-soffice"), "controlled-soffice");
  assert.equal(tools.resolvePdfToPpm("controlled-pdftoppm"), "controlled-pdftoppm");
  assert.equal(tools.resolvePdfToText("controlled-pdftotext"), "controlled-pdftotext");
  assert.equal(tools.resolvePdfToText(undefined,{environment:{PDFTOTEXT_BIN:"configured-pdftotext"},platform:"linux"}),"configured-pdftotext");
  assert.equal((await run(process.execPath, ["-e", "process.stdout.write('ready')"], { timeout: 10000 })).stdout, "ready");
  await assert.rejects(run(process.execPath, ["-e", "process.exit(3)"], { timeout: 10000 }));
  if (process.platform === "win32") {
    const wrapper = path.join(root, "renderer wrapper.cmd");
    fs.writeFileSync(wrapper, "@echo off\r\necho [%~1]\r\n");
    assert.equal((await run(wrapper, ["value with spaces"], { timeout: 10000 })).stdout.trim(), "[value with spaces]");
    await assert.rejects(async () => run(wrapper, ["value & echo injected"]), /batch arguments are invalid/);
  }
  const input = path.join(root, "deck.pptx");
  writeStoredZipAtomic(input, [{ name: "ppt/presentation.xml", data: '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="9144000" cy="6858000" /></p:presentation>' },
    { name: "ppt/slides/slide1.xml", data: '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spPr><a:ln xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:gradFill/></a:ln></p:spPr></p:sld>' }]);
  const inputBytes = fs.readFileSync(input);
  const staged = renderer._private.stageLibreOfficeConversion(input, root);
  try {
    assert.deepEqual(fs.readFileSync(staged.pptxFile), inputBytes);
    assert.deepEqual(staged.compatibility.gradientStrokeEvidence, {
      status: "requires-office-verification", gradientStrokes: 1, unverifiedSlides: 0,
      paintRewritten: false, officeFidelityVerified: false
    });
  }
  finally { renderer._private.cleanupStagedConversion(staged); }
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  for (const name of modules.slice(0, 3)) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`));
  assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes("packages/slideclone-core/archetypes/presentation-frame.js"));
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
  const child = { pid: 4321, kill: () => assert.fail("successful tree termination must not kill the parent first") };
  _private.terminateProcessTree(child, "win32", (...args) => { calls.push(args); return { status: 0 }; });
  assert.deepEqual(calls, [["taskkill.exe", ["/pid", "4321", "/t", "/f"], { windowsHide: true, stdio: "ignore" }]]);
  const order=[];
  const failingChild={pid:4321,kill:signal=>{order.push(signal);return true;}};
  assert.throws(() => _private.terminateProcessTree(failingChild, "win32", () => {order.push("tree");return { status: 1 };}), /process tree/);
  assert.deepEqual(order,["tree","SIGKILL"]);
  const spawnError=Object.assign(new Error("taskkill unavailable"),{code:"ENOENT"});
  assert.throws(()=>_private.terminateProcessTree(failingChild,"win32",()=>({error:spawnError,status:null})),error=>error===spawnError);
  _private.terminateProcessTree(child,"win32",()=>({status:128}));
  _private.terminateProcessTree({pid:undefined,kill:()=>assert.fail("absent pid")},"win32",()=>assert.fail("absent pid"));
});

test("renderer shutdown and close share one tree termination in either order", () => {
  const { _private } = require("../packages/slideclone-core/renderer-process");
  for (const order of [["stop", "close"], ["close", "stop"]]) {
    let calls = 0;
    const terminate = _private.createProcessTreeTerminator({ pid: 4321 }, child => {
      assert.equal(child.pid, 4321); calls++;
    });
    for (const event of order) { assert.ok(event); terminate(); }
    assert.equal(calls, 1);
  }
});

test("renderer repeated shutdown preserves the first tree termination failure", () => {
  const { _private } = require("../packages/slideclone-core/renderer-process");
  let treeCalls = 0, parentCalls = 0;
  const child = { pid: 4321, kill: () => { parentCalls++; return true; } };
  const terminate = _private.createProcessTreeTerminator(child, value => _private.terminateProcessTree(value, "win32", () => {
    treeCalls++; return { status: 1 };
  }));
  let first;
  assert.throws(terminate, error => { first = error; assert.match(error.message, /process tree/u); return true; });
  assert.throws(terminate, error => error === first);
  assert.equal(treeCalls, 1);
  assert.equal(parentCalls, 1);
});

test("legacy rendering and benchmark entry points share the core implementation", () => {
  assert.equal(require("../packages/slideclone-native-engine/scripts/adapters/render-libreoffice"), require("../packages/slideclone-core/render-libreoffice"));
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/exec"), require("../packages/slideclone-core/renderer-process"));
  const benchmark = require("../packages/slideclone-native-engine/scripts/libreoffice-benchmark");
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

test("renderer waits for queued close after a slow synchronous tree termination", async () => {
  const { rendererProcessHarness, flushMicrotasks } = require("./helpers/renderer-process-harness.cjs");
  for (const trigger of ["cancel", "check-error", "timeout", "stdout", "stderr"]) {
    const f = rendererProcessHarness({ killMs: 6000 });
    const options = { maxBuffer: 1, timeout: trigger === "timeout" ? 100 : 0 };
    if (trigger === "cancel") options.isCancellationRequested = () => true;
    if (trigger === "check-error") options.isCancellationRequested = () => { throw new Error("private-cancellation-marker"); };
    const pending = f.run("renderer.exe", [], options);
    const expected = trigger === "timeout" ? /timed out/ : /^(?:editable job was cancelled|renderer (?:stdout|stderr) exceeds limits)$/;
    const rejected = assert.rejects(pending, error => {
      assert.match(error.message, expected);
      assert.doesNotMatch(error.stack + JSON.stringify(error), /private-cancellation-marker/);
      return true;
    });
    if (trigger === "timeout") f.tick(100);
    if (trigger === "stdout" || trigger === "stderr") f.child[trigger].emit("data", Buffer.from("xx"));
    await flushMicrotasks();
    // A timer phase may run before the already queued close event.
    f.dispatchTimers(); f.dispatchIo();
    await rejected;
    assert.equal(f.stats().treeCalls, 1);
    assert.equal(f.stats().parentCalls, 0);
    assert.equal(f.stats().pendingTimers, 0);
  }
});

test("renderer still rejects an unconfirmed close at the existing confirmation deadline", async () => {
  const { rendererProcessHarness, flushMicrotasks } = require("./helpers/renderer-process-harness.cjs");
  const f = rendererProcessHarness({ killMs: 6000, closeOnKill: false });
  let settled = false;
  const pending = f.run("renderer.exe", [], { isCancellationRequested: () => true });
  const rejected = assert.rejects(pending, /renderer process termination was not confirmed/).then(() => { settled = true; });
  await flushMicrotasks();
  f.tick(4999); await flushMicrotasks();
  assert.equal(settled, false);
  f.tick(1); await rejected;
  assert.equal(f.stats().now, 11000);
  assert.equal(f.stats().pendingTimers, 0);
  f.child.emit("close", null, "SIGKILL");
  assert.equal(f.stats().treeCalls, 1);
});

test("renderer preserves a tree-termination failure even when the parent later closes", async () => {
  const { rendererProcessHarness, flushMicrotasks } = require("./helpers/renderer-process-harness.cjs");
  const f = rendererProcessHarness({ treeStatus: 1 });
  const pending = f.run("renderer.exe", [], { isCancellationRequested: () => true });
  const rejected = assert.rejects(pending, /renderer process termination was not confirmed/);
  await flushMicrotasks(); f.dispatchIo(); await rejected;
  assert.equal(f.stats().treeCalls, 1);
  assert.equal(f.stats().parentCalls, 1);
  assert.equal(f.stats().pendingTimers, 0);
});

test("renderer releases unconfirmed children and pipe handles while preserving failure", async () => {
  const { rendererProcessHarness, flushMicrotasks } = require("./helpers/renderer-process-harness.cjs");
  for (const trigger of ["timeout", "cancel", "stdout", "stderr", "startup"]) {
    const f = rendererProcessHarness({ closeOnKill: false });
    const options = { timeout: trigger === "timeout" ? 100 : 0, maxBuffer: 1 };
    if (trigger === "cancel") options.isCancellationRequested = () => true;
    const pending = f.run("renderer.exe", [], options);
    const rejected = assert.rejects(pending, trigger === "startup" ? /could not start/ : /termination was not confirmed/);
    if (trigger === "timeout") f.tick(100);
    if (trigger === "stdout" || trigger === "stderr") f.child[trigger].emit("data", Buffer.from("xx"));
    if (trigger === "startup") f.child.emit("error", new Error("private-startup-marker"));
    await flushMicrotasks();
    if (trigger !== "startup") f.tick(5000);
    await rejected;
    assert.equal(f.stats().unrefCalls, 1, trigger);
    assert.deepEqual(f.stats().destroyedStreams, ["stdout", "stderr"], trigger);
    assert.equal(f.stats().pendingTimers, 0, trigger);
    f.child.stdout.emit("data", Buffer.from("private-late-output"));
    f.child.emit("close", null, "SIGKILL");
    assert.equal(f.stats().unrefCalls, 1, "late close must not repeat handle cleanup");
    assert.equal(f.stats().treeCalls, 1);
  }
});

test("renderer successful close preserves complete output without failure cleanup", async () => {
  const { rendererProcessHarness } = require("./helpers/renderer-process-harness.cjs");
  const f = rendererProcessHarness();
  const pending = f.run("renderer.exe", [], {});
  f.child.stdout.emit("data", Buffer.from("complete"));
  f.child.emit("close", 0, null);
  const output = await pending;
  assert.equal(output.stdout, "complete");
  assert.equal(output.stderr, "");
  assert.equal(f.stats().unrefCalls, 0);
  assert.deepEqual(f.stats().destroyedStreams, []);
});
