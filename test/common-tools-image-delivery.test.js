"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createImageDeliveryArtifacts, createPreservationPlan } = require("../packages/ppt-create-core/image-delivery");
const { applyAndExportIrArtifacts, applyIrEditorPatch, createIrPreviewHtml, exportEditedIrArtifacts, persistIrEditorPatch } = require("../packages/ppt-create-core/ir-editor");
const { deckIrFingerprint } = require("../packages/ppt-create-core/export");

function sampleIr(assetPath = "../assets/pixel.png") {
  return {
    version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0, background: { fill: "#FFFFFF" },
      textBoxes: [{ id: "title", text: "可编辑标题", box: { x: 60, y: 50, w: 500, h: 70 }, font: { sizePt: 28, color: "#111827" } }],
      shapes: [{ id: "panel", type: "rect", box: { x: 40, y: 140, w: 420, h: 300 }, style: { fill: "#E0F2FE" } }],
      images: [{ id: "residual", type: "image", assetPath, box: { x: 500, y: 140, w: 380, h: 300 } }],
      tables: [], charts: [], icons: []
    }]
  };
}
function fakePdf({ outFile, sourceFingerprint, pageCount }) {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 9 0 R >> endobj`).join("\n");
  fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n9 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n%%EOF`, { flag: "wx" });
  return { sourceFingerprint };
}

test("image delivery emits shared editable, preview, preservation, HTML, PPTX and PDF artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-image-delivery-"));
  try {
    fs.mkdirSync(path.join(root, "reports")); fs.mkdirSync(path.join(root, "ir")); fs.mkdirSync(path.join(root, "assets")); fs.mkdirSync(path.join(root, "pptx"));
    const irFile = path.join(root, "ir", "deck.final.json"); const pptxFile = path.join(root, "pptx", "deck.final.pptx");
    fs.writeFileSync(irFile, JSON.stringify(sampleIr()));
    fs.writeFileSync(path.join(root, "assets", "pixel.png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(24, 1)]));
    fs.writeFileSync(pptxFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)]));
    fs.writeFileSync(path.join(root, "reports", "pipeline-result.json"), JSON.stringify({ ok: true, irFile, pptx: { pptxFile } }));
    const result = createImageDeliveryArtifacts({ outputDir: root, buildPdf: fakePdf });
    assert.equal(result.passed, true); assert.equal(result.pageCount, 1);
    for (const file of Object.values(result.files)) assert.equal(fs.statSync(file).isFile(), true);
    const delivered = JSON.parse(fs.readFileSync(result.files.irFile, "utf8"));
    assert.equal(delivered.pages[0].images[0].assetPath, "assets/pixel.png");
    assert.match(fs.readFileSync(result.files.htmlFile, "utf8"), /data:image\/png;base64,/);
    assert.match(fs.readFileSync(result.files.previewFile, "utf8"), /ppt apply-ir-edit/);
    const plan = JSON.parse(fs.readFileSync(result.files.planFile, "utf8"));
    assert.equal(plan.semantics, "faithful-reconstruction-strategy-not-layout-reflow");
    assert.equal(plan.pages[0].selectedCandidateId, "preserve-hybrid-v1");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("image preservation candidates remain bounded and do not masquerade as new-deck layouts", () => {
  const plan = createPreservationPlan(sampleIr());
  assert.equal(plan.pages[0].candidates.length, 3);
  assert.ok(plan.pages[0].candidates.every((candidate) => candidate.id.startsWith("preserve-")));
  assert.equal(plan.pages[0].candidates.some((candidate) => candidate.id.includes("layout")), false);
  assert.equal(plan.pages[0].decision.passed, true);
  assert.equal(plan.pages[0].decision.deliveryStatus, "partially-editable");
});

test("complex graphic gate rejects raster-only and oversized residual delivery", () => {
  const rasterOnly = sampleIr(); rasterOnly.pages[0].textBoxes = []; rasterOnly.pages[0].shapes = []; rasterOnly.pages[0].images[0].box = { x: 0, y: 0, w: 960, h: 540 };
  const rejected = createPreservationPlan(rasterOnly);
  assert.equal(rejected.pages[0].decision.passed, false);
  assert.deepEqual(rejected.pages[0].decision.reasons, ["insufficient-native-objects", "insufficient-native-area", "excessive-raster-residual-area", "oversized-raster-residual"]);
  const background = sampleIr(); background.pages[0].images[0].box = { x: 0, y: 0, w: 960, h: 540 }; background.pages[0].intent = { rasterBackgroundAllowed: true };
  assert.equal(createPreservationPlan(background).pages[0].decision.rasterBackgroundException, true);
  assert.throws(() => createPreservationPlan(sampleIr(), { maxResidualAreaRatio: 2 }), /ratio/u);
});

