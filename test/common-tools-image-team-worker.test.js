"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { createImageToEditableArchiveHandler, residualDeduplicationStatus } = require("../packages/slideclone-core/team-worker");
const { boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual } = require("../packages/slideclone-core/team-native-rebuild");
const { PRODUCTION_PROFILE_NAME } = require("../packages/slideclone-core/native-rebuild-profile");
const { PROFILE_NAME, sha256File } = require("../packages/slideclone-core/team-ocr-profile");
const { PROFILE_NAME: PADDLE_PROFILE_NAME } = require("../packages/slideclone-core/team-paddleocr-profile");
const { createNativeRebuilder, startupFailureCode, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { eraseMasks, readPng, rebuildDeckFromWorkDir } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
const { createFullSlideResidualBuilder } = require("../skills/pd-hifi-slideclone/scripts/lib/full-slide-native-residual");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel } = require("../packages/slideclone-core/knowledge-graph-native");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const { refineKnowledgeGraphIconCrops } = require("../skills/pd-hifi-slideclone/scripts/lib/knowledge-graph-icon-crops");

const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });

test("rebuilt metadata admits local sources and bounded counters without evaluating getters", t => {
  const { admitRebuiltPageMetadata } = require("../packages/slideclone-core/rebuilt-page-metadata");
  const pageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rebuilt-metadata-"));
  t.after(() => fs.rmSync(pageRoot, { recursive: true, force: true }));
  const sourceInputFile = path.join(pageRoot, "source.png");
  fs.writeFileSync(sourceInputFile, "fixture");
  const context = { pageRoot, sourceInputFile };
  assert.deepEqual(admitRebuiltPageMetadata({}, context), { sourceImage: sourceInputFile, residual: null, reconstructionProfile: null, nativeComponentQuality: null });
  const input = { residual: { candidateObjects: 2, erasedObjects: 1 }, reconstructionProfile: "test-v1", nativeComponentQuality: { passed: true, metrics: { connectors: 3 } } };
  const output = admitRebuiltPageMetadata(input, context);
  assert.equal(output.nativeComponentQuality.metrics.connectors, 3);
  assert.equal(output.nativeComponentQuality.metrics.minimumUnitCrops, 0);
  assert.ok(Object.isFrozen(output.residual));
  let getters = 0;
  for (const key of ["sourceImage", "residual", "reconstructionProfile", "nativeComponentQuality"]) {
    assert.throws(() => admitRebuiltPageMetadata(Object.defineProperty({}, key, { get() { getters++; return null; } }), context), /data properties/);
  }
  assert.equal(getters, 0);
  for (const count of [-1, NaN, Infinity, "2", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => admitRebuiltPageMetadata({ residual: { candidateObjects: count } }, context), /metric/);
    assert.throws(() => admitRebuiltPageMetadata({ nativeComponentQuality: { passed: true, metrics: { connectors: count } } }, context), /metric/);
  }
  assert.throws(() => admitRebuiltPageMetadata({ residual: { candidateObjects: 1, erasedObjects: 2 } }, context), /inconsistent/);
  assert.throws(() => admitRebuiltPageMetadata({ sourceImage: __filename }, context), /outside/);
  assert.throws(() => admitRebuiltPageMetadata({ sourceImage: "../secret" }, context), /invalid/);
  assert.throws(() => admitRebuiltPageMetadata({ nativeComponentQuality: { passed: "true" } }, context), /status/);
});

test("Worker residual composition needs only the historical deck rebuilder and preserves pixels", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worker-core-residual-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const png = require("../packages/slideclone-core/png");
  const inputFile = path.join(root, "source.png");
  const width = 96; const height = 54;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const black = (x, y) => rgba.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  black(2, 2);
  for (let y = 20; y < 30; y++) for (let x = 20; x < 40; x++) black(x, y);
  png.writePng(inputFile, { width, height, rgba });
  const original = fs.readFileSync(inputFile);
  let calls = 0;
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    loadImplementation: () => ({
      rebuildDeckFromWorkDir(workDir) {
        calls++;
        const ir = JSON.parse(fs.readFileSync(path.join(workDir, "ir/deck.json"), "utf8"));
        ir.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 200, y: 200, w: 200, h: 100 }, source: { editable: true } });
        return ir;
      },
      get eraseMasks() { throw new Error("legacy eraseMasks must not be accessed"); },
      get readPng() { throw new Error("legacy readPng must not be accessed"); }
    })
  });
  const result = await rebuild({ root, metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: width, heightPx: height } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
  assert.equal(calls, 1);
  assert.equal(result.nativeComponentQuality.passed, true);
  assert.deepEqual(result.deck.meta.residualDeduplication, { candidateObjects: 1, erasedObjects: 1 });
  const residual = png.readPng(path.join(root, "assets/deck-p01-full-residual.png"));
  const expected = Buffer.alloc(width * height * 4, 255);
  expected.fill(0, (2 * width + 2) * 4, (2 * width + 2) * 4 + 3);
  assert.deepEqual(residual.rgba, expected);
  assert.deepEqual(fs.readFileSync(inputFile), original);
});

test("Worker rejects rebuild accessors before evaluating them or copying page output", async t => {
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),"rebuild-data-boundary-"));
  t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
  const source=fs.readFileSync(path.join(__dirname,"..","skills","pd-hifi-slideclone","examples","ocr-text-smoke.source.png"));
  for(const location of ["result", "page", "sourceImage", "residual", "nativeComponentQuality"]) {
    let getters=0,uploads=0;
    const handler=createImageToEditableArchiveHandler({temporaryRoot,
      rawImageOcr:async()=>({lines:[]}),
      rawImageRebuilder:async({metadata})=>{
        const deck=boundedOcrSourceDeck({metadata,ocr:{lines:[]},sourceImage:metadata.assetPath});
        const result={deck};
        Object.defineProperty(location === "page" ? deck.pages[0] : result, location === "result" ? "deck" : location === "page" ? "shapes" : location,{enumerable:true,get(){getters++;throw new Error("private-sentinel");}});
        return result;
      },
      objectStore:{readObject:async()=>archive([tarEntry("assets/source.png",source)]),putObject:async()=>{uploads++;}}
    });
    await assert.rejects(()=>handler({job:{capability:"image-to-editable",inputObjectKey:"owners/a/input.tar.gz",outputPrefix:"owners/a/jobs/check/"},isCancellationRequested:async()=>false}),/data propert/u);
    assert.equal(getters,0);assert.equal(uploads,0);
    assert.deepEqual(fs.readdirSync(temporaryRoot),[]);
  }
});

test("Worker rejects live OCR accessors before rebuilding or uploading", async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-admission-worker-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let getters = 0;
  const handler = createImageToEditableArchiveHandler({ temporaryRoot,
    rawImageOcr: async () => ({ get lines() { getters++; return []; } }),
    rawImageRebuilder: async () => assert.fail("must not rebuild rejected OCR"),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload rejected OCR") }
  });
  await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/check/" }, isCancellationRequested: async () => false }), error => error.code === "IMAGE_OCR_FAILED");
  assert.equal(getters, 0);
  assert.deepEqual(fs.readdirSync(temporaryRoot), []);
});

