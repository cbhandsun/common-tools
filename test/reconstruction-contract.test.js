"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const {
  buildReconstructionInventory,
  enrichReconstructionContracts,
  validateReconstructionContracts
} = require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract");

function fixture(root) {
  const image = path.join(root, "page.png");
  writePng(image, { width: 4, height: 3, rgba: Buffer.alloc(4 * 3 * 4, 255) });
  const evidenceBox = { x: 10, y: 12, w: 30, h: 20 };
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: image,
      textBoxes: [{ id: "title", text: "Hello", box: evidenceBox, source: { pageImage: image, evidenceBox, confidence: 0.98 } }],
      shapes: [],
      images: [{
        id: "subject",
        type: "scene-subject",
        box: { x: 100, y: 100, w: 200, h: 200 },
        assetPath: image,
        source: {
          pageImage: image,
          evidenceBox: { x: 100, y: 100, w: 200, h: 200 },
          nonEditableReason: "registered subject pixels",
          nativeComponentGroupId: "scene-1",
          layerRole: "subject"
        }
      }],
      tables: [],
      charts: [],
      icons: []
    }]
  };
}

test("reconstruction enrichment records canonical hashes and registered layers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-reconstruction-"));
  const enriched = enrichReconstructionContracts(fixture(root), { baseDir: root });
  const page = enriched.pages[0];
  assert.match(page.reconstruction.canonicalPageSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(page.reconstruction.canonicalCanvas, {
    widthPx: 4,
    heightPx: 3,
    sha256: page.reconstruction.canonicalPageSha256
  });
  assert.equal(page.textBoxes[0].source.reconstruction.realization, "native_text");
  assert.equal(page.images[0].source.reconstruction.realization, "registered_image_layer");
  assert.equal(page.images[0].source.reconstruction.registrationGroupId, "scene-1");
  assert.equal(page.images[0].source.reconstruction.zOrderRole, "subject");
  assert.equal(page.reconstruction.qualityBudget.contractVersion, "1.0");
  assert.equal(page.reconstruction.qualityBudget.metrics.nativeObjectCount, 1);
  assert.deepEqual(validateReconstructionContracts(enriched), { ok: true, errors: [], warnings: [] });
  const inventory = buildReconstructionInventory(enriched);
  assert.equal(inventory.pages[0].regions.length, 2);
  assert.equal(inventory.pages[0].regions[1].registrationGroupId, "scene-1");
});

test("manual-required content blocks delivery unless an explicit diagnostic override is used", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-reconstruction-manual-"));
  const ir = fixture(root);
  ir.pages[0].charts.push({
    id: "unknown-chart",
    type: "bar",
    box: { x: 10, y: 20, w: 300, h: 200 },
    source: { pageImage: ir.pages[0].sourceImage, evidenceBox: { x: 10, y: 20, w: 300, h: 200 } }
  });
  const enriched = enrichReconstructionContracts(ir, { baseDir: root });
  const contract = enriched.pages[0].charts[0].source.reconstruction;
  assert.equal(contract.realization, "manual_required");
  assert.equal(contract.sourceSufficiency, "insufficient");
  assert.match(contract.manualRequiredReason, /insufficient/i);
  assert.equal(validateReconstructionContracts(enriched).ok, false);
  assert.equal(validateReconstructionContracts(enriched, { allowManualRequired: true }).ok, true);
});

test("registered layers reject missing registration and malformed canonical canvas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-reconstruction-invalid-"));
  const enriched = enrichReconstructionContracts(fixture(root), { baseDir: root });
  const contract = enriched.pages[0].images[0].source.reconstruction;
  delete contract.registrationGroupId;
  contract.canonicalCanvas.widthPx = 0;
  const result = validateReconstructionContracts(enriched);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((value) => value.includes("registrationGroupId")));
  assert.ok(result.errors.some((value) => value.includes("widthPx")));
});

test("production reconstruction validation fails closed for missing enrichment", () => {
  const ir = {
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "title", text: "Title", box: { x: 10, y: 10, w: 100, h: 30 } }],
      shapes: [],
      images: [],
      tables: [],
      charts: [],
      icons: []
    }]
  };

  const compatible = validateReconstructionContracts(ir);
  assert.equal(compatible.ok, true);
  assert.ok(compatible.warnings.some((item) => item.includes("reconstruction is missing")));

  const production = validateReconstructionContracts(ir, { requireComplete: true });
  assert.equal(production.ok, false);
  assert.ok(production.errors.some((item) => item.includes("reconstruction is missing")));
  assert.equal(production.warnings.length, 0);
});

test("page reconstruction validation rejects tampered quality budgets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-reconstruction-quality-"));
  const enriched = enrichReconstructionContracts(fixture(root), { baseDir: root });
  enriched.pages[0].reconstruction.qualityBudget = JSON.parse(JSON.stringify(enriched.pages[0].reconstruction.qualityBudget));
  enriched.pages[0].reconstruction.qualityBudget.metrics.residualAreaRatio = 2;
  enriched.pages[0].reconstruction.qualityBudget.reasonCodes = ["unsafe user content"];
  const result = validateReconstructionContracts(enriched);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes("residualAreaRatio")));
  assert.ok(result.errors.some((item) => item.includes("reasonCodes")));
});

test("missing source files remain auditable without invented hashes", () => {
  const ir = fixture(os.tmpdir());
  ir.pages[0].sourceImage = "missing-page.png";
  ir.pages[0].textBoxes[0].source.pageImage = "missing-page.png";
  ir.pages[0].images = [];
  const enriched = enrichReconstructionContracts(ir, { baseDir: os.tmpdir() });
  assert.equal(enriched.pages[0].reconstruction.sourceImageAvailable, false);
  assert.equal(enriched.pages[0].reconstruction.canonicalPageSha256, undefined);
  const result = validateReconstructionContracts(enriched);
  assert.equal(result.ok, true);
});

test("unsupported native chart payloads become explicit manual-required work", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-reconstruction-chart-"));
  const ir = fixture(root);
  ir.pages[0].charts = [{
    id: "radar",
    type: "radar",
    box: { x: 10, y: 10, w: 100, h: 100 },
    categories: ["A", "B"],
    values: [1, 2],
    source: { pageImage: "page.png", evidenceBox: { x: 10, y: 10, w: 100, h: 100 } }
  }];
  const enriched = enrichReconstructionContracts(ir, { baseDir: root });
  const contract = enriched.pages[0].charts[0].source.reconstruction;
  assert.equal(contract.realization, "manual_required");
  assert.match(contract.manualRequiredReason, /native chart promotion failed/);
  assert.match(validateReconstructionContracts(enriched).errors.join("\n"), /blocks successful delivery/);
});
