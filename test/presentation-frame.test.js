"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { writeStoredZipAtomic } = require("../packages/ooxml-core/pptx-zip");
const { parsePresentationFrame, readPresentationRasterFrame } = require("../packages/slideclone-core/presentation-frame");
const ns = "http://schemas.openxmlformats.org/presentationml/2006/main";
const xml = (body = '<p:sldSz cx="7785100" cy="5803900"/>') => `<p:presentation xmlns:p="${ns}">${body}</p:presentation>`;

test("presentation frame reads namespaced and default namespace dimensions in physical points", () => {
  assert.deepEqual(parsePresentationFrame(xml()), { widthPt: 613, heightPt: 457 });
  assert.deepEqual(parsePresentationFrame(`<?xml version="1.0"?><presentation xmlns='${ns}'><!-- <sldSz/> --><sldSz cy='5803900' cx='7785100'></sldSz></presentation>`), { widthPt: 613, heightPt: 457 });
  assert.deepEqual(parsePresentationFrame(xml().replaceAll(ns, "http://purl.oclc.org/ooxml/presentationml/main")), { widthPt: 613, heightPt: 457 });
});

test("presentation frame rejects missing, ambiguous, malformed and hostile dimensions", () => {
  for (const value of [null, undefined, {}, "", " ", "x".repeat(1_048_577), xml(""), xml('<p:sldSz cx="0" cy="1"/>'), xml('<p:sldSz cx="-1" cy="1"/>'), xml('<p:sldSz cx="1e5" cy="1"/>'), xml('<p:sldSz cx="1270000001" cy="1"/>'), xml('<p:sldSz cx="1" cx="2" cy="1"/>'), xml('<p:sldSz cx="&secret;" cy="1"/>'), xml('<p:ext><p:sldSz cx="1" cy="1"/></p:ext>'), xml('<p:sldSz cx="1" cy="1"/><p:sldSz cx="1" cy="1"/>'), xml().replace(ns, "https://wrong.example"), xml().replace('</p:presentation>', '</other>'), xml() + xml(), '<!DOCTYPE a [<!ENTITY secret SYSTEM "file:///secret">]>' + xml(), xml('<![CDATA[<p:sldSz cx="1" cy="1"/>]]>'), xml('<p:sldSz xmlns:p="evil" cx="1" cy="1"/>'), xml('<p:sldSz cx="1"cy="1"/>'), xml('<p:sldSz cx="1" cy="1"/>text'), xml('<p:e>'.repeat(64) + '<p:sldSz cx="1" cy="1"/>' + '</p:e>'.repeat(64))]) {
    assert.throws(() => parsePresentationFrame(value), /presentation frame/i);
  }
});

test("raster frame binds actual PPT dimensions, validates DPI and keeps PNG capacity limits", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "presentation-frame-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pptx = path.join(root, "deck.pptx");
  writeStoredZipAtomic(pptx, [{ name: "ppt/presentation.xml", data: xml() }]);
  assert.deepEqual(readPresentationRasterFrame(pptx, "144", { widthPt: 613, heightPt: 457 }), { widthPx: 1226, heightPx: 914 });
  assert.deepEqual(readPresentationRasterFrame(pptx, 72), { widthPx: 613, heightPx: 457 });
  const { createRenderCacheIdentity, sameRenderCacheIdentity } = require("../packages/slideclone-native-engine/scripts/lib/render-cache-metadata");
  const identity = createRenderCacheIdentity({ pptxFile: pptx, renderer: "libreoffice", expectedPages: 1 });
  assert.equal(sameRenderCacheIdentity(identity, { ...identity, provider: "slideclone-render-cache-v1" }), false, "legacy rounded-DPI rasters must not be reused");
  for (const dpi of [0, -1, NaN, Infinity, {}, null, "", "--evil", "1e6", 0.001, 1e6]) assert.throws(() => readPresentationRasterFrame(pptx, dpi), /DPI|boundary/);
  for (const size of [null, {}, { widthPt: 612, heightPt: 457 }, { widthPt: 613, heightPt: 458 }]) assert.throws(() => readPresentationRasterFrame(pptx, 144, size), /mismatch/);
  assert.throws(() => readPresentationRasterFrame(path.join(root, "absent.pptx"), 144));
  writeStoredZipAtomic(pptx, [{ name: "other.xml", data: xml() }]);
  assert.throws(() => readPresentationRasterFrame(pptx, 144), /frame XML/);
  writeStoredZipAtomic(pptx, [{ name: "ppt/presentation.xml", data: xml('<p:sldSz cx="1270000000" cy="1270000000"/>') }]);
  assert.throws(() => readPresentationRasterFrame(pptx, 72), /boundary/);
});