test("Worker stops invalid normalized page paths before OCR", async t => {
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),"normalized-path-worker-"));
  t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
  let ocrCalls=0;
  const pdf=Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
  const handler=createImageToEditableArchiveHandler({temporaryRoot,
    documentNormalizer:async()=>({pages:1,assets:1,sources:[{inputFile:"outside.png",assetPath:"../outside.png",dimensions:{widthPx:960,heightPx:540},pageIndex:0}]}),
    rawImageOcr:async()=>{ocrCalls++;return {lines:[]};},
    rawImageRebuilder:async()=>assert.fail("must not rebuild"),
    objectStore:{readObject:async()=>archive([tarEntry("assets/source.pdf",pdf)]),putObject:async()=>assert.fail("must not upload")}
  });
  await assert.rejects(()=>handler({job:{capability:"image-to-editable",inputObjectKey:"owners/a/input.tar.gz",outputPrefix:"owners/a/jobs/check/"},isCancellationRequested:async()=>false}),error=>error.code === "IMAGE_NORMALIZATION_FAILED");
  assert.equal(ocrCalls,0);assert.deepEqual(fs.readdirSync(temporaryRoot),[]);
});

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

test("image Worker delivers the selected refinement IR and PPTX, preserving the baseline on rejection", async (t) => {
  for (const accepted of [true, false]) await t.test(accepted ? "accepted" : "rejected", async (t) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-refinement-flow-"));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    const builderFile = path.join(temporaryRoot, "builder.cjs");
    fs.writeFileSync(builderFile, "const fs=require('fs');const args=process.argv;const ir=JSON.parse(fs.readFileSync(args[args.indexOf('--ir')+1]));fs.writeFileSync(args[args.indexOf('--out')+1],'PPTX:'+ir.pages[0].textBoxes[0].font.sizePt);");
    const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
    let baselineSize, deliveredSize, uploaded, refinements = 0, verifications = 0;
    const report = passed => ({ passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }], metrics: { "pixel-diff-ratio": passed ? 0.03 : 0.1 } });
    const handler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageOcr: async () => ({ lines: [{ text: "测试文字", box: { x: 10, y: 10, w: 100, h: 20 } }] }),
      rawImageRebuilder: async ({ metadata, ocr }) => {
        const deck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: metadata.assetPath });
        baselineSize = deck.pages[0].textBoxes[0].font.sizePt;
        deck.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 100, y: 100, w: 100, h: 50 }, source: { editable: true } });
        return { deck };
      },
      rawImageQualityVerifier: async ({ root, collectRenderedPages }) => { verifications++; if (collectRenderedPages) collectRenderedPages([path.join(root, "render.png")]); return report(verifications > 1); },
      rawImageTextRefiner: async request => {
        refinements++;
        assert.equal(request.renderedImages.length, 1);
        const deck = structuredClone(request.deck); deck.pages[0].textBoxes[0].font.sizePt += 2;
        const deckFile = path.join(request.root, "candidate.json"), pptxFile = path.join(request.root, "candidate.pptx");
        fs.writeFileSync(deckFile, JSON.stringify(deck));
        await request.buildCandidate({ deckFile, pptxFile });
        const quality = await request.verifyCandidate({ deck, pptxFile });
        return { deck, deckFile, pptxFile, quality, accepted, changedTextBoxes: 1, skippedPixelBudget: accepted ? 0 : 123 };
      },
      createDelivery: async ({ irFile, pptxFile }) => {
        deliveredSize = JSON.parse(fs.readFileSync(irFile)).pages[0].textBoxes[0].font.sizePt;
        return { checks: [], artifacts: [{ name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }] };
      },
      objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async ({ body }) => { uploaded = body.toString(); } }
    });
    const result = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/refinement/" }, isCancellationRequested: async () => false });
    assert.equal(refinements, 1); assert.equal(verifications, 2);
    assert.equal(deliveredSize, baselineSize + (accepted ? 2 : 0));
    assert.equal(uploaded, `PPTX:${deliveredSize}`);
    assert.equal(result.quality.passed, accepted);
    assert.equal(result.quality.metrics["text-refinement-accepted"], Number(accepted));
    assert.equal(result.quality.metrics["text-refinement-skipped-pixel-budget"], accepted ? undefined : 123);
    if (!accepted) assert.equal(result.quality.checks.some(check => check.name === "visual-fidelity" && check.passed === false), true);
  });
});

test("OCR checkpoint survives reconstruction failure and a fresh Worker handler without bypassing quality", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-stage-retry-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "require('fs').writeFileSync(process.argv[process.argv.indexOf('--out')+1],Buffer.from('PK\\x03\\x04'))");
  const source = fs.readFileSync(path.resolve("skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  const input = archive([tarEntry("assets/source.png", source)]);
  const prefix = require("../packages/team-runtime/job-input").ownerPrefix("checkpoint-test-owner");
  const id = "1e4a9e5c-4f5f-4c7e-9f44-84725a42a1ad";
  const job = { id, ownerId: "checkpoint-test-owner", capability: "image-to-editable", inputObjectKey: `${prefix}inputs/source.tar.gz`, outputPrefix: `${prefix}jobs/${id}/attempts/1/`, attempt: 1 };
  const objects = new Map(); const roots = []; let ocrCalls = 0; let rebuildCalls = 0;
  const options = {
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile], ocrCheckpointFingerprint: "a".repeat(64),
    objectStore: {
      async readObject({ objectKey }) {
        if (objectKey === job.inputObjectKey) return input;
        if (objects.has(objectKey)) return objects.get(objectKey);
        const error = new Error("missing object"); error.name = "NoSuchKey"; throw error;
      },
      async putObject({ objectKey, body }) { objects.set(objectKey, Buffer.from(body)); }
    },
    async rawImageOcr() { ocrCalls++; return { lines: [{ text: "Editable label", confidence: 0.99, box: { x: 8, y: 8, w: 100, h: 20 } }] }; },
    async rawImageRebuilder({ root, metadata, ocr }) {
      roots.push(root); rebuildCalls++;
      if (rebuildCalls === 1) throw new Error("injected reconstruction failure");
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 4, y: 4, w: 120, h: 40 }, source: { editable: true } });
      return { deck: rebuilt };
    }
  };
  await assert.rejects(createImageToEditableArchiveHandler(options)({ job, isCancellationRequested: async () => false }), (error) => error.code === "IMAGE_REBUILD_FAILED");
  assert.equal(fs.existsSync(roots[0]), false);
  const recoveredJob = { ...job, attempt: 2, outputPrefix: `${prefix}jobs/${id}/attempts/2/` };
  const result = await createImageToEditableArchiveHandler(options)({ job: recoveredJob, isCancellationRequested: async () => false });
  assert.equal(ocrCalls, 1);
  assert.equal(rebuildCalls, 2);
  assert.notEqual(roots[0], roots[1]);
  assert.equal(result.quality.passed, false);
  assert.ok(result.quality.checks.some(check => check.name === "quality-render-not-configured" && check.passed === false));
  assert.equal(fs.existsSync(roots[1]), false);
  const checkpoints = [...objects.keys()].filter(key => key.includes("/.internal/ocr/"));
  assert.equal(checkpoints.length, 1);
  assert.ok(checkpoints[0].startsWith(`${prefix}jobs/${id}/.internal/ocr/`));
  assert.ok(result.artifacts.every(artifact => artifact.objectKey.startsWith(recoveredJob.outputPrefix)));
  const retainedKeys = await require("../packages/team-runtime/retention-output-keys").collectRetentionOutputKeys({
    prefix: `${prefix}jobs/${id}/`, listPage: async () => ({ keys: [...objects.keys()], nextToken: null })
  });
  assert.ok(retainedKeys.includes(checkpoints[0]), "checkpoint participates in ordinary job retention");
});

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

