"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  collectTargetNamesBySlide,
  collectTargetSlides,
  countSlideObjects,
  extractDrawingNames,
  runComponentIrReplacementObjectAudit
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-replacement-object-audit");
const {
  readZipEntryText
} = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

test("component IR replacement object audit counts target slide object changes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-object-audit-"));
  const before = path.join(tmp, "before.pptx");
  const after = path.join(tmp, "after.pptx");
  const plan = path.join(tmp, "plan.json");
  writeStoreZip(before, {
    "ppt/slides/slide2.xml": "<p:sld><p:pic><p:cNvPr name=\"native-flow-a\"/></p:pic><p:sp/></p:sld>",
    "ppt/slides/slide3.xml": "<p:sld><p:pic><p:cNvPr name=\"native-flow-b\"/></p:pic><p:sp/></p:sld>"
  });
  writeStoreZip(after, {
    "ppt/slides/slide2.xml": "<p:sld><p:grpSp/><p:sp/><p:sp/><p:sp descr=\"OfficePLUS\"/></p:sld>",
    "ppt/slides/slide3.xml": "<p:sld><p:grpSp/><p:sp/><p:sp/><p:sp name=\"MatlComponent\"/></p:sld>"
  });
  fs.writeFileSync(plan, `${JSON.stringify({
    operations: [
      { slides: [2], drawingNames: ["native-flow-a"], target: { slide: 2, imageId: "native-flow-a" } },
      { slides: [3], drawingNames: ["native-flow-b"], target: { slide: 3, imageId: "native-flow-b" } }
    ]
  })}\n`, "utf8");

  assert.match(readZipEntryText(before, "ppt/slides/slide2.xml"), /native-flow-a/);
  const report = runComponentIrReplacementObjectAudit({
    before,
    after,
    plan,
    minPictureReduction: 2,
    minNativeIncrease: 2
  });

  assert.equal(report.passed, true);
  assert.equal(report.totals.pictureReduction, 2);
  assert.equal(report.totals.nativeIncrease, 6);
  assert.equal(report.totals.afterComponentEvidence, 2);
  assert.equal(report.totals.remainingTargetNames, 0);
  assert.deepEqual(report.targetSlides, [2, 3]);
});

test("component IR replacement object audit fails when target underlay drawing remains", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-object-audit-underlay-"));
  const before = path.join(tmp, "before.pptx");
  const after = path.join(tmp, "after.pptx");
  const plan = path.join(tmp, "plan.json");
  writeStoreZip(before, { "ppt/slides/slide1.xml": "<p:sld><p:pic><p:cNvPr name=\"native-flow\"/></p:pic></p:sld>" });
  writeStoreZip(after, {
    "ppt/slides/slide1.xml": "<p:sld><p:pic><p:cNvPr name=\"native-flow\"/></p:pic><p:grpSp/><p:sp/><p:sp descr=\"OfficePLUS\"/></p:sld>"
  });
  fs.writeFileSync(plan, `${JSON.stringify({
    operations: [{ slides: [1], drawingNames: ["native-flow"], target: { slide: 1, imageId: "native-flow" } }]
  })}\n`, "utf8");

  const report = runComponentIrReplacementObjectAudit({
    before,
    after,
    plan,
    minPictureReduction: 0,
    minNativeIncrease: 1
  });

  assert.equal(report.passed, false);
  assert.equal(report.totals.remainingTargetNames, 1);
  assert.ok(report.findings.some((finding) => finding.code === "target-underlay-still-present"));
});

test("component IR replacement object audit ignores target names preserved only in replacement metadata", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-object-audit-metadata-"));
  const before = path.join(tmp, "before.pptx");
  const after = path.join(tmp, "after.pptx");
  const plan = path.join(tmp, "plan.json");
  writeStoreZip(before, { "ppt/slides/slide1.xml": "<p:sld><p:pic><p:cNvPr name=\"native-flow\"/></p:pic></p:sld>" });
  writeStoreZip(after, {
    "ppt/slides/slide1.xml": "<p:sld><p:grpSp><p:nvGrpSpPr><p:cNvPr name=\"component-template-native-flow-replacement\" descr=\"group=native-flow\"/></p:nvGrpSpPr></p:grpSp><p:sp/><p:sp descr=\"OfficePLUS\"/></p:sld>"
  });
  fs.writeFileSync(plan, `${JSON.stringify({
    operations: [{ slides: [1], drawingNames: ["native-flow"], target: { slide: 1, imageId: "native-flow" } }]
  })}\n`, "utf8");

  const report = runComponentIrReplacementObjectAudit({
    before,
    after,
    plan,
    minPictureReduction: 1,
    minNativeIncrease: 1
  });

  assert.equal(report.passed, true);
  assert.equal(report.totals.remainingTargetNames, 0);
  assert.deepEqual([...extractDrawingNames('<p:cNvPr name="native-flow"/><p:cNvPr name="component-native-flow"/>')], ["native-flow", "component-native-flow"]);
});

test("component IR replacement object audit fails insufficient replacement evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-object-audit-fail-"));
  const before = path.join(tmp, "before.pptx");
  const after = path.join(tmp, "after.pptx");
  const plan = path.join(tmp, "plan.json");
  writeStoreZip(before, { "ppt/slides/slide1.xml": "<p:sld><p:pic/><p:sp/></p:sld>" });
  writeStoreZip(after, { "ppt/slides/slide1.xml": "<p:sld><p:pic/><p:sp/></p:sld>" });
  fs.writeFileSync(plan, `${JSON.stringify({ operations: [{ slides: [1] }] })}\n`, "utf8");

  const report = runComponentIrReplacementObjectAudit({ before, after, plan });

  assert.equal(report.passed, false);
  assert.deepEqual(report.findings.map((finding) => finding.code), [
    "insufficient-picture-reduction",
    "insufficient-native-increase"
  ]);
});

test("component IR replacement object audit helpers normalize slides and count objects", () => {
  assert.deepEqual(collectTargetSlides({
    operations: [
      { slides: [4, "2"], drawingNames: ["flow-a"], target: { slide: 3, imageId: "flow-target" } },
      { slides: [2], target: { slide: "bad" } }
    ]
  }), [2, 3, 4]);
  assert.deepEqual(collectTargetNamesBySlide({
    operations: [
      { slides: [4, "2"], drawingNames: ["flow-a"], target: { slide: 3, imageId: "flow-target" } },
      { slides: [2], imageId: "flow-b", target: { slide: "bad" } }
    ]
  }).get(2), ["flow-a", "flow-b", "flow-target"]);
  assert.deepEqual(countSlideObjects("<p:pic/><p:sp/><p:grpSp/>OfficePLUS"), {
    pictures: 1,
    shapes: 1,
    groups: 1,
    nativeObjects: 2,
    targetUnderlayNames: 0,
    componentEvidence: 1
  });
});

function writeStoreZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.writeFileSync(file, Buffer.concat([...localParts, centralBuffer, eocd]));
}