test("IR editor applies revision-bound text and geometry changes and rejects stale or unsafe patches", () => {
  const ir = sampleIr(); const revision = deckIrFingerprint(ir);
  const patch = { version: "1.0", expectedRevision: revision, operations: [
    { type: "set-text", pageIndex: 0, objectId: "title", value: "新标题" },
    { type: "set-box", pageIndex: 0, objectId: "panel", box: { x: 50, y: 150, w: 400, h: 280 } }
  ] };
  const result = applyIrEditorPatch(ir, patch);
  assert.equal(result.ir.pages[0].textBoxes[0].text, "新标题"); assert.equal(result.ir.pages[0].shapes[0].box.x, 50);
  assert.throws(() => applyIrEditorPatch(ir, { ...patch, expectedRevision: "0".repeat(64) }), /revision/);
  assert.throws(() => applyIrEditorPatch(ir, { ...patch, operations: [{ type: "set-box", pageIndex: 0, objectId: "panel", box: { x: 0, y: 0, w: 2000, h: 20 } }] }), /boundary/);
  assert.throws(() => applyIrEditorPatch(ir, { ...patch, operations: [{ type: "set-text", pageIndex: 0, objectId: "missing", value: "x" }] }), /does not exist/);
});

test("IR editor supports validated layers and single or batch style changes", () => {
  const ir = sampleIr();
  ir.pages[0].shapes.push({ id: "accent", type: "rect", box: { x: 60, y: 160, w: 80, h: 30 }, style: { fill: "#FFFFFF" } });
  const result = applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [
    { type: "set-style", pageIndex: 0, objectId: "title", style: { color: "#2563EB", sizePt: 32, weight: "bold" } },
    { type: "batch-style", pageIndex: 0, objectIds: ["panel", "accent"], style: { fill: "#DBEAFE", opacity: 0.9 } },
    { type: "reorder-object", pageIndex: 0, objectId: "accent", toIndex: 0 },
    { type: "set-rotation", pageIndex: 0, objectId: "panel", rotation: 15 }
  ] });
  assert.equal(result.ir.pages[0].textBoxes[0].font.sizePt, 32);
  assert.equal(result.ir.pages[0].shapes[0].id, "accent");
  assert.equal(result.ir.pages[0].shapes[1].style.opacity, 0.9);
  assert.equal(result.ir.pages[0].shapes[1].rotation, 15);
  assert.throws(() => applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-style", pageIndex: 0, objectId: "title", style: { color: "url(javascript:1)" } }] }), /color/u);
  assert.throws(() => applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "batch-style", pageIndex: 0, objectIds: ["panel", "panel"], style: { fill: "#FFFFFF" } }] }), /targets/u);
  assert.throws(() => applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "reorder-object", pageIndex: 0, objectId: "panel", toIndex: 9 }] }), /layer/u);
  assert.throws(() => applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-rotation", pageIndex: 0, objectId: "panel", rotation: 361 }] }), /rotation/u);
});

test("IR editor preview exposes resize, multi-select, alignment, layers, undo and export guidance", () => {
  const html = createIrPreviewHtml(sampleIr());
  for (const marker of ["resize-handle", "alignLeft", "distribute", "undo", "redo", "batch-style", "ppt export-ir"]) assert.match(html, new RegExp(marker));
});

test("IR patch persistence refuses overwrite and writes a separately validated deck", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ir-persist-"));
  try {
    const input = path.join(root, "deck.ir.json"); const patchFile = path.join(root, "edit.json"); const output = path.join(root, "edited.json"); const ir = sampleIr();
    fs.writeFileSync(input, JSON.stringify(ir)); fs.writeFileSync(patchFile, JSON.stringify({ version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-text", pageIndex: 0, objectId: "title", value: "持久化标题" }] }));
    const result = persistIrEditorPatch({ workspaceRoot: root, input, patch: patchFile, output });
    assert.equal(result.operationCount, 1); assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).pages[0].textBoxes[0].text, "持久化标题");
    assert.throws(() => persistIrEditorPatch({ workspaceRoot: root, input, patch: patchFile, output }), /new JSON/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("edited IR exports a new self-contained PPTX, PDF, HTML and preview bundle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ir-export-"));
  try {
    const input = path.join(root, "edited.json"); const ir = sampleIr(); ir.pages[0].images = []; fs.writeFileSync(input, JSON.stringify(ir));
    const result = exportEditedIrArtifacts({ workspaceRoot: root, input, output: path.join(root, "exported"), buildPptx: ({ outFile }) => fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)])), buildPdf: fakePdf });
    assert.equal(result.report.passed, true); assert.equal(result.report.pageCount, 1);
    for (const file of Object.values(result.files)) assert.equal(fs.statSync(file).isFile(), true);
    assert.throws(() => exportEditedIrArtifacts({ workspaceRoot: root, input, output: path.join(root, "exported"), buildPptx() {}, buildPdf() {} }), /new child/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("IR edit finalization applies a revision-bound patch and exports in one operation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ir-finalize-"));
  try {
    const input = path.join(root, "deck.json"); const patchFile = path.join(root, "edit.patch.json"); const ir = sampleIr(); ir.pages[0].images = [];
    fs.writeFileSync(input, JSON.stringify(ir));
    fs.writeFileSync(patchFile, JSON.stringify({ version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-text", pageIndex: 0, objectId: "title", value: "Final title" }] }));
    const result = applyAndExportIrArtifacts({ workspaceRoot: root, input, patch: patchFile, output: path.join(root, "final"), buildPptx: ({ outFile }) => fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)])), buildPdf: fakePdf });
    assert.equal(result.operationCount, 1); assert.equal(result.report.passed, true);
    assert.equal(JSON.parse(fs.readFileSync(result.files.irFile, "utf8")).pages[0].textBoxes[0].text, "Final title");
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith(".common-tools-ir-edit-")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
