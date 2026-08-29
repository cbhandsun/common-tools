"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { deckIrFingerprint } = require("../packages/ppt-create-core/export");
const { createIrEditorClientSource } = require("../packages/ppt-create-core/ir-editor-client");
const { applyIrEditorPatch, createIrPreviewHtml } = require("../packages/ppt-create-core/ir-editor");

function deck() {
  return { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes: [{ id: "title", role: "title", text: "Title", box: { x: 40, y: 40, w: 400, h: 60 }, font: { family: "Arial", sizePt: 28, color: "#111827" }, style: { fill: "none", stroke: "none" } }], shapes: [], images: [], tables: [], charts: [], icons: [] }] };
}
function patch(ir, operations) { return { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations }; }

test("editable IR lifecycle adds, duplicates, and deletes bounded objects", () => {
  const source = deck();
  const result = applyIrEditorPatch(source, patch(source, [
    { type: "add-text-object", pageIndex: 0, objectId: "body.new", box: { x: 40, y: 130, w: 300, h: 80 }, value: "Editable body" },
    { type: "duplicate-object", pageIndex: 0, objectId: "body.new", newObjectId: "body.copy", offsetXPt: 24, offsetYPt: 16 },
    { type: "delete-object", pageIndex: 0, objectId: "title" }
  ]));
  assert.deepEqual(result.ir.pages[0].textBoxes.map((item) => item.id), ["body.new", "body.copy"]);
  assert.equal(result.ir.pages[0].textBoxes[1].box.x, 64);
  assert.equal(result.operationCount, 3);
  assert.notEqual(result.revision, deckIrFingerprint(source));
});

test("editable IR lifecycle adds shapes, replaces local image paths, and manages pages", () => {
  const source = deck();
  source.pages[0].images.push({ id: "hero", type: "image", assetPath: "assets/old.png", box: { x: 500, y: 100, w: 300, h: 220 } });
  const result = applyIrEditorPatch(source, patch(source, [
    { type: "add-shape-object", pageIndex: 0, objectId: "callout", shapeType: "roundRect", box: { x: 40, y: 180, w: 200, h: 80 } },
    { type: "set-image-asset", pageIndex: 0, objectId: "hero", assetPath: "assets/new.png" },
    { type: "duplicate-page", pageIndex: 0, insertAt: 1 },
    { type: "add-blank-page", insertAt: 2 },
    { type: "move-page", pageIndex: 2, toIndex: 1 },
    { type: "delete-page", pageIndex: 2 }
  ]));
  assert.equal(result.ir.pages.length, 2);
  assert.deepEqual(result.ir.pages.map((page) => page.pageIndex), [0, 1]);
  assert.equal(result.ir.pages[0].shapes.at(-1).id, "callout");
  assert.equal(result.ir.pages[0].images[0].assetPath, "assets/new.png");
  assert.equal(result.ir.pages[1].textBoxes.length, 0);
  assert.ok(result.checks.some((check) => check.name === "ir-page-lifecycle-validated"));
});

test("editable IR lifecycle safely edits native table cells and chart data", () => {
  const source = deck();
  source.pages[0].tables.push({ id: "table", type: "table", box: { x: 40, y: 140, w: 400, h: 180 }, rows: [["Metric", "Value"], ["Revenue", "12"]], style: {} });
  source.pages[0].charts.push({ id: "chart", type: "column", box: { x: 480, y: 140, w: 400, h: 180 }, categories: ["Q1", "Q2"], series: [{ name: "Revenue", values: [12, 18] }], style: {} });
  const result = applyIrEditorPatch(source, patch(source, [
    { type: "set-table-cell", pageIndex: 0, objectId: "table", rowIndex: 1, columnIndex: 1, value: "24" },
    { type: "set-chart-data", pageIndex: 0, objectId: "chart", chartType: "line", categories: ["Q1", "Q2", "Q3"], series: [{ name: "Revenue", values: [12, 18, 24] }] }
  ]));
  assert.equal(result.ir.pages[0].tables[0].rows[1][1], "24");
  assert.equal(result.ir.pages[0].charts[0].type, "line");
  assert.equal(result.ir.pages[0].charts[0].nativePayload.dataVerified, true);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-table-cell", pageIndex: 0, objectId: "table", rowIndex: 9, columnIndex: 0, value: "x" }])), /table cell target/u);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-chart-data", pageIndex: 0, objectId: "chart", chartType: "pie", categories: ["A", "B"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [3, 4] }] }])), /chart series/u);
});

