"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRawImageRenderQualityVerifier } = require("../packages/slideclone-worker-adapter/team-render-quality");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-image-quality-"));
  const pptxFile = path.join(root, "deck.pptx");
  const sourceImage = path.join(root, "source.png");
  fs.writeFileSync(pptxFile, "pptx");
  fs.writeFileSync(sourceImage, "png");
  return { root, pptxFile, sourceImage };
}

test('quality failures distinguish adapter phases without reading or exposing error data', async t => {
  const files=fixture();t.after(()=>fs.rmSync(files.root,{recursive:true,force:true}));
  const deck={slideSize:{widthPt:100,heightPt:50},pages:[{shapes:[],textBoxes:[]}]};
  let reads=0;
  const unsafe=new Error('Bearer private-token cookie user-content');
  Object.defineProperty(unsafe,'code',{get(){reads++;throw new Error('must not read');}});
  for(const phase of ['renderer','typography','collector','comparison','evidence']){
    const verify=createRawImageRenderQualityVerifier({
      renderPresentation:async()=>{if(phase==='renderer')throw unsafe;return {ok:true,data:{renderedPages:[{image:'unused'}]}};},
      auditRenderedText:async()=>{if(phase==='typography')throw unsafe;return {passed:true,paragraphs:0,missing:0,overflow:0,collisions:0};},
      comparePageFiles:()=>{if(phase==='comparison')throw unsafe;return {ok:true,pixelDiffRatio:.01,foregroundMissingRatio:.01,meanAbsoluteDelta:1,
        ...(phase==='evidence'?{textWeightEvidence:[{coverageRatio:Infinity}]}:{})};}
    });
    const result=await verify({...files,deck,collectRenderedPages:()=>{if(phase==='collector')throw unsafe;}});
    assert.equal(result.passed,false);
    assert.deepEqual(result.checks,[{name:'quality-rendered',passed:false}]);
    assert.equal(result.metrics[`quality-failure-stage-${phase}`],1);
    assert.equal(Object.keys(result.metrics).filter(k=>k.startsWith('quality-failure-stage-')).length,1);
    assert.doesNotMatch(JSON.stringify(result),/private-token|cookie|user-content|Bearer|unused/u);
  }
  assert.equal(reads,0);
  const valid=await verifier({pixelDiffRatio:.01,foregroundMissingRatio:.01,meanAbsoluteDelta:1})(files);
  assert.equal(valid.passed,true);
  assert.equal(Object.keys(valid.metrics).some(k=>k.startsWith('quality-failure-stage-')),false);
});

test('rendered typography failures veto publication independently of passing pixels',async t=>{
 const files=fixture();t.after(()=>fs.rmSync(files.root,{recursive:true,force:true}));
 const deck={slideSize:{widthPt:100,heightPt:50},pages:[{shapes:[],textBoxes:[]}]};
 const verify=reported=>createRawImageRenderQualityVerifier({
  renderPresentation:async()=>({ok:true,data:{renderedPages:[{image:'unused'}]}}),
  comparePageFiles:()=>({ok:true,pixelDiffRatio:.01,foregroundMissingRatio:.01,meanAbsoluteDelta:1}),
  auditRenderedText:async()=>reported
 })({...files,deck});
 for(const key of ['missing','overflow','collisions','order','unverified','ambiguous']){const evidence={passed:false,paragraphs:1,missing:0,overflow:0,collisions:0,[key]:1};
  const result=await verify(evidence);assert.equal(result.passed,false);assert.equal(result.checks.find(c=>c.name==='visual-fidelity').passed,true);
  assert.equal(result.typographyEvidence[key],1);assert.ok(result.checks.some(c=>c.name.startsWith('typography-')&&!c.passed));}
 for(const evidence of [{passed:true,paragraphs:1,missing:1,overflow:0,collisions:0},{passed:true,paragraphs:1,missing:0,overflow:0,collisions:NaN}]){
  const result=await verify(evidence);assert.equal(result.checks[0].passed,false);}
 const sanitized=await verify({passed:true,paragraphs:1,missing:0,overflow:0,collisions:0,privateContent:'private-token'});
 assert.equal(sanitized.passed,true);assert.doesNotMatch(JSON.stringify(sanitized),/private-token/u);
 let reads=0;const hostile={get passed(){reads++;return true;},paragraphs:1,missing:0,overflow:0,collisions:0};
 assert.equal((await verify(hostile)).passed,false);assert.equal(reads,0);
});

