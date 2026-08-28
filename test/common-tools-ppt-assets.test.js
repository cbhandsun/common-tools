"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPptCreateJob, runPptCreateJob } = require("../packages/ppt-create-core");
const { validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { sourceCompliance, sourceRecord } = require("../packages/ppt-create-core/assets");

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function assetSpec(hash) {
  return {
    version: "1.0", title: "安全素材包", assets: [{ id: "hero", path: "media/hero.png", sha256: hash, source: { kind: "original", locator: "internal://design/hero", license: "company-owned", author: "Design Team" } }],
    slides: [
      { id: "cover", role: "cover", title: "安全素材包" },
      { id: "media", role: "content", title: "真实图片", layout: "media-frame-v1", visual: { kind: "media", mediaType: "image", alt: "蓝色示例图", assetId: "hero", fit: "cover", crop: { left: 0.05, top: 0.1, right: 0.05, bottom: 0.1 } }, items: [{ id: "fact", label: "来源清晰", detail: "素材与来源记录绑定" }] },
      { id: "closing", role: "closing", title: "完成" }
    ]
  };
}
function fakePptx({ outFile }) { fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)]), { flag: "wx" }); }
function fakePdf({ outFile, sourceFingerprint, pageCount }) {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 99 0 R >> endobj`).join("\n");
  fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n99 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n%%EOF`, { flag: "wx" }); return { sourceFingerprint };
}

test("ppt-create verifies, materializes, embeds and records a provenance-bound local image", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-assets-"));
  try {
    const media = path.join(root, "media"); fs.mkdirSync(media); const source = path.join(media, "hero.png");
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
    const specFile = path.join(root, "presentation.json"); fs.writeFileSync(specFile, JSON.stringify(assetSpec(sha256(source))));
    const job = createPptCreateJob({ workspaceRoot: root, stateRoot: path.join(root, ".state"), ownerId: "owner", input: specFile, output: path.join(root, "out") });
    const completed = runPptCreateJob({ stateRoot: path.join(root, ".state"), ownerId: "owner", id: job.id, buildPptx: fakePptx, buildPdf: fakePdf });
    assert.equal(completed.status, "succeeded", completed.error?.message); assert.equal(completed.quality.metrics["raster-images"], 1); assert.equal(completed.quality.metrics["declared-assets"], 1);
    const ir = JSON.parse(fs.readFileSync(path.join(root, "out", "deck.ir.json"), "utf8")); const image = ir.pages[1].images[0];
    assert.equal(image.assetPath, "assets/hero.png"); assert.deepEqual(image.style.cropRect, { left: 0.05, top: 0.1, right: 0.05, bottom: 0.1 });
    assert.equal(fs.existsSync(path.join(root, "out", "assets", "hero.png")), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "out", "asset-manifest.json"), "utf8"));
    assert.equal(manifest.assets[0].source.license, "company-owned"); assert.equal(manifest.assets[0].file, undefined);
    assert.match(fs.readFileSync(path.join(root, "out", "deck.html"), "utf8"), /data:image\/png;base64,/);
    assert.match(fs.readFileSync(path.join(root, "out", "deck.preview.html"), "utf8"), /assets\/hero\.png/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("asset manifests reject unknown, unused, traversal, invalid crop and hash changes", () => {
  const hash = "0".repeat(64); const valid = assetSpec(hash);
  const unknown = structuredClone(valid); unknown.slides[1].visual.assetId = "missing"; assert.throws(() => validatePresentationSpec(unknown), /unknown asset/);
  const unused = structuredClone(valid); delete unused.slides[1].visual.assetId; assert.throws(() => validatePresentationSpec(unused), /unused asset/);
  const traversal = structuredClone(valid); traversal.assets[0].path = "../hero.png"; assert.throws(() => validatePresentationSpec(traversal), /path is invalid/);
  const crop = structuredClone(valid); crop.slides[1].visual.crop.left = 0.7; crop.slides[1].visual.crop.right = 0.4; assert.throws(() => validatePresentationSpec(crop), /crop is invalid/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-asset-hash-"));
  try {
    fs.mkdirSync(path.join(root, "media")); fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), path.join(root, "media", "hero.png"));
    const specFile = path.join(root, "presentation.json"); fs.writeFileSync(specFile, JSON.stringify(valid));
    assert.throws(() => createPptCreateJob({ workspaceRoot: root, stateRoot: path.join(root, ".state"), ownerId: "owner", input: specFile, output: path.join(root, "out") }), /hash/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("asset license policy requires evidence for licensed and generated media and renders attribution", () => {
  const licensed = sourceRecord({ kind: "licensed", locator: "https://stock.example/asset", license: "commercial-license", attributionRequired: true, attribution: "Photo: Example Studio", licenseEvidence: { type: "receipt", locator: "internal://receipts/123", sha256: "a".repeat(64), capturedAt: "2026-08-28" } }, "licensed source");
  assert.equal(sourceCompliance(licensed, "2026-08-28").verified, true);
  assert.deepEqual(sourceCompliance(sourceRecord({ kind: "licensed", locator: "https://stock.example/asset", license: "commercial-license" }, "licensed source"), "2026-08-28").reasons, ["license-evidence-missing"]);
  assert.deepEqual(sourceCompliance(sourceRecord({ kind: "generated", locator: "model:request-1", license: "generated-output", licenseEvidence: { type: "generation-record", locator: "internal://generation/1", capturedAt: "2026-08-28", expiresAt: "2026-08-27" } }, "generated source"), "2026-08-28").reasons, ["license-evidence-expired"]);
  assert.throws(() => sourceRecord({ kind: "licensed", locator: "x", license: "commercial-license", attributionRequired: true }, "licensed source"), /attribution text/u);
});