test("image worker classifies external stage failures and cleans temporary artifacts", async (t) => {
  const { storedWorkerFailure } = require("../packages/team-runtime/worker-failure");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-stage-failures-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, "require('node:fs').writeFileSync(process.argv[process.argv.indexOf('--out')+1], 'PK-fixture');");
  const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  const rawArchive = archive([tarEntry("assets/source.png", source)]);
  const fail = () => { throw new Error("private-provider-token"); };
  const job = { capability: "image-to-editable", inputObjectKey: "input", outputPrefix: "output/" };
  for (const stage of ["INPUT_READ", "NORMALIZATION", "OCR", "REBUILD", "BUILD", "QUALITY", "UPLOAD"]) {
    let uploads = 0;
    const handler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath,
      builderArgs: stage === "BUILD" ? ["-e", "process.stderr.write('private-provider-token');process.exit(3)", "--"] : [builderFile],
      objectStore: {
        readObject: stage === "INPUT_READ" ? fail : async () => stage === "NORMALIZATION" ? archive([tarEntry("assets/source.pdf", "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n")]) : rawArchive,
        putObject: async () => { uploads++; if (stage === "UPLOAD") fail(); }
      },
      documentNormalizer: fail,
      rawImageOcr: stage === "OCR" ? fail : async () => ({ lines: [] }),
      rawImageRebuilder: stage === "REBUILD" ? fail : async ({ metadata, ocr }) => {
        const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
        rebuilt.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 4, y: 4, w: 20, h: 20 } });
        return { deck: rebuilt };
      },
      rawImageQualityVerifier: stage === "QUALITY" ? fail : async () => ({ checks: [{ name: "fixture", passed: true }], metrics: {} })
    });
    const spans = [];
    const traced = require("../packages/remote-mcp-server/telemetry").createTracedWorkerHandler(handler, { capability: "image-to-editable", exporter: { exportSpan(value) { spans.push(value); } } });
    await assert.rejects(traced({ job, isCancellationRequested: async () => false }), (error) => {
      const stored = storedWorkerFailure(error);
      assert.equal(stored.code, `IMAGE_${stage}_FAILED`);
      assert.equal(stored.retryable, false);
      assert.equal(JSON.stringify(stored).includes("private-provider-token"), false);
      return true;
    });
    const stageSpans = spans.filter((span) => span.spanName === "common-tools.worker.stage");
    assert.equal(stageSpans.at(-1).stage, `IMAGE_${stage}_FAILED`);
    assert.equal(stageSpans.at(-1).statusCode, 500);
    const workerSpan = spans.at(-1);
    for (const span of stageSpans) {
      assert.equal(span.traceParent.split("-")[1], workerSpan.identity.traceId);
      assert.equal(span.traceParent.split("-")[2], workerSpan.identity.spanId);
    }
    assert.doesNotMatch(JSON.stringify(spans), /private-provider-token|inputObjectKey|outputPrefix/);
    assert.equal(uploads, stage === "UPLOAD" ? 1 : 0);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  }
});

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
    assert.equal(output.quality.checks.some((check) => check.name === "visual-fidelity"), false);
    assert.equal(output.quality.metrics.pages, 1);
    assert.equal(uploads.get("owners/a/jobs/job-1/deck.pptx").contentType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(fs.readdirSync(temporaryRoot).filter((entry) => entry !== "builder.js").length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

for (const cancellationMode of ["requested", "check-failed"]) {
test(`team image worker stops an active builder on cancellation (${cancellationMode}) and can run again`, { timeout: 15000 }, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-builder-cancel-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  const ready = path.join(temporaryRoot, "ready.json");
  const finished = path.join(temporaryRoot, "finished");
  fs.writeFileSync(builderFile, `const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid }));
    setTimeout(() => { fs.writeFileSync(process.argv[process.argv.indexOf('--out') + 1], 'PK-fixture'); fs.writeFileSync(${JSON.stringify(finished)}, 'finished'); }, 2000);`);
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async () => { uploads += 1; }
    }
  });
  const job = { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/cancel-build/" };
  try {
    await assert.rejects(() => handler({ job, isCancellationRequested: async () => {
      if (!fs.existsSync(ready)) return false;
      if (cancellationMode === "check-failed") throw new Error("private-cancellation-provider-content");
      return true;
    } }), error => error.code === "IMAGE_BUILD_FAILED" && error.cause?.message === "editable job was cancelled");
    const { pid } = JSON.parse(fs.readFileSync(ready, "utf8"));
    assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
    assert.equal(fs.existsSync(finished), false);
    assert.equal(uploads, 0);
    assert.equal(fs.readdirSync(temporaryRoot).some(name => name.startsWith("common-tools-editable-")), false);
    const result = await handler({ job, isCancellationRequested: async () => false });
    assert.equal(result.quality.passed, true);
    assert.equal(uploads, 1);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

}

test("team image worker compares a fully sourced structured Deck IR against its admitted page images", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-structured-source-quality-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const sourced = deck();
  sourced.pages[0].source = { pageImage: "assets/source.png" };
  let request;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageQualityVerifier: async (value) => { request = value; return { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }; },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(sourced)), tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/structured-quality/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, true);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["deck-ir-validated", "assets-resolved", "quality-rendered", "visual-fidelity", "pptx-generated"]);
    assert.deepEqual(request.sourceImages, [path.join(request.root, "assets", "source.png")]);
    assert.equal(request.deck.pages.length, 1);
    assert.equal(request.deck.pages[0].source.pageImage, "assets/source.png");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rejects partial structured source evidence before build and reports structured verifier failures", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-structured-source-reject-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const partial = deck();
  partial.pages.push(structuredClone(partial.pages[0])); partial.pages[1].pageIndex = 1;
  partial.pages[0].source = { pageImage: "assets/source.png" };
  const baseJob = { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/structured-reject/" };
  try {
    const rejectHandler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageQualityVerifier: async () => assert.fail("must not compare partial sources"),
      objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(partial)), tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload") }
    });
    await assert.rejects(() => rejectHandler({ job: baseJob, isCancellationRequested: async () => false }), /source\.pageImage must be declared for every page/);
    const complete = deck(); complete.pages[0].source = { pageImage: "assets/source.png" };
    for (const response of [null, { checks: [], metrics: {} }, { checks: [{ name: "quality-rendered", passed: false }], metrics: {} }]) {
    const failedHandler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageQualityVerifier: response === null ? undefined : async () => response,
      objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(complete)), tarEntry("assets/source.png", source)]), putObject: async () => {} }
    });
    const output = await failedHandler({ job: { ...baseJob, outputPrefix: "owners/a/jobs/structured-failed/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "quality-rendered"), { name: "quality-rendered", passed: false });
    }
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("structured source image resolver rejects empty, malicious, missing, and ambiguous page evidence", t => {
  const { resolveStructuredSourceImages } = require("../packages/slideclone-core/structured-source-images");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "structured-source-image-resolver-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets")); fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), path.join(root, "assets", "source.png"));
  assert.throws(() => resolveStructuredSourceImages({ pages: [] }, root), /invalid page count/);
  assert.equal(resolveStructuredSourceImages({ pages: [{ source: { origin: "legacy" } }, {}] }, root), null);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "../private.png" } }] }, root), /unsafe asset path|inside assets/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/missing.png" } }] }, root), /missing/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/source.png" } }, {}] }, root), /declared for every page/);
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

