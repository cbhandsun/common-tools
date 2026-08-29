"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { createImageToEditableArchiveHandler, residualDeduplicationStatus } = require("../packages/slideclone-core/team-worker");
const { boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, nativeObjectMetrics, residualEraseObjects } = require("../packages/slideclone-core/team-native-rebuild");
const { PROFILE_NAME, sha256File } = require("../packages/slideclone-core/team-ocr-profile");
const { PROFILE_NAME: PADDLE_PROFILE_NAME } = require("../packages/slideclone-core/team-paddleocr-profile");
const { startupFailureCode, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { eraseMasks, readPng, rebuildDeckFromWorkDir } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
const { createFullSlideResidualBuilder } = require("../skills/pd-hifi-slideclone/scripts/lib/full-slide-native-residual");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });

function field(buffer, offset, length, value) { buffer.write(value.slice(0, length), offset, length, "utf8"); }
function tarEntry(name, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, "0000600\0");
  field(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  field(header, 156, 1, "0");
  field(header, 257, 6, "ustar\0");
  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}
function archive(entries) { return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])); }
function writeThreeCardDiagram(file) {
  const width = 960; const height = 540; const rgba = Buffer.alloc(width * height * 4, 255);
  const pixel = (x, y, color) => { const offset = (y * width + x) * 4; rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255; };
  const fillRect = (x, y, w, h, fill, stroke) => {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) pixel(px, py, px < x + 3 || px >= x + w - 3 || py < y + 3 || py >= y + h - 3 ? stroke : fill);
  };
  for (const [x, fill] of [[80, [222, 235, 255]], [380, [225, 246, 232]], [680, [255, 237, 213]]]) fillRect(x, 200, 200, 100, fill, [45, 74, 110]);
  for (const start of [280, 580]) {
    for (let x = start; x < start + 100; x += 1) for (let y = 247; y <= 252; y += 1) pixel(x, y, [45, 74, 110]);
    for (let delta = 0; delta < 16; delta += 1) for (let y = 250 - delta; y <= 250 + delta; y += 1) pixel(start + 99 - delta, y, [45, 74, 110]);
  }
  writePng(file, { width, height, rgba });
}
function deck(overrides = {}) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, background: { fill: "#FFFFFF" }, textBoxes: [{ id: "title", text: "Team deck", box: { x: 10, y: 10, w: 200, h: 30 }, font: { family: "Arial", sizePt: 20 } }], shapes: [], images: [], tables: [], charts: [], icons: [] }],
    ...overrides
  };
}

test("contextual OCR correction only repairs AI Agent when the page contains canonical evidence", () => {
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "AIAgent pipeline" }])[0].text, "AI Agent");
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "Al Smith" }])[0].text, "Al Agent");
});

test("team image worker validates the optional render quality dependency at composition time", () => {
  assert.throws(() => createImageToEditableArchiveHandler({
    temporaryRoot: path.resolve(os.tmpdir()),
    rawImageQualityVerifier: {},
    objectStore: { readObject: async () => Buffer.alloc(0), putObject: async () => {} }
  }), /rawImageQualityVerifier/);
});

test("residual duplicate-removal gate fails closed when a residual lacks complete erase evidence", () => {
  const residualDeck = { pages: [{ images: [{ source: { residualCrop: true } }] }] };
  assert.deepEqual(residualDeduplicationStatus({ pages: [{ images: [] }] }), { required: false, passed: true, candidateObjects: 0, erasedObjects: 0 });
  assert.deepEqual(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 3 }), { required: true, passed: true, candidateObjects: 3, erasedObjects: 3 });
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 2 }).passed, false);
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: Number.NaN, erasedObjects: 0 }).passed, false);
});