test("text weight evidence is bounded, whitelisted, and invalid evidence fails closed", async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const row = { id: "body", coverageRatio: 0.6, source: { x: 1, y: 2, w: 3, h: 4 }, rendered: { x: 1, y: 2, w: 3, h: 4 }, privateContent: "must-not-escape" };
  const run = rows => createRawImageRenderQualityVerifier({
    renderPresentation: async () => ({ ok: true, data: { renderedPages: [{ image: "unused" }] } }),
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01, meanAbsoluteDelta: 1, textWeightEvidence: rows })
  })({ ...files });
  const valid = await run([row]);
  assert.equal(valid.passed, true);
  assert.equal(valid.textWeightEvidence[0].privateContent, undefined);
  assert.equal(valid.textWeightEvidence[0].pageIndex, 0);
  for (const rows of [[row, row], [{ ...row, coverageRatio: Infinity }], [{ ...row, id: "unsafe\0" }],
    [{ ...row, source: { x: "1", y: 2, w: 3, h: 4 } }], new Array(2001), "not-rows"]) {
    const invalid = await run(rows);
    assert.equal(invalid.checks[0].passed, false);
    assert.equal(invalid.passed, false);
  }
});

test("candidate render quality re-evaluates missing components in fixed baseline ROIs without changing global gates", async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const requests = [];
  const baseline = { componentWorst: [{ pageIndex: 0, severity: 5, kind: "missing", role: "missing-native-component",
    box: { x: 10, y: 10, w: 8, h: 8 }, source: { detector: "missing-native-component-quality" } }] };
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: input => {
      requests.push(input);
      return { ok: true, pixelDiffRatio: 0.1, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 13,
        componentQuality: { local: input.options.componentRegions.map(region => ({ id: region.id, severity: 3 })) } };
    }
  });
  const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ shapes: [] }] };
  const result = await verify({ ...files, deck, referenceQuality: baseline });
  assert.equal(result.passed, false);
  assert.equal(result.metrics["pixel-diff-ratio"], 0.1);
  assert.deepEqual(result.componentReferenceMetrics, [{ pageIndex: 0, box: baseline.componentWorst[0].box, severity: 3 }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].options.componentRegions[0].box, baseline.componentWorst[0].box);
  await assert.rejects(verify({ ...files, deck, referenceQuality: { componentWorst: [{ ...baseline.componentWorst[0], box: {} }] } }), /reference regions/u);
});

test("fixed missing-component ROI comparison failures cannot yield a rendered pass", async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01, meanAbsoluteDelta: 1 })
  });
  const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ shapes: [] }] };
  const referenceQuality = { componentWorst: [{ pageIndex: 0, severity: 5, kind: "missing", role: "missing-native-component",
    box: { x: 10, y: 10, w: 8, h: 8 }, source: { detector: "missing-native-component-quality" } }] };
  const result = await verify({ ...files, deck, referenceQuality });
  assert.equal(result.passed, false);
  assert.equal(result.checks[0].passed, false);
  assert.equal(result.componentReferenceMetrics, undefined);
});
function verifier(metric, renderPresentation = async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } })) {
  return createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles: () => ({ ok: true, ...metric }) });
}