test("delivery artifact boundary bounds files and rechecks them after asynchronous work", () => {
  const { prepareDeliveryArtifacts, readDeliveryArtifact, MAX_ARTIFACT_BYTES } = require("../packages/slideclone-core/delivery-artifacts");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-delivery-boundary-"));
  const file = path.join(root, "deck.pdf");
  const item = { name: "deck.pdf", file, mediaType: "application/pdf" };
  try {
    fs.writeFileSync(file, "%PDF");
    const prepared = prepareDeliveryArtifacts([item], root);
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared[0]));
    assert.equal(readDeliveryArtifact(prepared[0], root).toString(), "%PDF");
    assert.equal(prepareDeliveryArtifacts(Array.from({ length: 32 }, (_, index) => ({ ...item, name: `deck-${index}.pdf` })), root).length, 32);
    for (const value of [null, {}, [null], [[]], [{ ...item, name: "../deck.pdf" }], [{ ...item, name: "a".repeat(129) }], [{ ...item, file: root }], [{ ...item, mediaType: "text/html" }], [{ ...item, file: path.join(root, "..", "private.pdf") }]]) assert.throws(() => prepareDeliveryArtifacts(value, root), /editable delivery artifact/);
    fs.truncateSync(file, 0);
    assert.throws(() => readDeliveryArtifact(prepared[0], root), /editable delivery artifact/);
    fs.truncateSync(file, MAX_ARTIFACT_BYTES + 1);
    assert.throws(() => prepareDeliveryArtifacts([item], root), /editable delivery artifact/);
    fs.unlinkSync(file);
    assert.throws(() => readDeliveryArtifact(prepared[0], root), error => error.message === "editable delivery artifact file is invalid");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const invalidList of ["invalid-last", "missing-last", "duplicate", "oversized", "empty", "quality-type", "quality-duplicate", "quality-oversized"]) {
test(`team image worker validates the entire delivery result before uploads (${invalidList})`, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-artifact-admission-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, "require('node:fs').writeFileSync(process.argv[process.argv.indexOf('--out') + 1], 'PK-fixture');");
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: ({ root, pptxFile }) => {
      const item = { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
      const lists = {
        "invalid-last": [item, { ...item, name: "../outside.pptx" }],
        "missing-last": [item, { ...item, name: "missing.pptx", file: path.join(root, "missing-private-file.pptx") }],
        duplicate: [item, { ...item }],
        oversized: Array.from({ length: 33 }, (_, index) => ({ ...item, name: `deck-${index}.pptx` })),
        empty: [],
        "quality-type": [item], "quality-duplicate": [item], "quality-oversized": [item]
      };
      const checks = invalidList === "quality-type" ? [{ name: "adapter-check", passed: "true" }]
        : invalidList === "quality-duplicate" ? [{ name: "pptx-generated", passed: true }]
          : invalidList === "quality-oversized" ? Array.from({ length: 33 }, (_, index) => ({ name: `adapter-${index}`, passed: true })) : [];
      return { checks, artifacts: lists[invalidList] };
    },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]), putObject: async () => { uploads += 1; } }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/invalid-artifacts/" }, isCancellationRequested: async () => false }), error => /editable delivery artifact|quality/.test(error.message) && !error.message.includes("private-file"));
    assert.equal(uploads, 0);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});
}

for (const cancelAfter of ["delivery", "first-upload", "last-upload"]) {
test(`team image worker rejects completion when cancelled after ${cancelAfter}`, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-delivery-cancel-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, "require('node:fs').writeFileSync(process.argv[process.argv.indexOf('--out') + 1], 'PK-fixture');");
  let cancelled = false;
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: async ({ root, pptxFile }) => {
      const metadataFile = path.join(root, "delivery.json");
      fs.writeFileSync(metadataFile, "{}");
      cancelled = cancelAfter === "delivery";
      return { checks: [], artifacts: [
        { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        { name: "delivery.json", file: metadataFile, mediaType: "application/json" }
      ] };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async () => { uploads += 1; cancelled = cancelAfter === "first-upload" || (cancelAfter === "last-upload" && uploads === 2); }
    }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/delivery-cancel/" }, isCancellationRequested: async () => cancelled }), /editable job was cancelled/);
    assert.equal(uploads, { delivery: 0, "first-upload": 1, "last-upload": 2 }[cancelAfter]);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});
}

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
  const semanticResults = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async ({ pageIndex }) => { calls.push(`ocr-${pageIndex}`); return { lines: [] }; },
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      calls.push(`rebuild-${pageIndex}`);
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: `shape-${pageIndex}`, type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true, pageImage: metadata.assetPath } });
      const semanticNative = Object.freeze({ matched: true, addedShapes: 1, connectors: 0 });
      rebuilt.meta = { ...(rebuilt.meta || {}), semanticNative };
      semanticResults.push(semanticNative);
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
    assert.deepEqual(semanticResults, [{ matched: true, addedShapes: 1, connectors: 0 }, { matched: true, addedShapes: 1, connectors: 0 }]);
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