test("team image worker accepts a bounded Deck IR archive and returns an owner-scoped PPTX", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-1/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts[0].name, "deck.pptx");
    assert.equal(output.quality.passed, true);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["deck-ir-validated", "assets-resolved", "pptx-generated"]);
    assert.equal(output.quality.metrics.pages, 1);
    assert.equal(uploads.get("owners/a/jobs/job-1/deck.pptx").contentType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(fs.readdirSync(temporaryRoot).filter((entry) => entry !== "builder.js").length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker can publish the same bounded multi-format delivery contract", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-delivery-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: ({ root, irFile, pptxFile }) => {
      assert.equal(path.basename(irFile), "deck.json"); assert.equal(path.basename(pptxFile), "source.pptx");
      const preview = path.join(root, "deck.preview.html"); const pdf = path.join(root, "deck.pdf");
      fs.writeFileSync(preview, "<!doctype html><title>preview</title>"); fs.writeFileSync(pdf, "%PDF-1.4\n%%EOF");
      return { artifacts: [
        { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        { name: "deck.preview.html", file: preview, mediaType: "text/html" }, { name: "deck.pdf", file: pdf, mediaType: "application/pdf" }
      ], checks: [{ name: "shared-preview-present", passed: true }, { name: "multi-format-artifacts-present", passed: true }] };
    },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]), putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType }) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-delivery/" }, isCancellationRequested: async () => false });
    assert.deepEqual(output.artifacts.map((artifact) => artifact.name), ["deck.pptx", "deck.preview.html", "deck.pdf"]);
    assert.equal(output.quality.passed, true); assert.ok(uploads.has("owners/a/jobs/job-delivery/deck.preview.html"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rejects archive resources that can escape the isolated asset package", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-invalid-"));
  const invalidDeck = deck({ pages: [{ pageIndex: 0, images: [{ id: "outside", assetPath: "../outside.png", box: { x: 0, y: 0, w: 1, h: 1 } }] }] });
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(invalidDeck))]), putObject: async () => assert.fail("must not upload") }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-1/" }, isCancellationRequested: async () => false }), /asset/);
    assert.equal(fs.readdirSync(temporaryRoot).length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker requires native graphical reconstruction for a raw image and reports native metrics", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-raw-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async ({ inputFile, dimensions }) => {
      assert.equal(path.basename(inputFile), "source.png");
      assert.ok(dimensions.widthPx > 0 && dimensions.heightPx > 0);
      return { lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] };
    },
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].textBoxes[0].font.opacity = 1;
      rebuilt.pages[0].textBoxes[0].style.opacity = 1;
      rebuilt.pages[0].textBoxes[0].style.visibility = "visible";
      rebuilt.pages[0].shapes.push({ id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true, detector: "test-native-card" } });
      rebuilt.pages[0].images.push({ id: "residual", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 2, erasedObjects: 2 } };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("assets/source.png", source)]),
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts[0].name, "deck.pptx");
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["raw-image-validated", "assets-resolved", "native-graphics-rebuilt", "residual-native-duplicates-removed", "quality-render-not-configured", "pptx-generated"]);
    assert.equal(output.quality.metrics["native-shapes"], 1);
    assert.equal(output.quality.metrics["native-text-boxes"], 1);
    assert.equal(output.quality.metrics["residual-erased-native-objects"], 2);
    assert.ok(uploads.has("owners/a/jobs/job-raw/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rebuilds an ordered raw-image batch into one page per source", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-batch-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const calls = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async ({ pageIndex }) => { calls.push(`ocr-${pageIndex}`); return { lines: [] }; },
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      calls.push(`rebuild-${pageIndex}`);
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: `shape-${pageIndex}`, type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true, pageImage: metadata.assetPath } });
      return { deck: rebuilt };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/batch.tar.gz", outputPrefix: "owners/a/jobs/job-batch/" }, isCancellationRequested: async () => false });
    assert.deepEqual(calls, ["ocr-0", "rebuild-0", "ocr-1", "rebuild-1"]);
    assert.equal(output.quality.metrics.pages, 2);
    assert.equal(output.quality.metrics["native-shapes"], 2);
    assert.equal(output.quality.checks[0].name, "raw-image-batch-validated");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker normalizes a bounded document before native reconstruction", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-document-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const sourcePng = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
  const calls = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    documentNormalizer: async ({ root, metadata }) => {
      calls.push(metadata.documentKind); const file = path.join(root, "assets", "source-001.png"); fs.writeFileSync(file, sourcePng);
      return { pages: 1, assets: 1, sources: [{ inputFile: file, assetPath: "assets/source-001.png", dimensions: { widthPx: 960, heightPx: 540 }, pageIndex: 0 }] };
    },
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata }) => { const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath }); rebuilt.pages[0].shapes.push({ id: "document-shape", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true } }); return { deck: rebuilt }; },
    rawImageQualityVerifier: async () => ({ checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.pdf", pdf)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/document.tar.gz", outputPrefix: "owners/a/jobs/job-document/" }, isCancellationRequested: async () => false });
    assert.deepEqual(calls, ["pdf"]); assert.equal(output.quality.passed, true); assert.equal(output.quality.metrics.pages, 1);
    assert.equal(output.quality.checks[0].name, "document-pages-normalized");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rejects OCR-only raw-image output instead of claiming graphical editability", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-overlay-only-"));
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    rawImageOcr: async () => ({ lines: [{ text: "overlay only", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => ({ deck: boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" }) }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload") }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false }), /no editable graphical objects/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw native rebuild adapter materializes a bounded work IR and requires graphical output", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-adapter-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  let receivedWorkDir;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: (workDir) => {
    receivedWorkDir = workDir;
    const sourceIr = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    sourceIr.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 1, y: 1, w: 20, h: 0 }, source: { editable: true } });
    return sourceIr;
  } });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.metrics.shapes, 1);
    assert.equal(result.metrics.connectors, 1);
    assert.ok(fs.existsSync(path.join(receivedWorkDir, "normalized", "001.png")));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("real native rebuild removes native diagram objects from its fidelity residual", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-diagram-"));
  const source = path.join(temporaryRoot, "diagram.png");
  writeThreeCardDiagram(source);
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, createFullSlideResidual });
  try {
    const result = await rebuild({
      root: temporaryRoot,
      metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } },
      ocr: { lines: [
        { text: "Input", box: { x: 130, y: 235, w: 100, h: 30 } },
        { text: "Process", box: { x: 425, y: 235, w: 110, h: 30 } },
        { text: "Output", box: { x: 730, y: 235, w: 100, h: 30 } }
      ] },
      isCancellationRequested: async () => false
    });
    assert.ok(result.metrics.shapes >= 3);
    assert.equal(result.metrics.images, 1);
    assert.equal(result.deck.pages[0].images[0].source.strategy, "full-slide-object-erased-residual");
    assert.equal(result.deck.pages[0].images[0].source.nativeObjectsErased, true);
    assert.equal(result.residual.erasedObjects, result.residual.candidateObjects);
    assert.ok(result.residual.erasedObjects >= 3);
    assert.ok(fs.existsSync(path.join(temporaryRoot, "assets", "deck-p01-full-residual.png")));
    const residualImage = readPng(path.join(temporaryRoot, "assets", "deck-p01-full-residual.png"));
    const nativeCard = result.deck.pages[0].shapes.find((item) => item.type !== "line" && item.box?.w > 50 && item.box?.h > 30);
    assert.ok(nativeCard);
    const sampleX = Math.round(nativeCard.box.x + nativeCard.box.w / 2);
    const sampleY = Math.round(nativeCard.box.y + nativeCard.box.h / 2);
    const sampleOffset = (sampleY * residualImage.width + sampleX) * 4;
    assert.ok([...residualImage.rgba.subarray(sampleOffset, sampleOffset + 3)].every((channel) => channel >= 240));
    assert.ok(result.deck.pages[0].shapes.every((item) => !item.style?.nativeComponentGroupId));
    assert.ok(result.deck.pages[0].textBoxes.every((item) => !item.style?.nativeComponentGroupId));
    assert.equal(path.isAbsolute(result.sourceImage), true);
    assert.ok(fs.existsSync(result.sourceImage));
    assert.equal(result.deck.pages[0].sourceImage, "assets/source.png");
    assert.ok(result.deck.pages[0].textBoxes.every((item) => item.source.pageImage === "assets/source.png"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("full-slide residual builder validates geometry and erases bounded text regions", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-full-residual-"));
  const source = path.join(temporaryRoot, "source.png");
  const output = path.join(temporaryRoot, "assets", "residual.png");
  writeThreeCardDiagram(source);
  try {
    const result = await createFullSlideResidual({
      sourceFile: source,
      outputFile: output,
      textBoxes: [{ box: { x: 120, y: 220, w: 100, h: 30 } }],
      slideSize: { x: 0, y: 0, w: 960, h: 540 },
      isCancellationRequested: async () => false
    });
    assert.equal(result.erasedTextBoxes, 1);
    assert.ok(fs.statSync(output).size > 24);
    await assert.rejects(() => createFullSlideResidual({
      sourceFile: source,
      outputFile: path.join(temporaryRoot, "bad.png"),
      textBoxes: [{ box: { x: 950, y: 530, w: 20, h: 20 } }],
      slideSize: { x: 0, y: 0, w: 960, h: 540 }
    }), /geometry/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("full-slide residual builder erases native objects, bounds volume, and honors cancellation", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-full-residual-objects-"));
  const source = path.join(temporaryRoot, "source.png");
  writeThreeCardDiagram(source);
  try {
    const objects = [
      { type: "roundRect", box: { x: 80, y: 200, w: 200, h: 100 } },
      { type: "line", box: { x: 280, y: 250, w: 100, h: 0 } }
    ];
    const result = await createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "objects.png"), objects, slideSize: { x: 0, y: 0, w: 960, h: 540 } });
    assert.equal(result.erasedObjects, 2);
    assert.equal(result.erasedTextBoxes, 0);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "outside.png"), objects: [{ type: "roundRect", box: { x: 950, y: 530, w: 20, h: 20 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /geometry/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "extreme.png"), objects: Array.from({ length: 30001 }, () => objects[0]), slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /request/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "cancelled.png"), objects: [], slideSize: { x: 0, y: 0, w: 960, h: 540 }, isCancellationRequested: async () => true }), /cancelled/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("residual erase collection deduplicates geometry and excludes explicitly non-editable graphics", () => {
  const box = { x: 10, y: 10, w: 100, h: 40 };
  const objects = residualEraseObjects({
    textBoxes: [{ id: "text-a", box }, { id: "text-b", box }],
    shapes: [{ id: "native", type: "roundRect", box: { x: 150, y: 10, w: 100, h: 40 }, source: { editable: true } }, { id: "raster", type: "roundRect", box: { x: 300, y: 10, w: 100, h: 40 }, source: { editable: false } }],
    tables: [], charts: [], icons: []
  });
  assert.deepEqual(objects.map((item) => item.id), ["text-a", "native"]);
  assert.throws(() => residualEraseObjects({ textBoxes: [{ id: "bad", box: { x: 0, y: 0, w: Number.NaN, h: 1 } }] }), /invalid/);
});

test("team image worker refuses raw images when its pinned OCR profile is not configured", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-raw-disabled-"));
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload") }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false }), /profile is not enabled/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker configuration only permits its dedicated capability and a real builder", () => {
  assert.equal(workerSettings({ OPENXML_BUILDER_EXE: process.execPath }).builderExecutable, process.execPath);
  assert.equal(workerSettings({ OPENXML_BUILDER_EXE: process.execPath }).rawImageOcrProfile.enabled, false);
  assert.deepEqual(workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PROFILE_NAME, COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_SHA256: sha256File(process.execPath), COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES: "eng" }).rawImageOcrProfile.languages, ["eng"]);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "project-audit" }), /only image-to-editable/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: "/not/a/builder" }), /unavailable/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath }), /require COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PADDLE_PROFILE_NAME }), /PADDLEOCR_MODEL_CACHE/);
});

