"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { attachNativeLineEndsToArcShapes, attachNativeLineEndsToPptx } = require("../skills/pd-hifi-slideclone/scripts/lib/arc-line-end-ooxml");
const { readZipEntryText, writeStoredZipAtomic } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

function arc(name, lineExtra = "") {
  return "<p:sp><p:nvSpPr><p:cNvPr id=\"1\" name=\"" + name
    + "\"/></p:nvSpPr><p:spPr><a:prstGeom prst=\"arc\"><a:avLst/></a:prstGeom>"
    + "<a:ln w=\"100\">" + lineExtra + "</a:ln></p:spPr></p:sp>";
}

test("attaches an editable native arrowhead to each named arc", () => {
  const result = attachNativeLineEndsToArcShapes({
    xml: "<p:sld>" + arc("cycle-a") + arc("cycle-b") + "</p:sld>",
    shapeNames: ["cycle-a", "cycle-b"],
  });
  assert.equal(result.modifiedCount, 2);
  assert.equal((result.xml.match(/<a:tailEnd type="triangle" w="med" len="med" \/>/gu) || []).length, 2);
});

test("supports the native start endpoint and bounded line-end styles", () => {
  const result = attachNativeLineEndsToArcShapes({
    xml: "<p:sld>" + arc("feedback") + "</p:sld>",
    shapeNames: ["feedback"],
    end: "head",
    type: "stealth",
    width: "sm",
    length: "lg",
  });
  assert.match(result.xml, /<a:headEnd type="stealth" w="sm" len="lg" \/>/u);
});

test("matches XML-escaped names without crossing into a different shape", () => {
  const rawName = "R&D \"cycle\"";
  const nonArc = arc("not-an-arc").replace('prst="arc"', 'prst="rect"').replace('name="not-an-arc"', 'name="R&amp;D &quot;cycle&quot;"');
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: nonArc + arc("later"), shapeNames: [rawName] }), /named arc shape/u);
  const result = attachNativeLineEndsToArcShapes({ xml: arc("R&amp;D &quot;cycle&quot;"), shapeNames: [rawName] });
  assert.equal(result.modifiedCount, 1);
});

test("rejects malformed, ambiguous, duplicate, and already-patched input", () => {
  assert.throws(() => attachNativeLineEndsToArcShapes(null), /must be an object/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: "", shapeNames: ["x"] }), /non-empty/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: arc("x"), shapeNames: [] }), /between 1 and 100/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: arc("x"), shapeNames: ["x", "x"] }), /duplicate/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: arc("x") + arc("x"), shapeNames: ["x"] }), /exactly one/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({
    xml: arc("x", "<a:tailEnd type=\"triangle\"/>"),
    shapeNames: ["x"],
  }), /already contains/u);
  assert.throws(() => attachNativeLineEndsToArcShapes({ xml: arc("x"), shapeNames: ["x"], type: "unsafe" }), /type is invalid/u);
});

test("patches bounded PPTX slide entries without overwriting the source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arc-line-end-pptx-"));
  const source = path.join(root, "source.pptx");
  const output = path.join(root, "output.pptx");
  writeStoredZipAtomic(source, [
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/slides/slide1.xml", data: Buffer.from("<p:sld>" + arc("cycle-a") + "</p:sld>") },
  ]);
  const result = attachNativeLineEndsToPptx({ sourcePptx: source, outputPptx: output, slides: [{ slideNumber: 1, shapeNames: ["cycle-a"] }] });
  assert.deepEqual({ modifiedSlides: result.modifiedSlides, modifiedShapes: result.modifiedShapes }, { modifiedSlides: 1, modifiedShapes: 1 });
  assert.doesNotMatch(readZipEntryText(source, "ppt/slides/slide1.xml"), /tailEnd/u);
  assert.match(readZipEntryText(output, "ppt/slides/slide1.xml"), /<a:tailEnd type="triangle"/u);
  assert.throws(() => attachNativeLineEndsToPptx({ sourcePptx: source, outputPptx: source, slides: [{ slideNumber: 1, shapeNames: ["cycle-a"] }] }), /must not overwrite/u);
  assert.throws(() => attachNativeLineEndsToPptx({ sourcePptx: source, outputPptx: path.join(root, "missing.pptx"), slides: [{ slideNumber: 2, shapeNames: ["cycle-a"] }] }), /was not found/u);
  assert.throws(() => attachNativeLineEndsToPptx({ sourcePptx: path.join(root, "absent.pptx"), outputPptx: path.join(root, "new.pptx"), slides: [{ slideNumber: 1, shapeNames: ["cycle-a"] }] }), /source is unavailable/u);
});