test("team image worker retains an OCR-only raw-image diagnostic artifact while failing graphical editability", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-overlay-only-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "overlay only", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => ({ deck: boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" }) }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async ({ objectKey, body }) => uploads.set(objectKey, body) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-graphics-rebuilt"), { name: "native-graphics-rebuilt", passed: false });
    assert.equal(output.artifacts.length, 1);
    assert.ok(uploads.has("owners/a/jobs/job-raw/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker retains a batch diagnostic artifact when one page has no native graphics", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-batch-graphics-gate-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      if (pageIndex === 1) rebuilt.pages[0].shapes.push({ id: "native-shape", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true } });
      return { deck: rebuilt, nativeComponentQuality: { passed: pageIndex === 1, metrics: { connectors: 0, minimumUnitCrops: 0, evidencedMinimumUnitCrops: 0, unverifiedMinimumUnitCrops: 0 } } };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async ({ objectKey, body }) => uploads.set(objectKey, body) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/batch.tar.gz", outputPrefix: "owners/a/jobs/job-batch/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(output.quality.metrics["native-shapes"], 1);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-graphics-rebuilt"), { name: "native-graphics-rebuilt", passed: false });
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-component-quality"), { name: "native-component-quality", passed: false });
    assert.ok(uploads.has("owners/a/jobs/job-batch/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw native rebuild adapter materializes a bounded work IR and requires graphical output", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-adapter-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  let receivedWorkDir; let receivedOptions;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: (workDir, options) => {
    receivedWorkDir = workDir;
    receivedOptions = options;
    const sourceIr = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    assert.equal(sourceIr.pages[0].sourceImage, "normalized/001.png");
    assert.ok(fs.existsSync(path.join(workDir, sourceIr.pages[0].sourceImage)));
    sourceIr.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 1, y: 1, w: 20, h: 0 }, source: { editable: true } });
    return sourceIr;
  } });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.metrics.shapes, 1);
    assert.equal(result.metrics.connectors, 1);
    assert.equal(result.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    assert.equal(result.nativeComponentQuality.passed, true);
    assert.equal(result.deck.meta.nativeComponentQuality.passed, true);
    assert.equal(receivedOptions.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    assert.equal(receivedOptions.vectorizeStatusIcons, false);
    assert.equal(receivedOptions.objectifyLayerConnectors, true);
    assert.equal(receivedOptions.objectifyStructuredVisualAtomText, true);
    assert.ok(fs.existsSync(path.join(receivedWorkDir, "normalized", "001.png")));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw native rebuild returns failed component quality for the final gate", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-component-quality-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: (workDir) => {
    const rebuilt = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    rebuilt.pages[0].shapes.push({ id: "unsupported-relationship-arrow", type: "triangle", box: { x: 1, y: 1, w: 20, h: 20 }, source: { editable: true, role: "relationship" } });
    return rebuilt;
  } });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.nativeComponentQuality.passed, false);
    assert.ok(result.nativeComponentQuality.findings.some((finding) => finding.code === "standalone-relationship-arrow"));
    assert.equal(result.deck.meta.nativeComponentQuality.passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("remote image path reconstructs a high-confidence three-panel knowledge graph as native structure", () => {
  const box = (text, x, y, w = 100, h = 24) => ({ id: text, text, box: { x, y, w, h } });
  const page = { textBoxes: [
    box("动态本体：知识图谱升级", 190, 20, 520, 42),
    box("传统知识图谱问题", 60, 105, 180, 28), box("动态本体思路", 385, 105, 160, 28), box("本体生长能力", 710, 105, 160, 28),
    box("系统A", 80, 260), box("系统B", 200, 290), box("系统C", 100, 380),
    box("翻译层", 430, 190), box("人员", 445, 285), box("属性", 360, 355), box("事件", 540, 355),
    box("✓", 360, 205, 28, 28), box("✓", 570, 205, 28, 28), box("✓", 360, 390, 28, 28),
    box("高空事件", 700, 190), box("工单文本", 700, 285), box("视频数据", 700, 320), box("新型事件", 820, 285),
    box("数据接入层", 105, 560), box("本体生成层", 420, 560), box("应用服务层", 730, 560)
  ], shapes: [{ id: "bad-check", type: "ellipse", box: { x: 400, y: 300, w: 20, h: 20 }, source: { detector: "simple-status-icon" } }], images: [] };
  assert.ok(findKnowledgeGraphPanelModel(page.textBoxes, { widthPt: 960, heightPt: 720 }));
  const rebuilt = applyKnowledgeGraphPanelNativeRebuild(page, { widthPt: 960, heightPt: 720 }, { sourceImageWidthPx: 944 });
  assert.equal(rebuilt.matched, true);
  assert.ok(rebuilt.addedShapes >= 11);
  assert.ok(rebuilt.connectors >= 6);
  assert.equal(page.shapes.some((item) => item.id === "bad-check"), false);
  assert.ok(page.shapes.filter((item) => item.source?.nativeComponentRole === "node").every((item) => item.type === "roundRect" && item.style.fill === "#FFFFFF"));
  const frames = page.shapes.filter((item) => item.source?.preserveResidualInterior === true);
  assert.equal(frames.length, 4);
  assert.ok(frames.every((item) => item.type === "roundRect" && item.style.fill === "#F8FAFC"));
  assert.equal(page.shapes.filter((item) => item.source?.nativeComponentRole === "node").length, 5);
  const translatorFrame = page.shapes.find((item) => item.id === "team-knowledge-graph-node-2").box;
  const translatorLink = page.shapes.find((item) => item.id === "team-knowledge-graph-translator-hub").box;
  // A relationship must leave the node boundary, not run through its editable label.
  assert.ok(Math.abs(translatorLink.y - (translatorFrame.y + translatorFrame.h)) < 0.02);
  assert.ok(translatorLink.x >= translatorFrame.x && translatorLink.x <= translatorFrame.x + translatorFrame.w);
  const curvedRelationships = page.shapes.filter((item) => item.type === "arc");
  assert.equal(curvedRelationships.length, 2);
  assert.ok(curvedRelationships.every((item) => item.style.stroke === "#4F81E0" && item.style.strokeWidthPt === 2 && item.style.lineCap === "round"));
  assert.ok(curvedRelationships.every((item) => item.style.endArrowWidth === "medium" && item.style.endArrowLength === "medium"));
  assert.equal(curvedRelationships.filter((item) => item.style.endArrow === "triangle").length, 1);
  assert.equal(curvedRelationships.filter((item) => item.style.startArrow === "triangle").length, 1);
  const upperArc = curvedRelationships.find((item) => item.id.endsWith("right-high-target"));
  assert.equal(upperArc.style.endArrow, "triangle");
  assert.equal(upperArc.style.startArrow, undefined);
  assert.equal(page.shapes.some((item) => item.source?.detector === "team-knowledge-graph-node-6"), false);
  assert.equal(page.textBoxes.some((item) => item.text === "✓"), false);
  assert.deepEqual(page.source.semanticNativeStructure.connectorCalibration, {
    strokeWidthPt: 2, observedStrokeWidthPx: 2, pixelsPerPoint: 944 / 960,
    sampleCount: 1, usedFallback: false, quantumPt: 0.25, sourceImageWidthPx: 944
  });
  assert.deepEqual(page.intent, { rasterBackgroundAllowed: true, primarySemanticStructureNative: true, semanticStructureProfile: "knowledge-graph-three-panel-v1" });
  assert.equal(applyKnowledgeGraphPanelNativeRebuild({ textBoxes: [box("普通图片", 10, 10)], shapes: [] }, { widthPt: 960, heightPt: 720 }).matched, false);
});

test("full-slide residual is omitted only after semantic structure, icon refinement, and pictorial connectors all succeed", () => {
  assert.equal(shouldOmitFullSlideResidual({ matched: true, imageRefinement: { matched: true }, pictorialConnectors: { matched: true } }), true);
  assert.equal(shouldOmitFullSlideResidual({ matched: true, imageRefinement: { matched: true }, pictorialConnectors: { matched: false } }), false);
  assert.equal(shouldOmitFullSlideResidual({ matched: false }), false);
  assert.equal(shouldOmitFullSlideResidual(null), false);
});

test("knowledge graph rebuild uses pre-crop OCR and removes crops that own native cards or routes", () => {
  const box = (text, x, y, w = 100, h = 24) => ({ id: `source-${text}`, text, box: { x, y, w, h }, font: { family: "Microsoft YaHei", sizePt: 16, opacity: 0 }, style: { visibility: "hidden", opacity: 0 } });
  const semanticTextBoxes = [
    box("动态本体：知识图谱升级", 190, 20, 520, 42),
    box("传统知识图谱问题", 60, 105, 180, 28), box("动态本体思路", 385, 105, 160, 28), box("本体生长能力", 710, 105, 160, 28),
    box("公安系统", 80, 260), box("监控系统", 200, 290), box("12345工单", 100, 380),
    box("翻译层", 430, 190, 60, 24), box("人员", 445, 285, 58, 37),
    box("高空抛物", 700, 190, 84, 25), box("工单文本\n视频数据", 700, 285, 84, 48), box("新型事件", 820, 285, 82, 30),
    box("可信连接层", 105, 560, 140, 31), box("动态本体层", 420, 560, 130, 31), box("智能体应用层", 730, 560, 145, 31),
    box("升级终点：感知→决策→行动→反馈", 288, 656, 384, 36)
  ];
  const page = {
    textBoxes: semanticTextBoxes.filter((item) => !/翻译层|工单文本/u.test(item.text)).map((item) => ({ ...item, font: { ...item.font, opacity: 1 }, style: { visibility: "visible", opacity: 1 } })),
    shapes: [],
    images: [
      { id: "mixed-translator-crop", box: { x: 338, y: 150, w: 194, h: 118 }, source: { strategy: "local-fidelity-crop" } },
      { id: "standalone-icon", box: { x: 526, y: 153, w: 70, h: 82 }, source: { strategy: "local-fidelity-crop" } },
      { id: "bottom-route-crop", box: { x: 145, y: 628, w: 120, h: 78 }, source: { strategy: "local-fidelity-crop" } }
    ]
  };
  const rebuilt = applyKnowledgeGraphPanelNativeRebuild(page, { widthPt: 960, heightPt: 720 }, { semanticTextBoxes });
  assert.equal(rebuilt.matched, true);
  assert.equal(rebuilt.restoredTextBoxes, 2);
  assert.equal(rebuilt.removedCrops, 1);
  assert.deepEqual(page.images.map((item) => item.id), ["mixed-translator-crop", "standalone-icon"]);
  assert.ok(page.textBoxes.filter((item) => /翻译层|工单文本/u.test(item.text)).every((item) => item.style.visibility === "visible" && item.font.opacity === 1));
  assert.ok(page.shapes.some((item) => item.source?.detector === "team-knowledge-graph-feedback-left-up"));
  assert.ok(rebuilt.connectors >= 10);
});

test("knowledge graph crop refiner replaces mixed central crops with four bounded icon assets", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-knowledge-crops-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 960; const height = 720; const rgba = Buffer.alloc(width * height * 4, 255);
  for (const [x, y, w, h] of [[350, 160, 50, 50], [535, 160, 48, 50], [350, 355, 58, 55], [530, 355, 52, 60]]) {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) {
      const offset = (py * width + px) * 4; rgba[offset] = 20; rgba[offset + 1] = 105; rgba[offset + 2] = 225;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const page = {
    source: { semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1" } },
    shapes: [
      { type: "line", box: { x: 440, y: 280, w: -40, h: -70 }, source: { detector: "semantic-pictorial-1" } },
      { type: "line", box: { x: 500, y: 280, w: 35, h: -70 }, source: { detector: "semantic-pictorial-2" } },
      { type: "line", box: { x: 440, y: 310, w: -32, h: 45 }, source: { detector: "semantic-pictorial-3" } },
      { type: "line", box: { x: 500, y: 310, w: 30, h: 45 }, source: { detector: "semantic-pictorial-4" } }
    ],
    images: [
      { id: "left-icon", box: { x: 70, y: 160, w: 70, h: 70 }, source: { strategy: "local-fidelity-crop" } },
      { id: "mixed-central", box: { x: 340, y: 150, w: 190, h: 120 }, source: { strategy: "local-fidelity-crop" } },
      { id: "upper-right", box: { x: 525, y: 150, w: 72, h: 85 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-left", box: { x: 340, y: 340, w: 88, h: 90 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-right", box: { x: 520, y: 340, w: 78, h: 92 }, source: { strategy: "local-fidelity-crop" } }
    ]
  };
  try {
    const result = refineKnowledgeGraphIconCrops({ page, slideSize: { widthPt: 960, heightPt: 720 }, sourceFile, root: temporaryRoot });
    assert.deepEqual(result, { matched: true, replacedCrops: 4, createdCrops: 4 });
    assert.equal(page.images.length, 5);
    assert.equal(page.images[0].id, "left-icon");
    assert.ok(page.images.slice(1).every((item) => item.source.intentionalMinimumUnitCrop === true && item.box.w < 80 && item.box.h < 90));
    assert.ok(page.images.slice(1).every((item) => Array.isArray(item.source.intrusionEdges)));
    assert.ok(page.images.slice(1).every((item) => Number.isFinite(item.source.connectorAnchorPoint?.x) && Number.isFinite(item.source.connectorAnchorPoint?.y)));
    assert.ok(page.images.slice(1).every((item) => item.source.connectorAnchorPoint.x >= item.box.x && item.source.connectorAnchorPoint.x <= item.box.x + item.box.w));
    assert.ok(page.images.slice(1).every((item) => fs.existsSync(path.join(temporaryRoot, ...item.assetPath.split("/")))));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("knowledge graph pictorial connectors replace relationships previously carried by the full-slide raster", () => {
  const image = (id, x, y, connectorAnchorPoint = null) => ({ id, box: { x, y, w: 60, h: 60 }, source: { strategy: "local-fidelity-crop", connectorAnchorPoint } });
  const page = {
    source: { semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1" } },
    shapes: [{ id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 430, y: 260, w: 100, h: 80 }, source: { editable: true } }],
    images: [image("left-a", 60, 150), image("left-b", 205, 150), image("left-c", 60, 340), image("left-d", 205, 340), image("center-a", 345, 150, { x: 398, y: 202 }), image("center-b", 535, 150, { x: 542, y: 203 }), image("center-c", 345, 350, { x: 397, y: 356 }), image("center-d", 535, 350, { x: 542, y: 356 })]
  };
  const result = addKnowledgeGraphPictorialConnectors(page, { widthPt: 960, heightPt: 720 });
  assert.deepEqual(result, { matched: true, added: 7 });
  assert.equal(page.shapes.filter((item) => item.source?.nativeComponentRole === "relationship").length, 7);
  assert.equal(page.shapes.filter((item) => item.style?.dash === "dash").length, 3);
  assert.ok(page.shapes.filter((item) => item.source?.nativeComponentRole === "relationship").every((item) => item.style.strokeWidthPt === 2));
  const pictorial = page.shapes.filter((item) => /pictorial-hub/u.test(item.id));
  assert.ok(pictorial.slice(0, 2).every((item) => item.box.x === 480 && item.box.y === 260));
  assert.ok(pictorial.slice(2).every((item) => item.box.x === 480 && item.box.y === 340));
  assert.deepEqual({ x: pictorial[0].box.x + pictorial[0].box.w, y: pictorial[0].box.y + pictorial[0].box.h }, { x: 398, y: 202 });
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
    assert.deepEqual(result.deck.pages[0].images[0].source.componentRenderStrategy, { mode: "preserve-crop-with-native-overlays" });
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
    const reverse = await createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "reverse.png"), objects: [{ type: "line", box: { x: 700, y: 400, w: -300, h: -100 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } });
    assert.equal(reverse.erasedObjects, 1);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "reverse-outside.png"), objects: [{ type: "line", box: { x: 100, y: 100, w: -200, h: 0 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /geometry/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "outside.png"), objects: [{ type: "roundRect", box: { x: 950, y: 530, w: 20, h: 20 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /geometry/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "extreme.png"), objects: Array.from({ length: 30001 }, () => objects[0]), slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /request/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "cancelled.png"), objects: [], slideSize: { x: 0, y: 0, w: 960, h: 540 }, isCancellationRequested: async () => true }), /cancelled/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("residual erase collection deduplicates geometry and excludes explicitly non-editable graphics", () => {
  const box = { x: 10, y: 10, w: 100, h: 40 };
  const objects = residualEraseObjects({
    textBoxes: [{ id: "text-a", box }, { id: "text-b", box }],
    shapes: [{ id: "native", type: "roundRect", box: { x: 150, y: 10, w: 100, h: 40 }, source: { editable: true } }, { id: "frame", type: "roundRect", box: { x: 20, y: 80, w: 400, h: 300 }, source: { editable: true, preserveResidualInterior: true } }, { id: "raster", type: "roundRect", box: { x: 300, y: 10, w: 100, h: 40 }, source: { editable: false } }],
    tables: [], charts: [], icons: []
  });
  assert.deepEqual(objects.map((item) => item.id), ["text-a", "native"]);
  assert.deepEqual(residualEraseObjects({ textBoxes: [], shapes: [], tables: [], charts: [], icons: [], images: [{ id: "crop", box: { x: 40, y: 40, w: 20, h: 20 }, source: { editable: false } }] }, { includeLocalFidelityImages: true }).map((item) => item.id), ["crop"]);
  assert.throws(() => residualEraseObjects({ textBoxes: [{ id: "bad", box: { x: 0, y: 0, w: Number.NaN, h: 1 } }] }), /invalid/);
  assert.throws(() => residualEraseObjects({ images: [{ id: "bad-crop", box: { x: 0, y: 0, w: 0, h: 1 } }] }, { includeLocalFidelityImages: true }), /invalid/);
});

test("team native rebuild preserves refined local crops and erases their source pixels from the full residual", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-local-crops-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  let erasedObjects = [];
  const rebuild = createRawImageNativeRebuilder({
    preserveLocalFidelityImages: true,
    rebuildDeckFromWorkDir: (workDir) => {
      const rebuilt = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
      const assetDir = path.join(temporaryRoot, "assets"); fs.mkdirSync(assetDir, { recursive: true });
      fs.copyFileSync(source, path.join(assetDir, "refined-icon.png"));
      rebuilt.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 10, y: 10, w: 40, h: 0 }, source: { editable: true } });
      rebuilt.pages[0].images.push({ id: "refined-icon", assetPath: "assets/refined-icon.png", box: { x: 70, y: 70, w: 24, h: 24 }, source: { editable: false, iconCropRefined: true } });
      return rebuilt;
    },
    createFullSlideResidual: async ({ sourceFile, outputFile, objects }) => {
      erasedObjects = objects;
      fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.copyFileSync(sourceFile, outputFile);
      return { erasedObjects: objects.length };
    }
  });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.deepEqual(result.deck.pages[0].images.map((item) => item.id), ["full-slide-residual", "refined-icon"]);
    assert.equal(result.deck.pages[0].images[0].source.fullSlideResidual, true);
    assert.equal(result.deck.pages[0].images[1].source.iconCropRefined, true);
    assert.equal(result.deck.meta.preservedLocalFidelityImages, 1);
    assert.ok(erasedObjects.some((item) => item.id === "refined-icon"));
    assert.equal(result.residual.erasedObjects, result.residual.candidateObjects);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker gates every raw page on the shared production reconstruction profile", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-production-profile-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, "const fs=require('node:fs'); const i=process.argv.indexOf('--out'); fs.writeFileSync(process.argv[i + 1], Buffer.from('PK\\x03\\x04'));", "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let profile = PRODUCTION_PROFILE_NAME;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile], requiredReconstructionProfile: PRODUCTION_PROFILE_NAME,
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, source: { editable: true } });
      return { deck: rebuilt, reconstructionProfile: profile === "mixed" ? (pageIndex === 0 ? PRODUCTION_PROFILE_NAME : null) : profile };
    },
    rawImageQualityVerifier: async () => ({ checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async () => {} }
  });
  try {
    const aligned = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/aligned.tar.gz", outputPrefix: "owners/a/jobs/aligned/" }, isCancellationRequested: async () => false });
    assert.equal(aligned.quality.checks.find((check) => check.name === "local-production-profile-aligned").passed, true);
    assert.equal(aligned.quality.metrics["production-profile-aligned"], 1);
    profile = "mixed";
    const mixed = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/mixed.tar.gz", outputPrefix: "owners/a/jobs/mixed/" }, isCancellationRequested: async () => false });
    assert.equal(mixed.quality.passed, false);
    assert.equal(mixed.quality.checks.find((check) => check.name === "local-production-profile-aligned").passed, false);
    assert.equal(mixed.quality.metrics["production-profile-aligned"], 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
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
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_PROTOCOL_SHA256/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE_NORMALIZER_SHA256/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8"), /PADDLEOCR/);
});

