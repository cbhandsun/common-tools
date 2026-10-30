"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyPanelRefiner } = require("../packages/slideclone-worker-adapter/native-only-panel-refinement");
const { fitDeckLightCardGeometry, fitDeckLowSaturationPanelFills, finalRefinementQualityAcceptable, validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
const { auditSemanticEditability } = require("../packages/slideclone-core/quality/semantic-editability-quality");
const { qualityRendered } = require("../packages/slideclone-core/team-native-rebuild");
const { readPng, writePng } = require("../packages/slideclone-core/png");

function quality(pdr = 0.1, missing = 0.08, mad = 14) {
  return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": pdr, "foreground-missing-ratio": missing, "mean-absolute-delta": mad } };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-panel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const image = { width: 300, height: 200, rgba: Buffer.alloc(300 * 200 * 4, 255) };
  for (let y = 30; y < 160; y++) for (let x = 20; x < 260; x++) image.rgba.set([238, 238, 238, 255], (y * 300 + x) * 4);
  const sourceFile = path.join(root, "assets", "source.png");
  writePng(sourceFile, image);
  const source = { editable: true, nativeRebuild: true, semanticNativeStructure: true, pageImage: "assets/source.png" };
  const deck = { version: "1.0", slideSize: { widthPt: 300, heightPt: 200 }, pages: [{ pageIndex: 0, shapes: [
    { id: "underlay", type: "rect", box: { x: 20, y: 30, w: 240, h: 130 }, style: { fill: "#EEEEEE", stroke: "none", strokeWidthPt: 0 },
      source: { ...source, detector: "solid-region-native-background", visualFallbackPrimitive: true, retainedInVisualFallback: true, componentQualityIgnore: true } },
    { id: "owner", type: "roundRect", box: { x: 23, y: 33, w: 234, h: 124 }, style: { fill: "#FAFAFA", stroke: "none" },
      source: { ...source, preserveResidualInterior: true } }
  ], textBoxes: [], images: [] }] };
  const dependencies = { readPng, fitGeometry: fitDeckLightCardGeometry, fitFills: fitDeckLowSaturationPanelFills,
    validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability, qualityRendered,
    qualityAcceptable: finalRefinementQualityAcceptable, maxPptxBytes: 1000 };
  const request = { root, baseline: { deck, quality: quality(), removed: 1 }, sourceImages: [sourceFile],
    isCancellationRequested: async () => false, runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "pptx"),
    rawImageQualityVerifier: async ({ collectRenderedPages }) => { collectRenderedPages([sourceFile]); return quality(0.09, 0.07, 12); } };
  return { root, deck, dependencies, request, refine: createNativeOnlyPanelRefiner(dependencies) };
}
test("native candidate jointly fits panel geometry and fill before safe underlay deduplication", async t => {
  const f = fixture(t), before = structuredClone(f.deck);
  const result = await f.refine({ ...f.request, rawImageQualityVerifier: async args => {
    assert.equal(args.referenceQuality, f.request.baseline.quality);
    return f.request.rawImageQualityVerifier(args);
  } });
  assert.ok(result);
  assert.equal(result.deck.pages[0].shapes.length, 1);
  assert.equal(result.deck.pages[0].shapes[0].id, "owner");
  assert.equal(result.deck.pages[0].shapes[0].style.fill, "#EEEEEE");
  assert.equal(result.quality.metrics["native-only-panel-backgrounds-removed"], 1);
  assert.deepEqual(result.renderedImages, f.request.sourceImages);
  assert.equal(result.quality.passed, false);
  assert.equal(result.removed, 1);
  assert.deepEqual(f.deck, before);
});
test("panel ownership cleanup restores source contour paint order before native rendering", async t => {
  const f=fixture(t);
  const glyph={id:"measured-pictorial",type:"freeform",box:{x:70,y:60,w:20,h:20},
    style:{fill:"#222222",stroke:"none",freeformSegments:[{type:"moveTo",points:[{x:0,y:0}]},{type:"lnTo",points:[{x:1,y:0}]},{type:"lnTo",points:[{x:1,y:1}]},{type:"close",points:[]}]},
    source:{editable:true,nativeRebuild:true,detector:"ocr-punctuation-graphic-native-contour",sourceTextBoxId:"ocr-graphic",pageImage:"assets/source.png",sourceIconBox:{x:65,y:55,w:30,h:30},iconPart:"outline-contour"}};
  f.deck.pages[0].shapes.unshift(glyph);
  const before=structuredClone(f.deck);
  let builds=0;
  const result=await f.refine({...f.request,runBuild:async request=>{
    const built=JSON.parse(fs.readFileSync(request.deckFile));
    assert.deepEqual(built.pages[0].shapes.map(s=>s.id),["owner","measured-pictorial"]);
    assert.deepEqual(built.pages[0].shapes[1],glyph);
    builds++;await f.request.runBuild(request);
  }});
  assert.ok(result);assert.equal(builds,1);assert.deepEqual(f.deck,before);
  assert.deepEqual(result.deck.pages[0].shapes.map(s=>s.id),["owner","measured-pictorial"]);
});
test("native panel render rejects any metric regression and cleans only owned files", async t => {
  for (const q of [quality(0.11, 0.07, 12), quality(0.09, 0.09, 12), quality(0.09, 0.07, 15), {}, { ...quality(), checks: [] }]) {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, "unrelated.json"), "keep");
    const result = await f.refine({ ...f.request, rawImageQualityVerifier: async () => q });
    assert.equal(result, null);
    assert.deepEqual(fs.readdirSync(f.root).sort(), ["assets", "unrelated.json"]);
  }
});
test("builder, verifier and cancellation failures propagate after candidate cleanup", async t => {
  for (const stage of ["build", "verify", "cancel"]) {
    const f = fixture(t); let built = false;
    await assert.rejects(f.refine({ ...f.request,
      runBuild: async args => { if (stage === "build") throw new Error("build failed"); await f.request.runBuild(args); built = true; },
      rawImageQualityVerifier: async args => { if (stage === "verify") throw new Error("verify failed"); return f.request.rawImageQualityVerifier(args); },
      isCancellationRequested: async () => stage === "cancel" && built
    }), /failed|cancelled/);
    assert.deepEqual(fs.readdirSync(f.root), ["assets"]);
  }
});
test("malformed, empty, excessive, mismatched and outside sources fail before building", async t => {
  const f = fixture(t); let builds = 0;
  const runBuild = async () => { builds++; };
  for (const request of [null, {}, { ...f.request, sourceImages: [] }, { ...f.request, sourceImages: Array(51).fill(f.request.sourceImages[0]) },
    { ...f.request, sourceImages: [...f.request.sourceImages, ...f.request.sourceImages] }, { ...f.request, root: "relative" },
    { ...f.request, sourceImages: [__filename] }, { ...f.request, sourceImages: ["../source.png"] }]) {
    await assert.rejects(f.refine(request && { ...request, runBuild }));
  }
  assert.equal(builds, 0);
});
test("passing, unchanged and semantically unsafe candidates do not render", async t => {
  const f = fixture(t); let builds = 0;
  const request = { ...f.request, runBuild: async () => { builds++; } };
  assert.equal(await f.refine({ ...request, baseline: { ...request.baseline, quality: { ...quality(), passed: true } } }), null);
  const unchanged = createNativeOnlyPanelRefiner({ ...f.dependencies, fitGeometry: deck => ({ deck, changedShapes: 0 }), fitFills: deck => ({ deck, changedShapes: 0 }) });
  assert.equal(await unchanged(request), null);
  const unsafe = createNativeOnlyPanelRefiner({ ...f.dependencies, auditSemantic: () => ({ passed: false }) });
  assert.equal(await unsafe(request), null);
  assert.equal(builds, 0);
});
test("production native-only branch refines panels before text and primitive selection", () => {
  const source = require('./helpers/worker-implementation-source.cjs').readWorkerImplementation();
  const start = source.indexOf("async function buildNativeOnlyResidualCandidate");
  const body = source.slice(start, source.indexOf("async function tryBuildNativeOnlyComponentFidelityPrimitiveCandidate", start));
  assert.match(body, /refineNativeOnlyPanels[\s\S]+const panelBaseline = panelRefined \|\| direct;[\s\S]+baseline: panelBaseline/u);
});

