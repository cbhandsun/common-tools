"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const deliverySmoke = require("../skills/pd-hifi-slideclone/scripts/ir-delivery-smoke");

test("ir delivery smoke selects the requested local render engine", () => {
  const root = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone");
  const { resolveRenderAdapter } = deliverySmoke._private;

  assert.equal(typeof resolveRenderAdapter("powerpoint", root), "function");
  assert.equal(typeof resolveRenderAdapter("libreoffice", root), "function");
  assert.throws(() => resolveRenderAdapter("remote", root), /Unsupported --renderer/);
});

test("ir delivery candidate search disables repeat OCR unless explicitly requested", () => {
  const { contextForSearch } = deliverySmoke._private;
  const context = { config: { textOcr: { enabled: true } } };
  const explicitContext = { config: { searchTextOcr: true, textOcr: { enabled: true } } };

  assert.equal(contextForSearch(context).config.textOcr.enabled, false);
  assert.equal(contextForSearch(explicitContext), explicitContext);
});

test("text adjustment final verification remains enabled when normal candidate search skips OCR", () => {
  const { contextForSearch } = deliverySmoke._private;
  const source = { config: { textOcr: { enabled: true } } };

  assert.equal(contextForSearch(source).config.textOcr.enabled, false);
  assert.equal(source.config.textOcr.enabled, true);
});