test("PaddleOCR Docker adapter loads using only its declared image COPY dependencies", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr"), "utf8");
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "paddle-image-import-"));
  try {
    for (const match of dockerfile.matchAll(/^COPY (\S+) \/opt\/paddleocr\/skill\/(\S+)$/gm)) {
      const target = path.resolve(directory, match[2]);
      assert.equal(path.relative(directory, target).startsWith(".."), false);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.resolve(root, match[1]), target);
    }
    const imageAdapter = require(path.join(directory, "scripts/adapters/ocr-paddleocr-local.js"));
    assert.equal(typeof imageAdapter, "function");
    assert.equal(typeof imageAdapter.closeActiveEngineAndWait, "function");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
  assert.equal((deployScript.match(/\.Replace\("`r`n", "`n"\)\.Replace\("`r", "`n"\)/g) || []).length, 2);
  assert.match(deployScript, /deployment = 'No containers or images were changed\.'/);
});


test("Deck IR admission rejects malformed page collections and boxes before building", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  assert.deepEqual(validateDeckIr(deck(), os.tmpdir()), { pages: 1, assets: 0 });
  assert.deepEqual(validateDeckIr(deck({ pages: [{}] }), os.tmpdir()), { pages: 1, assets: 0 });
  for (const page of [null, 1, [], { pageIndex: -1 }, { pageIndex: 0.5 }, { shapes: {} }, { images: [null] }, { textBoxes: [{ text: 4 }] }, { shapes: [{ box: { x: 0, y: 0, w: -1, h: 10 } }] }, { shapes: [{ box: { x: 0, y: 0, w: "1", h: 10 } }] }, { shapes: [{ box: { x: 0 } }] }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [page] }), os.tmpdir()), /editable deck/);
  }
  const zeroWidthLine = { shapes: [{ type: "line", box: { x: -1, y: 0, w: 0, h: 10 } }] };
  assert.equal(validateDeckIr(deck({ pages: [zeroWidthLine] }), os.tmpdir()).pages, 1);
  for (const type of ["line", "LINE"]) {
    for (const box of [{ x: 100, y: 100, w: -50, h: 0 }, { x: 100, y: 100, w: 0, h: -50 }, { x: 100, y: 100, w: -50, h: -50 }]) {
      assert.equal(validateDeckIr(deck({ pages: [{ shapes: [{ type, box }] }] }), os.tmpdir()).pages, 1);
    }
  }
  for (const collection of ["images", "tables", "charts"]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ type: "line", box: { x: 0, y: 0, w: -1, h: 10 } }] }] }), os.tmpdir()), /editable deck object box/);
  }
  assert.throws(() => validateDeckIr(deck({ pages: [{ shapes: [{ type: "line", box: { x: 0, y: 0, w: -100001, h: 10 } }] }] }), os.tmpdir()), /editable deck/);
});


