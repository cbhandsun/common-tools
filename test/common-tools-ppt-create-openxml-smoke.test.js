"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { parsePresentationSpec } = require("../packages/ppt-create-core/spec");
const { buildPptx } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

test("ppt-create OpenXML output contains native editable content without raster media", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-create-openxml-"));
  try {
    const input = fs.readFileSync(path.join(__dirname, "fixtures", "ppt-create", "basic.presentation.json"));
    const ir = createDeckIr(parsePresentationSpec(input));
    const irFile = path.join(root, "deck.ir.json");
    const outFile = path.join(root, "deck.pptx");
    fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    buildPptx({ irFile, outFile });

    const entries = listZipEntries(outFile).map((entry) => entry.name);
    assert.deepEqual(entries.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(), ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml"]);
    assert.equal(entries.some((name) => /^ppt\/media\//.test(name)), false);
    const slide = readZipEntry(outFile, "ppt/slides/slide2.xml").toString("utf8");
    assert.match(slide, /Verified outputs/);
    assert.match(slide, /Text and shapes remain native/);
    assert.match(slide, /<p:sp>/);
    assert.doesNotMatch(slide, /<p:pic>/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