test("empty and oversized generated artifacts fail before verifier and clean candidates", async t => {
  for (const bytes of [0, 1001]) {
    const f = fixture(t); let verified = false;
    await assert.rejects(f.refine({ ...f.request,
      runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, Buffer.alloc(bytes)),
      rawImageQualityVerifier: async () => { verified = true; return quality(); }
    }), /Invalid native panel artifact/);
    assert.equal(verified, false);
    assert.deepEqual(fs.readdirSync(f.root), ["assets"]);
  }
});

test("dependency validation and initial cancellation prevent fitting or output writes", async t => {
  const f = fixture(t);
  for (const changed of [{ readPng: null }, { fitFills: {} }, { maxPptxBytes: 0 }, { maxPptxBytes: Infinity }]) {
    assert.throws(() => createNativeOnlyPanelRefiner({ ...f.dependencies, ...changed }), /dependencies/);
  }
  await assert.rejects(f.refine({ ...f.request, isCancellationRequested: async () => true }), /cancelled/);
  assert.deepEqual(fs.readdirSync(f.root), ["assets"]);
});

test("panel rollback keeps unaffected gains and performs at most one fresh gated verification", async t => {
  for (const mode of ["accept", "reject", "second-build-fails", "second-cancel"]) {
    const f = fixture(t);
    const shapes = f.deck.pages[0].shapes;
    shapes[0].box = { x: 20, y: 110, w: 240, h: 70 };
    shapes[1].box = { x: 20, y: 110, w: 240, h: 70 };
    shapes.push({ ...structuredClone(shapes[1]), id: "top", box: { x: 20, y: 10, w: 240, h: 70 } });
    const region = { id: "missing-reference", pageIndex: 0, box: { x: 30, y: 130, w: 10, h: 10 }, severity: 2,
      kind: "missing", role: "missing-native-component", source: { detector: "missing-native-component-quality" } };
    f.request.baseline.quality.componentWorst = [region];
    const refine = createNativeOnlyPanelRefiner({ ...f.dependencies,
      fitGeometry: deck => ({ deck: structuredClone(deck), changedShapes: 0, removedBackgrounds: 0 }),
      fitFills: deck => {
        const next = structuredClone(deck);
        next.pages[0].shapes = next.pages[0].shapes.filter(s => s.id !== "underlay").map(s => ({ ...s, style: { ...s.style, fill: "#EEEEEE" } }));
        return { deck: next, changedShapes: 3 };
      }
    });
    let builds = 0, renders = 0;
    const action = refine({ ...f.request,
      runBuild: async args => {
        builds++;
        if (mode === "second-build-fails" && builds === 2) throw new Error("second build failed");
        await f.request.runBuild(args);
      },
      isCancellationRequested: async () => mode === "second-cancel" && builds === 2,
      rawImageQualityVerifier: async ({ deck, collectRenderedPages }) => {
        renders++;
        if (renders === 2) {
          assert.deepEqual(deck.pages[0].shapes.map(s => s.id), ["underlay", "owner", "top"]);
          assert.deepEqual(deck.pages[0].shapes[1], shapes[1]);
          assert.equal(deck.pages[0].shapes[2].style.fill, "#EEEEEE");
        }
        collectRenderedPages([f.request.sourceImages[0]]);
        return { ...quality(0.09, 0.07, mode === "reject" ? 15 : 12),
          componentReferenceMetrics: [{ ...structuredClone(region), severity: renders === 1 ? 3 : 2 }] };
      }
    });
    if (mode.startsWith("second-")) await assert.rejects(action, /failed|cancelled/);
    else {
      const result = await action;
      if (mode === "accept") {
        assert.ok(result, JSON.stringify({ builds, renders }));
        assert.equal(result.quality.metrics["native-only-panel-operations-rolled-back"], 2);
        assert.equal(result.quality.metrics["native-only-panel-backgrounds-removed"], 0);
      } else assert.equal(result, null);
    }
    assert.equal(builds, 2);
    assert.equal(renders, mode.startsWith("second-") ? 1 : 2);
    if (mode !== "accept") assert.deepEqual(fs.readdirSync(f.root), ["assets"]);
  }
});