test("Deck IR checks table and chart data before OpenXML deserialization", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const admit = (page) => validateDeckIr(deck({ pages: [Object.fromEntries(Object.entries(page).map(([key, items]) => [key, items.map(item => ({ box: { x: 0, y: 0, w: 100, h: 50 }, ...item }))]))] }), os.tmpdir());
  assert.equal(admit({ tables: [{ rows: [["A", "42"], ["B"]] }], charts: [{ categories: ["A"], series: [{ name: "Value", values: [1, -2] }] }] }).pages, 1);
  assert.equal(admit({ tables: [{ rows: null }], charts: [{ categories: null, values: [], series: null }] }).pages, 1);
  // All three collections bind to VisualElementIr, including its optional Rows.
  for (const key of ["shapes", "images", "tables"]) {
    for (const rows of [null, [], [[]], [["A", "42"], ["B"]]]) assert.equal(admit({ [key]: [{ rows }] }).pages, 1);
    for (const rows of [{}, [null], [[1]], [[{}]], [[null]], Array(10001).fill([])]) assert.throws(() => admit({ [key]: [{ rows }] }), /editable deck/);
  }
  for (const chart of [{ categories: [1] }, { categories: ["x".repeat(4097)] }, { values: ["1"] }, { values: [null] }, { values: [Infinity] }, { series: {} }, { series: [null] }, { series: [{}] }, { series: [{ name: 1, values: [1] }] }, { series: [{ Name: 1, values: [1] }] }, { series: [{ name: "case alias", Values: [1] }] }, { series: Array.from({ length: 65 }, () => ({ values: [1] })) }]) assert.throws(() => admit({ charts: [chart] }), /editable deck/);
  assert.equal(admit({ charts: [{ series: Array.from({ length: 64 }, () => ({ name: "", values: [0] })) }] }).pages, 1);
  assert.equal(admit({ charts: [{ values: Array(10000).fill(0) }] }).pages, 1);
  assert.throws(() => admit({ charts: [{ values: Array(10001).fill(0) }] }), /editable deck/);
});


