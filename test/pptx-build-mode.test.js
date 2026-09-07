"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {resolvePptxBuildMode} = require("../packages/slideclone-core/pptx-build-mode");
test("build mode does not invoke configuration getters or coercion", () => {
  let invoked = false;
  const unsafe = {toString() {invoked = true; return "openxml";}};
  assert.throws(() => resolvePptxBuildMode({pptxEngine: unsafe}), /build options are invalid/);
  const accessor = Object.defineProperty({}, "pptxEngine", {get() {invoked = true; return "openxml";}});
  assert.throws(() => resolvePptxBuildMode(accessor), /build options are invalid/);
  assert.equal(invoked, false);
});
test("build mode keeps valid routing and aliases while rejecting invalid scalar boundaries", () => {
  assert.equal(resolvePptxBuildMode().engine, "python");
  assert.equal(resolvePptxBuildMode({pptxEngine: "dotnet"}).engine, "openxml");
  assert.equal(resolvePptxBuildMode({"openxml-batch": "true"}).openXmlBatch, true);
  assert.equal(resolvePptxBuildMode({openXmlBuildCache: false}).openXmlBuildCache, false);
  assert.equal(resolvePptxBuildMode({powerPointSafe: "0"}).powerPointSafe, false);
  assert.equal(resolvePptxBuildMode({openXmlBuildConcurrency: 4}).openXmlBuildConcurrency, 4);
  for (const options of [null, [], "x", {pptxEngine: "x\0y"}, {pptxEngine: "x".repeat(32769)}, {openXmlBuildConcurrency: Infinity}]) {
    assert.throws(() => resolvePptxBuildMode(options), {message: "PPTX build options are invalid"});
  }
  assert.doesNotThrow(() => resolvePptxBuildMode({pptxEngine: "x".repeat(32768)}));
});
