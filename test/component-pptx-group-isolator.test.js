"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { readZipEntryText } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");
const {
  isolatePptxComponentGroup,
  isolateSlideXmlGroup
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-pptx-group-isolator");

const SLIDE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" showMasterSp="1">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr></p:sp>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Roadmap A"/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="6" name="Node A"/></p:nvSpPr></p:sp></p:grpSp>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="Cycle B"/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="10" name="Node B"/></p:nvSpPr></p:sp></p:grpSp>
  </p:spTree></p:cSld>
</p:sld>`;

test("component group isolator retains only the selected top-level group", () => {
  const result = isolateSlideXmlGroup(SLIDE_XML, 1);
  assert.match(result.xml, /name="Cycle B"/);
  assert.doesNotMatch(result.xml, /name="Roadmap A"/);
  assert.doesNotMatch(result.xml, /name="Title"/);
  assert.match(result.xml, /showMasterSp="0"/);
  assert.equal(result.removedTopLevelObjects, 2);
  assert.equal(result.keptGroupName, "Cycle B");
});

test("component group isolator rewrites a bounded PPTX without dropping unrelated entries", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-group-isolator-"));
  const input = path.join(tmp, "input.pptx");
  const output = path.join(tmp, "isolated.pptx");
  writeStoredZip(input, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": SLIDE_XML,
    "ppt/media/icon.png": "icon-bytes"
  });

  const report = isolatePptxComponentGroup({ input, output, slide: 1, groupIndex: 0 });
  const isolated = readZipEntryText(output, "ppt/slides/slide1.xml");
  assert.equal(report.keptGroupName, "Roadmap A");
  assert.equal(report.removedTopLevelObjects, 2);
  assert.match(isolated, /name="Roadmap A"/);
  assert.doesNotMatch(isolated, /name="Cycle B"/);
  assert.equal(readZipEntryText(output, "ppt/media/icon.png"), "icon-bytes");
});

test("component group isolator rejects missing group indexes and unsafe output types", () => {
  assert.throws(() => isolateSlideXmlGroup(SLIDE_XML, 9), /not present/);
  assert.throws(() => isolatePptxComponentGroup({ input: "missing.pptx", output: "out.zip" }), /input is not readable/);
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}