test("Deck IR validates declared reconstruction contracts using the shared policy", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const { enrichReconstructionContracts } = require("../packages/slideclone-core/reconstruction-contract");
  const enriched = JSON.parse(JSON.stringify(enrichReconstructionContracts(deck(), { baseDir: os.tmpdir() })));
  assert.equal(validateDeckIr(enriched, os.tmpdir()).pages, 1);
  assert.throws(() => validateDeckIr({ ...enriched, "pages.0.reconstruction.qualityBudget.metrics.slideAreaPt2": 518400 }, os.tmpdir()), /invalid number/);
  const tooLarge = structuredClone(enriched);
  tooLarge.pages[0].reconstruction.qualityBudget.metrics.slideAreaPt2 = 960 * 540 + 1;
  assert.throws(() => validateDeckIr(tooLarge, os.tmpdir()), /invalid number/);
  assert.throws(() => validateDeckIr({ ...enriched, arbitraryArea: 960 * 540 }, os.tmpdir()), /invalid number/);

  for (const contract of ["invalid", [], { contractVersion: "2.0" }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ reconstruction: contract }] }), os.tmpdir()), /editable deck/);
  }
  const invalid = structuredClone(enriched);
  invalid.pages[0].textBoxes[0].source.reconstruction.realization = "invented";
  assert.throws(() => validateDeckIr(invalid, os.tmpdir()), (error) => error.message === "editable deck reconstruction metadata is invalid");
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract"), require("../packages/slideclone-core/reconstruction-contract"));
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-quality-budget"), require("../packages/slideclone-core/reconstruction-quality-budget"));
});


test("Deck IR rejects rendered objects without boxes instead of crashing the builder", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  for (const collection of ["textBoxes", "shapes", "images", "tables", "charts"]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ id: "missing-box", rows: [["A", "B"]] }] }] }), os.tmpdir()), (error) => error.message === "editable deck object box is required");
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ box: null }] }] }), os.tmpdir()), /editable deck/);
  }
});


test("Deck IR rejects case-insensitive model aliases and ambiguous fields", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const box = { x: 0, y: 0, w: 10, h: 10 };
  for (const page of [{ Shapes: [{ box }] }, { images: [{ box, AssetPath: "../private.png" }] }, { images: [{ box, Source: { pageImage: "../private.png" } }] }, { textBoxes: [{ box, Text: "unvalidated" }] }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [page] }), os.tmpdir()), /field casing/);
  }
  assert.throws(() => validateDeckIr({ ...deck(), Pages: [{}] }, os.tmpdir()), /ambiguous field casing/);
  assert.throws(() => validateDeckIr(deck({ pages: [{ shapes: [{ box, source: { assetPath: "assets/a.png", AssetPath: "../private.png" } }] }] }), os.tmpdir()), /ambiguous field casing/);
  assert.throws(() => validateDeckIr(deck({ pages: [{ images: [{ box, style: { AssetPath: "../private.png" } }] }] }), os.tmpdir()), /asset/);
});


test("Deck IR validates font and text run types while preserving nullable style defaults", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const admit = (patch) => validateDeckIr(deck({ pages: [{ textBoxes: [{ text: "Text", box: { x: 0, y: 0, w: 100, h: 30 }, ...patch }] }] }), os.tmpdir());
  assert.equal(admit({ font: { family: "Arial", sizePt: 20, opacity: 0.5, weight: "bold" }, wrap: false, rotation: 15, runs: [{ text: "", font: null }, { text: "你好", font: { sizePt: null } }] }).pages, 1);
  assert.equal(admit({ font: null, runs: null, rotation: null, wrap: null }).pages, 1);
  for (const patch of [{ id: 1 }, { font: "Arial" }, { font: [] }, { font: { sizePt: "20" } }, { font: { weight: 700 } }, { font: { SizePt: 20 } }, { wrap: "false" }, { rotation: "15" }, { runs: {} }, { runs: [null] }, { runs: [{ text: 3 }] }, { runs: [{ font: { family: false } }] }, { runs: [{ Text: "alias" }] }]) assert.throws(() => admit(patch), /editable deck/);
});


test("Deck IR page model admission matches builder indices and optional dimensions", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const admit = (pages) => validateDeckIr(deck({ pages }), os.tmpdir());
  assert.equal(admit([{}]).pages, 1);
  assert.equal(admit([{}, { pageIndex: 9999, slideSize: { widthPt: 960, heightPt: 540 } }]).pages, 2);
  assert.equal(admit([{ pageIndex: 2, slideSize: null }, { pageIndex: 1, slideSize: {} }]).pages, 2);
  for (const pages of [[{}, {}], [{}, { pageIndex: 0 }], [{ pageIndex: 1 }, { pageIndex: 1 }], [{ pageIndex: 10000 }], [{ pageIndex: -1 }], [{ pageIndex: 0.5 }], [{ pageIndex: null }]]) {
    assert.throws(() => admit(pages), /editable deck page index/);
  }
  for (const slideSize of ["private-content", [], false, { widthPt: "private-content" }, { heightPt: null }, { WidthPt: 960 }, { heightPt: Infinity }]) {
    assert.throws(() => admit([{ slideSize }]), error => /editable deck/.test(error.message) && !error.message.includes("private-content"));
  }
  assert.throws(() => admit([{ SlideSize: "private-content" }]), /field casing/);
});

test("Deck IR validates page metadata, placeholder bindings and model point lists", () => {
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  const admit = (page) => validateDeckIr(deck({ pages: [page] }), os.tmpdir());
  const box = { x: 0, y: 0, w: 100, h: 100 };
  assert.equal(admit({ speakerNotes: "Note", preserveTemplateSlide: false, citations: [{ id: "ref", title: "Source", locator: "local reference" }], intent: { templatePlaceholderCapacity: 1, templatePlaceholderBindings: [{ objectId: "shape", collection: "charts", placeholderType: "chart", placeholderIndex: 0 }] }, shapes: [{ id: "shape", box, points: [{ x: -1, y: 2 }, { x: 3, y: 4 }] }] }).pages, 1);
  assert.equal(admit({ intent: null, citations: [], speakerNotes: null }).pages, 1);
  for (const page of [{ speakerNotes: {} }, { preserveTemplateSlide: "false" }, { citations: [null] }, { citations: [{ title: 1 }] }, { intent: [] }, { intent: { templatePlaceholderCapacity: 0.5 } }, { intent: { templatePlaceholderBindings: [false] } }, { intent: { templatePlaceholderBindings: [{ placeholderIndex: "1" }] } }, { intent: { TemplateLayoutName: "alias" } }, { shapes: [{ box, points: [[1, 2]] }] }, { shapes: [{ box, points: [{ x: 1 }] }] }, { shapes: [{ box, points: [{ X: 1, y: 2 }] }] }]) assert.throws(() => admit(page), /editable deck/);
});