test("team image worker startup diagnostics classify errors without exposing their text", () => {
  assert.equal(startupFailureCode(new Error("OPENXML_BUILDER_EXE is unavailable")), "invalid-builder");
  assert.equal(startupFailureCode(new Error("raw image OCR language pack is unavailable")), "invalid-raw-ocr-profile");
  assert.equal(startupFailureCode(new Error("COMMON_TOOLS_WORKER_ID is invalid")), "invalid-configuration");
  assert.equal(startupFailureCode(new Error("redis password=sensitive")), "provider-initialization");
});

test("image Worker Docker context contains only runtime sources and OpenXML builder inputs", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable.dockerignore"), "utf8");
  assert.match(dockerfile, /COPY skills\/pd-hifi-slideclone\/dotnet\/OpenXmlDeckBuilder \.\/OpenXmlDeckBuilder/);
  assert.match(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js/);
  assert.match(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\/lib/);
  assert.match(dockerfile, /apt-get install --yes --no-install-recommends libicu72 libssl3 libreoffice-impress poppler-utils fonts-noto-cjk fonts-liberation/);
  assert.match(dockerfile, /scripts\/adapters\/render-libreoffice\.js/);
  assert.match(dockerfile, /scripts\/adapters\/diff-pixel-png\.js/);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone \.\/skills\/pd-hifi-slideclone/);
  assert.match(ignore, /^\*\*$/m);
  assert.match(ignore, /^!packages\/\*\*$/m);
  assert.match(ignore, /^!skills\/pd-hifi-slideclone\/dotnet\/OpenXmlDeckBuilder\/\*\*$/m);
  assert.match(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/lib\/\*\*$/m);
  assert.match(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/adapters\/render-libreoffice\.js$/m);
});

