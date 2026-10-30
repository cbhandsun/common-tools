"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runBuilder } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

const mode = "preserve-crop-with-native-and-local-fidelity-overlays";
function fixture(groupId = "card") {
  const box = { x: 20, y: 20, w: 120, h: 60 };
  return { version: "1.0", slideSize: { widthPt: 320, heightPt: 240 }, pages: [{
    pageIndex: 0, sourceImage: "", background: { fill: "#FFFFFF" },
    shapes: [
      { id: "page-background", type: "rect", box, style: { fill: "#EEEEEE" }, source: { preserveResidualInterior: true } },
      { id: "card-body", type: "rect", box, style: { fill: "#FEF5F1", stroke: "none" },
        source: { nativeComponentGroupId: groupId } },
      { id: "card-inner-background", type: "rect", box: { x: 21, y: 21, w: 118, h: 58 }, style: { fill: "#FEF5F1", stroke: "none" },
        source: { preserveResidualInterior: true, residualBackgroundFill: true, nativeComponentGroupId: groupId } }
    ],
    images: [{ id: "residual", type: "fidelity-crop", box: { x: 0, y: 0, w: 320, h: 240 }, assetPath: "crop.png",
      source: { residualCrop: true, componentRenderStrategy: { mode } } }],
    textBoxes: [{ id: "label", text: "Card", box: { x: 30, y: 30, w: 80, h: 20 }, source: { nativeComponentGroupId: groupId } }],
    tables: [], charts: []
  }] };
}
function build(t, input) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grouped-residual-layer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "crop.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8fK8QAAAABJRU5ErkJggg==", "base64"));
  const ir = path.join(root, "deck.json"), pptx = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(input));
  runBuilder(["--ir", ir, "--out", pptx]);
  return readZipEntry(pptx, "ppt/slides/slide1.xml").toString("utf8");
}

test("layered residual export retains all grouped background members inside the native editing unit", t => {
  const xml = build(t, fixture());
  const group = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];
  assert.ok(group);
  for (const name of ["card-body", "card-inner-background", "label"]) {
    assert.ok(group.includes(`name="${name}"`), `${name} must stay inside the group`);
    assert.equal(xml.split(`name="${name}"`).length - 1, 1);
  }
  assert.ok(group.indexOf('name="card-body"') < group.indexOf('name="card-inner-background"'));
  assert.ok(group.indexOf('name="card-inner-background"') < group.indexOf('name="label"'));
  assert.ok(xml.indexOf('name="page-background"') < xml.indexOf('name="residual"'));
  assert.ok(xml.indexOf('name="residual"') < xml.indexOf('name="card"'));
  assert.match(group, /x="266700" y="266700"/u);
  assert.match(group, /cx="1498600" cy="736600"/u);
  assert.match(group, /val="FEF5F1"/u);
});

test("empty and malformed group metadata preserve the background-before-residual contract", t => {
  for (const groupId of [null, "", "  ", 123, [], {}]) {
    const xml = build(t, fixture(groupId));
    assert.doesNotMatch(xml, /<p:grpSp>/u);
    assert.ok(xml.indexOf('name="card-inner-background"') < xml.indexOf('name="residual"'));
    assert.ok(xml.indexOf('name="residual"') < xml.indexOf('name="card-body"'));
  }
});

test("without layered residuals group membership and source order remain intact", t => {
  const input = fixture();
  input.pages[0].images = [];
  const xml = build(t, input), group = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];
  assert.ok(group?.includes('name="card-inner-background"'));
  assert.equal((xml.match(/name="card-inner-background"/gu) || []).length, 1);
  assert.doesNotMatch(xml, /<p:pic\b/u);
});

test("independent output edit plans keep node background members together across residual layering", t => {
  const input = fixture(), page = input.pages[0];
  for (const shape of page.shapes) delete shape.source.nativeComponentGroupId;
  for (const text of page.textBoxes) delete text.source.nativeComponentGroupId;
  page.outputEditGroups = [{ id: "output-card", members: ["card-body", "card-inner-background", "label"] }];
  const xml = build(t, input), group = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];
  assert.ok(group);
  for (const member of page.outputEditGroups[0].members) assert.equal(group.split(`name="${member}"`).length - 1, 1);
  assert.ok(xml.indexOf('name="page-background"') < xml.indexOf('name="residual"'));
  assert.ok(xml.indexOf('name="residual"') < xml.indexOf('name="output-card"'));
  assert.ok(page.shapes.every(shape => shape.source.nativeComponentGroupId === undefined));
});

test("an empty page remains exportable without manufacturing background groups", t => {
  const input = fixture();
  Object.assign(input.pages[0], { shapes: [], images: [], textBoxes: [] });
  const xml = build(t, input);
  assert.doesNotMatch(xml, /<p:grpSp>|<p:pic\b|name="card/u);
});
