"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {validateDeckTemplateContext: validate} = require("../packages/slideclone-core/deck-template-context");
const {admitTemplateBuild} = require("../packages/slideclone-core/template-build-admission");
const context = {layoutIds: ["slideLayout1"], slideIndices: [0]};
test("template context preserves builder layout and source-slide semantics without mutation", () => {
  const pages = [{intent: {templateLayoutId: "SLIDELAYOUT1"}}, {preserveTemplateSlide: true, intent: {templateLayoutId: "ignored"}}];
  const before = JSON.stringify({pages, context});
  validate(pages, context);
  validate([{}, {intent: {templateLayoutId: "  "}}]);
  validate([]);
  assert.equal(JSON.stringify({pages, context}), before);
  for (const [page, pattern] of [
    [{preserveTemplateSlide: true}, /source slide/],
    [{intent: {templateLayoutId: "secret-layout"}}, /layout is unavailable/]
  ]) assert.throws(() => validate([page]), pattern);
  assert.throws(() => validate([{pageIndex: 1, preserveTemplateSlide: true}], context), /source slide/);
  assert.throws(() => validate([{intent: {templateLayoutId: " slideLayout1 "}}], context), /layout is unavailable/);
});
test("template context rejects malformed and extreme boundaries with safe errors", () => {
  for (const pages of [null, {}, [null], [{pageIndex: -1}], [{pageIndex: 10000}], [{preserveTemplateSlide: "true"}], [{intent: []}], [{intent: {templateLayoutId: 1}}], Array(51).fill({})]) {
    assert.throws(() => validate(pages), /context is invalid/);
  }
  validate(Array(50).fill({}));
  for (const bad of [{}, {layoutIds: [], slideIndices: [0]}, {layoutIds: ["x", "X"], slideIndices: [0]}, {layoutIds: ["x"], slideIndices: [0, 0]}, {layoutIds: ["x"], slideIndices: [10000]}, {layoutIds: ["x".repeat(513)], slideIndices: [0]}]) {
    assert.throws(() => validate([{}], bad), /context is invalid/);
  }
});
function fixture(t, pages = [{}]) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "template-admission-"));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  const deckFile = path.join(cwd, "deck.json");
  fs.writeFileSync(deckFile, JSON.stringify({pages}));
  return {cwd, deckFile, executable: process.execPath, builderArgs: [], timeoutMs: 120000, isCancellationRequested: () => false};
}
test("build admission skips inspection without a template and blocks template-only requests", async t => {
  const input = fixture(t);
  const dependencies = {runProcess: async () => {throw new Error("must not spawn");}};
  await admitTemplateBuild(input, dependencies);
  fs.writeFileSync(input.deckFile, JSON.stringify({pages: [{preserveTemplateSlide: true}]}));
  await assert.rejects(admitTemplateBuild(input, dependencies), /source slide/);
});
test("build admission inspects actual configured template with bounded process output", async t => {
  const input = fixture(t, [{intent: {templateLayoutId: "slideLayout1"}}]);
  input.builderArgs = ["builder.dll", "--TEMPLATE-PPTX", "template.pptx"];
  const before = fs.readFileSync(input.deckFile);
  let calls = 0;
  await admitTemplateBuild(input, {runProcess: async (exe, args, options) => {
    calls++;
    assert.equal(exe, input.executable);
    assert.deepEqual(args, [...input.builderArgs, "--inspect-template", "template.pptx"]);
    assert.equal(options.timeout, 60000);
    assert.equal(options.maxBuffer, 1048576);
    return {stdout: JSON.stringify(context)};
  }});
  assert.equal(calls, 1);
  assert.deepEqual(fs.readFileSync(input.deckFile), before);
  for (const stdout of ["null", "not-json secret", "{}", "x".repeat(1048577)]) {
    await assert.rejects(admitTemplateBuild(input, {runProcess: async () => ({stdout})}), /editable deck template (inspection failed|context is invalid)/);
  }
  await assert.rejects(admitTemplateBuild(input, {runProcess: async () => {throw new Error("token-secret");}}), {message: "editable deck template inspection failed"});
});
test("build admission rejects invalid arguments, files, and cancellation before work", async t => {
  const input = fixture(t);
  for (const args of [["--template-pptx"], ["--template-pptx", " "], ["--template-pptx", "a", "--TEMPLATE-PPTX", "b"], ["--inspect-template", "a"], ["--template-pptx", "--out"], ["x\0y"]]) {
    await assert.rejects(admitTemplateBuild({...input, builderArgs: args}), /inspection failed/);
  }
  await assert.rejects(admitTemplateBuild({...input, deckFile: path.join(input.cwd, "missing")}), /inspection failed/);
  await assert.rejects(admitTemplateBuild({...input, isCancellationRequested: () => true}), /cancelled/);
  fs.writeFileSync(input.deckFile, "secret-invalid-json");
  await assert.rejects(admitTemplateBuild(input), {message: "editable deck template inspection failed"});
  fs.truncateSync(input.deckFile, 32 * 1024 * 1024 + 1);
  await assert.rejects(admitTemplateBuild(input), /inspection failed/);
});