test("editable page lifecycle rejects last-page deletion and invalid positions", () => {
  const source = deck();
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "delete-page", pageIndex: 0 }])), /retain one page/u);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "add-blank-page", insertAt: 2 }])), /insertion/u);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-image-asset", pageIndex: 0, objectId: "title", assetPath: "https://example.test/x.png" }])), /image asset/u);
  source.pages[0].images.push({ id: "hero", type: "image", assetPath: "assets/old.png", box: { x: 500, y: 100, w: 300, h: 220 } });
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-image-asset", pageIndex: 0, objectId: "hero", assetPath: "assets/vector.svg" }])), /image asset/u);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-image-asset", pageIndex: 0, objectId: "hero", assetPath: "file:///tmp/image.png" }])), /image asset/u);
});

test("editable IR lifecycle rejects duplicate ids, unsafe ids, missing targets, and out-of-slide copies", () => {
  const source = deck();
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "add-text-object", pageIndex: 0, objectId: "title", box: { x: 1, y: 1, w: 10, h: 10 }, value: "x" }])), /object id/);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "add-text-object", pageIndex: 0, objectId: "bad id", box: { x: 1, y: 1, w: 10, h: 10 }, value: "x" }])), /object id/);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "delete-object", pageIndex: 0, objectId: "missing" }])), /does not exist/);
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "duplicate-object", pageIndex: 0, objectId: "title", newObjectId: "copy", offsetXPt: 700, offsetYPt: 0 }])), /slide boundary/);
});

test("editable IR rejects oversized pages and control characters before applying edits", () => {
  const source = deck();
  source.pages[0].textBoxes = Array.from({ length: 2001 }, (_, index) => ({ id: `text-${index}`, text: "x", box: { x: 1, y: 1, w: 10, h: 10 } }));
  assert.throws(() => applyIrEditorPatch(source, patch(source, [{ type: "set-text", pageIndex: 0, objectId: "text-0", value: "y" }])), /object limit/u);
  const unsafe = deck(); unsafe.pages[0].textBoxes[0].id = "title\u0007";
  assert.throws(() => applyIrEditorPatch(unsafe, patch(unsafe, [{ type: "set-text", pageIndex: 0, objectId: "title\u0007", value: "y" }])), /object id/u);
});

test("editable IR preview blocks network access and refuses empty or oversized downloads", () => {
  const html = createIrPreviewHtml(deck());
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /style-src-attr 'unsafe-inline'/);
  assert.match(html, /nonce="[A-Za-z0-9+/=]+"/u);
  assert.match(html, /TextEncoder/);
  assert.match(html, /补丁为空或超出安全限制/u);
  assert.match(html, /beforeunload/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /aria-keyshortcuts="Control\+S Meta\+S"/u);
  assert.match(html, /已达到.*条安全上限/u);
  assert.match(html, /aspect-ratio:960\/540/u);
  for (const marker of ["addText", "addShape", "duplicateObject", "deleteObject", "replaceImage", "editTable", "editChart", "addPage", "duplicatePage", "deletePage", "pageUp", "pageDown"]) assert.match(html, new RegExp(marker));
  assert.match(html, /page\+":"\+id/u);
  assert.match(html, /semantic-editor/u);
  assert.match(html, /showModal/u);
  assert.match(html, /分类（每行一个，2–12 项）/u);
  assert.doesNotMatch(html, /编辑图表 JSON|行号（从 1 开始）/u);
  assert.doesNotMatch(html, /script-src[^;]*unsafe-inline/u);
  assert.doesNotThrow(() => new Function(createIrEditorClientSource({ maxOperations: 100, maxPatchBytes: 64 * 1024 })));
});
