"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { LAYOUT_REGISTRY } = require("../packages/ppt-create-core/layout-registry");
const { validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { THEME_REGISTRY } = require("../packages/ppt-create-core/theme-registry");
const { buildPptCreateBoundaryCases, buildPptCreateOfficeCorpus } = require("../scripts/lib/ppt-create-office-corpus");

const assetFile = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");

test("independent ppt-create corpus covers every theme and layout across Chinese, English, and mixed content", () => {
  const corpus = buildPptCreateOfficeCorpus(assetFile);
  const normalized = corpus.map((entry) => validatePresentationSpec(entry.spec));
  assert.equal(corpus.length, 4);
  assert.equal(normalized.reduce((sum, spec) => sum + spec.slides.length, 0), 30);
  assert.deepEqual(new Set(normalized.map((spec) => spec.theme)), new Set(THEME_REGISTRY.map((theme) => theme.id)));
  assert.deepEqual(new Set(normalized.flatMap((spec) => spec.slides.map((slide) => slide.layout))), new Set(LAYOUT_REGISTRY.map((layout) => layout.id)));
  assert.deepEqual(new Set(normalized.map((spec) => spec.language)), new Set(["zh-CN", "en-US", "zh-Hans"]));
  assert.ok(normalized.some((spec) => spec.assets.length === 1));
  assert.ok(normalized.flatMap((spec) => spec.slides).some((slide) => slide.visual?.kind === "table"));
  assert.ok(normalized.flatMap((spec) => spec.slides).some((slide) => slide.visual?.kind === "chart"));
  assert.ok(normalized.flatMap((spec) => spec.slides).some((slide) => slide.citations?.length && slide.speakerNotes));
  for (const spec of normalized) assert.equal(createDeckIr(spec).pages.length, spec.slides.length);
});

test("independent ppt-create corpus exercises accepted extremes and rejects empty, invalid, oversized, unsafe, and placeholder input", () => {
  const validSpec = buildPptCreateOfficeCorpus(assetFile)[0].spec;
  const cases = buildPptCreateBoundaryCases(validSpec);
  assert.deepEqual(cases.map((entry) => entry.id), ["maximum-capacity", "maximum-bounded-text", "empty-title", "invalid-role", "excessive-title", "excessive-capacity", "unsafe-control-character", "placeholder-content"]);
  for (const entry of cases) {
    if (entry.accepted) assert.doesNotThrow(() => validatePresentationSpec(entry.spec), entry.id);
    else assert.throws(() => validatePresentationSpec(entry.spec), undefined, entry.id);
  }
});
