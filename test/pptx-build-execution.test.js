"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPptxBuildExecutor,
  normalizePptxBuildJobs,
  normalizeBuildTemplatePptx,
  shouldRunPowerPointOpenGate
} = require("../packages/slideclone-core/pptx-build-execution");

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-build-execution-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const calls = [];
  return {
    root, calls,
    executor: createPptxBuildExecutor({
      skillRoot: path.join(root, "skill"), projectRoot: root,
      spawnSync(command, args, options) { calls.push({ command, args, options }); return { status: 0 }; },
      buildOpenXmlDecksSync(jobs, context, builderDirectory, mode) { calls.push({ jobs, context, builderDirectory, mode }); return jobs.map((job) => job.outFile); },
      ...overrides
    })
  };
}

test("normalizes only bounded concrete PPTX jobs without mutating source jobs", t => {
  const { root } = fixture(t);
  const source = { irFile: path.join(root, "in.json"), outFile: path.join(root, "out.pptx") };
  const jobs = normalizePptxBuildJobs([source]);
  assert.notEqual(jobs[0], source);
  assert.equal(source.templatePptx, undefined);
  assert.equal(jobs[0].templatePptx, "");
  assert.throws(() => normalizePptxBuildJobs({}), /jobs are invalid/);
  assert.throws(() => normalizePptxBuildJobs([{ irFile: "a", outFile: "b\0c" }]), /requires irFile and outFile/);
  assert.throws(() => normalizePptxBuildJobs([{ irFile: " ", outFile: "x" }]), /requires irFile and outFile/);
  assert.deepEqual(normalizePptxBuildJobs([]), []);
  assert.throws(() => normalizePptxBuildJobs(Array(1001).fill(source)), /1000 job/);
  assert.throws(() => normalizePptxBuildJobs([{...source, irFile: "x".repeat(32769)}]), /requires irFile/);
  let accessed = false;
  const getter = Object.defineProperty({...source}, "privateTag", {enumerable: true, get() {accessed = true; throw new Error("private");}});
  assert.throws(() => normalizePptxBuildJobs([getter]), /accessor fields/);
  assert.equal(accessed, false);
  const tagged = JSON.parse(JSON.stringify({...source, tag: "retained"}));
  Object.defineProperty(tagged, "__proto__", {value: {polluted: true}, enumerable: true});
  const normalized = normalizePptxBuildJobs([tagged])[0];
  assert.equal(normalized.tag, "retained");
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(normalized.polluted, undefined);
});

test("validates template files and preserves PowerPoint gate behavior", t => {
  const { root } = fixture(t);
  const template = path.join(root, "template.pptx"); fs.writeFileSync(template, "template");
  assert.equal(normalizeBuildTemplatePptx(template, 0), template);
  assert.throws(() => normalizeBuildTemplatePptx("\0", 0), /invalid templatePptx/);
  assert.equal(shouldRunPowerPointOpenGate({}, { engine: "openxml" }), true);
  assert.equal(shouldRunPowerPointOpenGate({}, { engine: "python" }), false);
  assert.equal(shouldRunPowerPointOpenGate({ "powerpoint-open-gate": "false" }, { engine: "openxml" }), false);
});

test("dispatches Python builds through a bounded hidden child process and keeps failures private", t => {
  const { root, calls, executor } = fixture(t);
  executor.buildPptx(path.join(root, "deck.json"), path.join(root, "deck.pptx"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], path.join(root, "skill", "scripts", "python", "build_pptx.py"));
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.timeout, 120_000);
  assert.equal(calls[0].options.maxBuffer, 1024 * 1024);
  const failed = fixture(t, { spawnSync() { return { status: 1, stderr: "secret", stdout: "input path" }; } });
  assert.throws(() => failed.executor.buildPptx("private-ir", "private-out"), (error) => error.message === "PPTX Python build failed");
  const thrown = fixture(t, {spawnSync() {throw new Error("secret-token");}});
  assert.throws(() => thrown.executor.buildPptx("private-ir", "private-out"), {message: "PPTX Python build failed"});
  assert.throws(() => executor.buildPptx("bad\0file", "out"), /requires irFile/);
  assert.equal(calls.length, 1);
});

test("dispatches OpenXML jobs with composition context and does not mutate template input", t => {
  const { root, calls, executor } = fixture(t);
  const template = path.join(root, "template.pptx"); fs.writeFileSync(template, "template");
  const source = { irFile: path.join(root, "deck.json"), outFile: path.join(root, "deck.pptx"), templatePptx: template };
  assert.deepEqual(executor.buildPptxBatch([source], { "pptx-engine": "openxml", "openxml-build-cache-max-bytes": "42" }), [source.outFile]);
  assert.equal(source.templatePptx, template);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.skillRoot, path.join(root, "skill"));
  assert.equal(calls[0].context.config.openXmlBuilder.cacheMaxBytes, 42);
  assert.equal(calls[0].context.configFile, path.join(process.cwd(), "slideclone.config.json"));
  assert.equal(fs.readFileSync(template, "utf8"), "template");
  assert.equal(calls[0].builderDirectory, path.join(root, "skill", "dotnet", "OpenXmlDeckBuilder"));
});