test("quality verification exposes rendered pages only to its optional internal collector", async (t) => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  let pages, outputDir;
  const verify = verifier({ pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 2 }, async (_input, context) => {
    outputDir = context.outputDir;
    return { ok: true, data: { renderedPages: [{ image: path.join(outputDir, "page-1.png") }] } };
  });
  const result = await verify({ ...files, collectRenderedPages: captured => { pages = captured; } });
  assert.deepEqual(pages, [path.join(outputDir, "page-1.png")]);
  assert.equal(path.dirname(outputDir), files.root);
  assert.match(path.basename(outputDir), /^quality-render-/u);
  assert.equal(Object.isFrozen(pages), true);
  assert.equal(result.passed, true);
  assert.equal(JSON.stringify(result).includes(files.root), false);
  await assert.rejects(verify({ ...files, collectRenderedPages: {} }), /collector is invalid/u);
});

test("raw image visual quality passes only within every bounded render threshold", async () => {
  const files = fixture();
  try {
    const passing = await verifier({ pixelDiffRatio: 0.08, foregroundMissingRatio: 0.11, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(passing.passed, true);
    assert.deepEqual(passing.checks, [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }]);
    assert.equal(passing.metrics["foreground-missing-ratio"], 0.11);
    const failing = await verifier({ pixelDiffRatio: 0.08, foregroundMissingRatio: 0.13, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(failing.passed, false);
    assert.equal(failing.checks[1].passed, false);
    const pixelRegression = await verifier({ pixelDiffRatio: 0.085, foregroundMissingRatio: 0.11, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(pixelRegression.passed, false);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality fails closed for renderer failure without exposing its message", async () => {
  const files = fixture();
  try {
    const result = await verifier({}, async () => { throw new Error("secret renderer output"); })({ ...files, isCancellationRequested: async () => false });
    assert.deepEqual(result.checks, [{ name: "quality-rendered", passed: false }]);
    assert.equal(JSON.stringify(result).includes("secret renderer output"), false);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality forwards PowerPoint export timeout for complex native decks", async () => {
  const files = fixture();
  let received;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => {
      received = context.config;
      return { ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } };
    },
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 2 })
  });
  try {
    await verify({ ...files, isCancellationRequested: async () => false });
    assert.equal(received.powerPoint.exportTimeoutMs, 180000);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality forwards source images and page limits to renderer", async () => {
  const files = fixture();
  let received;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (input, context) => {
      received = { input, context };
      return { ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } };
    },
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 2 })
  });
  try {
    const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ shapes: [] }] };
    await verify({ ...files, deck, isCancellationRequested: async () => false });
    assert.deepEqual(received.input.sourceImages, [files.sourceImage]);
    assert.equal(received.input.maxPages, 1);
    assert.equal(received.input.ir, deck);
    assert.equal(path.dirname(received.context.outputDir), files.root);
    assert.match(path.basename(received.context.outputDir), /^quality-render-/u);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality compares every batch page and reports worst-case metrics", async () => {
  const files = fixture(); const second = path.join(files.root, "source-2.png"); fs.writeFileSync(second, "png2");
  const compared = [];
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }, { image: path.join(context.outputDir, "page-2.png") }] } }),
    comparePageFiles: ({ pageIndex, sourceImage }) => { compared.push([pageIndex, path.basename(sourceImage)]); return { ok: true, pixelDiffRatio: pageIndex ? 0.1 : 0.02, foregroundMissingRatio: 0.01, meanAbsoluteDelta: 3 }; }
  });
  try {
    const result = await verify({ root: files.root, pptxFile: files.pptxFile, sourceImages: [files.sourceImage, second], isCancellationRequested: async () => false });
    assert.deepEqual(compared, [[0, "source.png"], [1, "source-2.png"]]);
    assert.equal(result.passed, false); assert.equal(result.metrics["pixel-diff-ratio"], 0.1); assert.equal(result.metrics["quality-pages-compared"], 2);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality forwards bounded component regions and reports their worst diagnostics", async () => {
  const files = fixture(); let received;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: (input) => {
      received = input.options.componentRegions;
      return {
        ok: true,
        pageIndex: input.pageIndex,
        pixelDiffRatio: 0.01,
        foregroundMissingRatio: 0.02,
        meanAbsoluteDelta: 2,
        componentQuality: {
          audited: 2,
          evaluated: 1,
          attentionCount: 1,
          worstSeverity: 1.25,
          worstPixelDiffRatio: 0.3,
          worstForegroundMissingRatio: 0.4,
          local: [
            { id: "title", kind: "text", role: "text", attention: false, severity: 0.9, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.1, foregroundPixels: 25, sufficientEvidence: true, text: "must not leak" },
            { id: "node", kind: "shape", role: "container-border", attention: true, severity: 1.25, pixelDiffRatio: 0.3, foregroundMissingRatio: 0.4, foregroundPixels: 40, sufficientEvidence: true }
          ],
          worst: [{ id: "node", kind: "shape", role: "container-border", attention: true, severity: 1.25, pixelDiffRatio: 0.3, foregroundMissingRatio: 0.4, text: "must not leak" }]
        }
      };
    },
  });
  try {
    const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ textBoxes: [{ id: "title", box: { x: 1, y: 1, w: 20, h: 5 } }], shapes: [{ id: "node", box: { x: 30, y: 10, w: 20, h: 20 } }] }] };
    const result = await verify({ ...files, deck, isCancellationRequested: async () => false });
    assert.deepEqual(received.map((item) => item.id), ["title", "node"]);
    assert.equal(result.metrics["component-regions-audited"], 2);
    assert.equal(result.metrics["component-regions-evaluated"], 1);
    assert.equal(result.metrics["component-regions-attention"], 1);
    assert.equal(result.metrics["worst-component-normalized-severity"], 1.25);
    assert.equal(result.metrics["worst-component-foreground-missing-ratio"], 0.4);
    assert.deepEqual(result.componentWorst, [{ pageIndex: 0, id: "node", kind: "shape", role: "container-border", attention: true, severity: 1.25, pixelDiffRatio: 0.3, foregroundMissingRatio: 0.4, changedPixels: 0, foregroundMissingPixels: 0, contributionScore: 0 }]);
    assert.deepEqual(result.componentLocalMetrics, [
      { pageIndex: 0, id: "node", kind: "shape", role: "container-border", attention: true, severity: 1.25, pixelDiffRatio: 0.3, foregroundMissingRatio: 0.4, foregroundPixels: 40, changedPixels: 0, foregroundMissingPixels: 0, contributionScore: 0, sufficientEvidence: true },
      { pageIndex: 0, id: "title", kind: "text", role: "text", box: { x: 1, y: 1, w: 20, h: 5 }, attention: false, severity: 0.9, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.1, foregroundPixels: 25, changedPixels: 0, foregroundMissingPixels: 0, contributionScore: 0, sufficientEvidence: true }
    ]);
    assert.equal(JSON.stringify(result).includes("must not leak"), false);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality preserves role quotas in component worst diagnostics", async () => {
  const files = fixture();
  const worst = Array.from({ length: 35 }, (_, index) => ({
    id: `missing-${index}`,
    kind: "missing",
    role: "missing-native-component",
    attention: true,
    severity: 3,
    pixelDiffRatio: 1,
    foregroundMissingRatio: 1
  }));
  worst.push({
    id: "text-still-actionable",
    kind: "text",
    role: "text",
    attention: true,
    severity: 1.4,
    pixelDiffRatio: 0.3,
    foregroundMissingRatio: 0.25
  });
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: (input) => ({
      ok: true,
      pageIndex: input.pageIndex,
      pixelDiffRatio: 0.01,
      foregroundMissingRatio: 0.02,
      meanAbsoluteDelta: 2,
      componentQuality: {
        audited: worst.length,
        evaluated: worst.length,
        attentionCount: worst.length,
        worstSeverity: 3,
        worstPixelDiffRatio: 1,
        worstForegroundMissingRatio: 1,
        worst
      }
    })
  });
  try {
    const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ textBoxes: [{ id: "title", box: { x: 1, y: 1, w: 20, h: 5 } }], shapes: [] }] };
    const result = await verify({ ...files, deck, isCancellationRequested: async () => false });
    assert.ok(result.componentWorst.length > 30);
    assert.ok(result.componentWorst.some((item) => item.id === "text-still-actionable"));
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality preserves text repair hints on missing native diagnostics", async () => {
  const files = fixture();
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: (input) => ({
      ok: true,
      pageIndex: input.pageIndex,
      pixelDiffRatio: 0.09,
      foregroundMissingRatio: 0.04,
      meanAbsoluteDelta: 8,
      componentQuality: {
        audited: 2,
        evaluated: 2,
        attentionCount: 2,
        worstSeverity: 10,
        worstPixelDiffRatio: 1,
        worstForegroundMissingRatio: 1,
        worst: [
          { id: "title-edge", kind: "missing", role: "missing-native-component", attention: true, severity: 10, pixelDiffRatio: 1, foregroundMissingRatio: 1, textAdjacent: true, repairHint: "text", nearestTextId: "title", nearestTextDistancePt: 1.25 },
          {
            id: "icon-gap",
            kind: "missing",
            role: "missing-native-component",
            attention: true,
            severity: 3,
            pixelDiffRatio: 0.7,
            foregroundMissingRatio: 0.7,
            source: {
              detector: "missing-native-component-quality",
              dominantColor: "#1848A8",
              missingForegroundPixels: 48,
              missingPixelDensity: 0.75,
              missingComponentFingerprint: "20:10:8:6:48:#1848A8"
            }
          }
        ]
      }
    })
  });
  try {
    const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ textBoxes: [{ id: "title", box: { x: 1, y: 1, w: 20, h: 5 } }] }] };
    const result = await verify({ ...files, deck, isCancellationRequested: async () => false });
    assert.equal(result.componentWorst[0].id, "icon-gap");
    assert.deepEqual(result.componentWorst[0].source, {
      detector: "missing-native-component-quality",
      dominantColor: "#1848A8",
      missingForegroundPixels: 48,
      missingPixelDensity: 0.75,
      missingComponentFingerprint: "20:10:8:6:48:#1848A8"
    });
    const titleEdge = result.componentWorst.find((item) => item.id === "title-edge");
    assert.equal(titleEdge.textAdjacent, true);
    assert.equal(titleEdge.repairHint, "text");
    assert.equal(titleEdge.nearestTextId, "title");
    assert.equal(titleEdge.nearestTextDistancePt, 1.25);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality rejects invalid boundaries and preserves cancellation", async () => {
  assert.throws(() => createRawImageRenderQualityVerifier({ renderPresentation: async () => ({}), comparePageFiles: () => ({}), thresholds: { maximumPixelDiffRatio: 2 } }), /threshold/);
  const files = fixture();
  try {
    const verify = verifier({ pixelDiffRatio: 0, foregroundMissingRatio: 0, meanAbsoluteDelta: 0 });
    await assert.rejects(() => verify({ ...files, sourceImage: path.join(files.root, "..", "outside.png") }), /request/);
    await assert.rejects(() => verify({ ...files, isCancellationRequested: async () => true }), /cancelled/);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});


test("quality forwards live cancellation into the renderer", async () => {
  const files = fixture();
  const check = async () => false;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => {
      assert.equal(context.isCancellationRequested, check);
      throw new Error("editable job was cancelled");
    },
    comparePageFiles: () => { throw new Error("must not compare after cancellation"); }
  });
  try { await assert.rejects(verify({ ...files, isCancellationRequested: check }), /cancelled/); }
  finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});