test("optional team OCR Docker profile is separate, version-bounded, and never part of the default Compose file", () => {
  const root = path.resolve(__dirname, "..");
  const ocrDockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-ocr"), "utf8");
  const ocrCompose = fs.readFileSync(path.join(root, "deploy", "compose.team-image-ocr.yaml"), "utf8");
  const defaultCompose = fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8");
  assert.match(ocrDockerfile, /^ARG BASE_IMAGE=common-tools-image-to-editable:local/m);
  assert.match(ocrDockerfile, /tesseract-ocr=\$\{TESSERACT_VERSION\}/);
  assert.match(ocrDockerfile, /tesseract-ocr-eng=\$\{TESSERACT_LANGUAGE_VERSION\}/);
  assert.match(ocrDockerfile, /tesseract-ocr-chi-sim=\$\{TESSERACT_LANGUAGE_VERSION\}/);
  assert.match(ocrDockerfile, /COPY --chown=worker:worker packages \.\/packages/);
  assert.match(ocrCompose, /COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
  assert.doesNotMatch(defaultCompose, /COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
});

test("PaddleOCR team image pins the runtime and remains an explicit deployment overlay", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-paddleocr"), "utf8");
  const compose = fs.readFileSync(path.join(root, "deploy", "compose.team-image-paddleocr.yaml"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-paddleocr.dockerignore"), "utf8");
  const requirements = fs.readFileSync(path.join(root, "scripts", "paddleocr-requirements.lock.txt"), "utf8");
  assert.match(requirements, /^paddleocr==3\.7\.0$/m);
  assert.match(requirements, /^paddlepaddle==3\.3\.1$/m);
  assert.match(dockerfile, /paddleocr-requirements\.lock\.txt/);
  assert.match(dockerfile, /PP-OCRv6_small_det/);
  assert.match(dockerfile, /PP-OCRv6_small_rec/);
  assert.match(dockerfile, /image_to_png\.py/);
  assert.match(dockerfile, /rebuild-real-pptx-native\.js/);
  assert.match(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/python\/image_to_png\.py$/m);
  assert.match(dockerfile, /--engine paddle_dynamic/);
  assert.match(compose, /paddleocr-ppocrv6-v1/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE_NORMALIZER_SHA256/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8"), /PADDLEOCR/);
});

test("local deployment script keeps raw OCR opt-in and Plan mode non-mutating", () => {
  const deployScript = fs.readFileSync(path.join(path.resolve(__dirname, ".."), "scripts", "team-runtime-local-deploy.ps1"), "utf8");
  assert.match(deployScript, /\[switch\]\$EnableRawImageOcr/);
  assert.match(deployScript, /\[string\]\$RawImageOcrProvider = 'PaddleOCR'/);
  assert.match(deployScript, /if \(\$Mode -eq 'Apply' -and -not \$SkipRawImageOcrBuild\) \{ Invoke-RawImageOcrImageBuild \}/);
  assert.match(deployScript, /'deploy\/compose\.team-image-paddleocr\.yaml'/);
  assert.match(deployScript, /'deploy\/compose\.team-image-ocr\.yaml'/);
  assert.match(deployScript, /COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER/);
  assert.match(deployScript, /\/opt\/paddleocr\/paddleocr_worker\.py/);
  assert.match(deployScript, /COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK_SHA256/);
  assert.match(deployScript, /deployment = 'No containers or images were changed\.'/);
});
