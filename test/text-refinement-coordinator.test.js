"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { refineRenderedTextOnce } = require("../packages/slideclone-core/text-refinement-coordinator");
const { writePng } = require("../packages/slideclone-core/png");

function quality(passed, metrics = { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20 }) {
  return { passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }], metrics };
}

function textBox() {
  return { id: "body", text: "Editable body", box: { x: 10, y: 20, w: 30, h: 15 }, font: { color: "#141e28", family: "Arial", sizePt: 16, align: "left", valign: "middle" }, style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95 } };
}

function png(file, ink) {
  const width = 100, height = 100, rgba = Buffer.alloc(width * height * 4, 255);
  if (ink) for (let y = ink.y; y < ink.y + ink.h; y += 1) for (let x = ink.x; x < ink.x + ink.w; x += 1) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
  writePng(file, { width, height, rgba });
}

function pngMany(file, inks) {
  const width = 100, height = 100, rgba = Buffer.alloc(width * height * 4, 255);
  for (const ink of inks) for (let y = ink.y; y < ink.y + ink.h; y += 1) for (let x = ink.x; x < ink.x + ink.w; x += 1) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
  writePng(file, { width, height, rgba });
}

function fixture({ sourceInk = { x: 12, y: 22, w: 20, h: 9 }, renderedInk = { x: 12, y: 22, w: 16, h: 7 } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-refinement-"));
  const deckFile = path.join(root, "deck.json"), pptxFile = path.join(root, "deck.pptx");
  const source = path.join(root, "source.png"), rendered = path.join(root, "rendered.png");
  const deck = { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ textBoxes: [textBox()], retained: { marker: true } }], retained: { marker: true } };
  fs.writeFileSync(deckFile, `${JSON.stringify(deck)}\n`); fs.writeFileSync(pptxFile, "original");
  png(source, sourceInk); png(rendered, renderedInk);
  return { root, deckFile, pptxFile, source, rendered, deck };
}

function request(value, overrides = {}) {
  return {
    root: value.root, deckFile: value.deckFile, pptxFile: value.pptxFile, deck: value.deck, sourceImages: [value.source], renderedImages: [value.rendered], initialQuality: quality(false),
    isCancellationRequested: async () => false,
    buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "candidate"); },
    verifyCandidate: async () => quality(true, { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 }),
    ...overrides
  };
}

function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }
function candidates(root) { return fs.readdirSync(root).filter((name) => name.startsWith("text-refinement-")); }
function intactFixture(){
 const value=fixture(),width=100,height=100,rgba=Buffer.alloc(width*height*4,255);
 for(let y=24;y<32;y++)for(let x=12;x<88;x++)if(x<42||x>=54)rgba.set([20,30,40,255],(y*width+x)*4);
 const line={text:'AABBCC',confidence:.99,box:{x:10,y:20,w:80,h:16},wordPositionHints:[
  {text:'AA',box:{x:10,y:20,w:33,h:16}},{text:'BB',box:{x:43,y:20,w:5,h:16}},{text:'CC',box:{x:50,y:20,w:40,h:16}}]};
 const text={...textBox(),text:line.text,box:{...line.box}};
 const registry=require('../packages/slideclone-core/source-word-layout-registry');
 registry.registerSourceWordLayout(text,line,{width,height,rgba},{remaining:4000000},[line.box]);
 value.deck.pages[0]=registry.applySourceWordLayouts({textBoxes:[text]},[text]).page;
 writePng(value.source,{width,height,rgba});writePng(value.rendered,{width,height,rgba});
 fs.writeFileSync(value.deckFile,JSON.stringify(value.deck));return value;
}
function intactQuality(passed,pdr=.2,localPdr=.2){
 return {...quality(passed,{'pixel-diff-ratio':pdr,'foreground-missing-ratio':pdr,'mean-absolute-delta':pdr*100}),
  componentLocalMetrics:[{id:'body',kind:'text',role:'text',severity:localPdr,pixelDiffRatio:localPdr,foregroundMissingRatio:localPdr}]};
}
test('independent intact geometry enters normal build/verify selection even without ordinary geometry changes',async()=>{
 const value=intactFixture(),before=structuredClone(value.deck);let verified=0;
 try{
  const result=await refineRenderedTextOnce(request(value,{candidateSpecLimit:1,initialQuality:intactQuality(false),verifyCandidate:async({deck})=>{
   verified++;assert.equal(deck.pages[0].textBoxes[0].positionedRuns[0].text,'AABBCC');return intactQuality(true,.1,.1);
  }}));
  assert.equal(verified,1);assert.equal(result.accepted,true);assert.equal(result.changedTextBoxes,1);assert.deepEqual(value.deck,before);
 }finally{cleanup(value.root);}
});
test('intact geometry rolls back on local regression, missing local evidence, global regression or build failure',async()=>{
 for(const mode of ['local','missing','global','build']){
  const value=intactFixture();
  try{
   const run=()=>refineRenderedTextOnce(request(value,{candidateSpecLimit:1,initialQuality:intactQuality(false),
    buildCandidate:async({pptxFile})=>{if(mode==='build')throw Error('build failed');fs.writeFileSync(pptxFile,'candidate');},
    verifyCandidate:async()=>mode==='missing'?quality(true,{'pixel-diff-ratio':.1,'foreground-missing-ratio':.1,'mean-absolute-delta':10})
     :intactQuality(true,mode==='global'?.3:.1,mode==='local'?.3:.1)}));
   if(mode==='build')await assert.rejects(run,/build failed/);else assert.equal((await run()).accepted,false);
   assert.equal(value.deck.pages[0].textBoxes[0].positionedRuns,undefined);assert.deepEqual(candidates(value.root),[]);
  }finally{cleanup(value.root);}
 }
});
test('a passed visual gate stops typography while preserving a separate source or structure failure',async()=>{
 const value=fixture();let builds=0;
 try{
  const blocked={...quality(false),checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:true},{name:'source-scene-complete',passed:false}]};
  const skipped=await refineRenderedTextOnce(request(value,{initialQuality:blocked,buildCandidate:async()=>{builds++;}}));
  assert.equal(builds,0);assert.equal(skipped.accepted,false);assert.equal(skipped.quality,blocked);assert.equal(skipped.quality.passed,false);
  const progress={...quality(false,{'pixel-diff-ratio':.07,'foreground-missing-ratio':.01,'mean-absolute-delta':7}),checks:blocked.checks};
  const selected=await refineRenderedTextOnce(request(value,{acceptImprovedFailure:true,buildCandidate:async({pptxFile})=>{builds++;fs.writeFileSync(pptxFile,'candidate');},verifyCandidate:async()=>progress}));
  assert.equal(selected.accepted,true);assert.equal(builds,1);assert.equal(selected.quality.passed,false);
  assert.equal(selected.quality.checks.find(c=>c.name==='source-scene-complete').passed,false);
 }finally{cleanup(value.root);}
});
test('global visual success cannot skip an unresolved local text quality gate',async()=>{
 const value=fixture();let builds=0;
 try{
  const checks=[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:true},{name:'source-scene-complete',passed:false}];
  const initial={...quality(false),checks,componentWorst:[{id:'body',kind:'text',role:'text',attention:true,severity:1.2}]};
  const after={...quality(false,{'pixel-diff-ratio':.07,'foreground-missing-ratio':.01,'mean-absolute-delta':7}),checks,componentWorst:[{id:'body',kind:'text',role:'text',attention:false,severity:.8}]};
  const result=await refineRenderedTextOnce(request(value,{initialQuality:initial,acceptImprovedFailure:true,
   buildCandidate:async({pptxFile})=>{builds++;fs.writeFileSync(pptxFile,'candidate');},verifyCandidate:async()=>after}));
  assert.equal(builds,1);assert.equal(result.accepted,true);assert.equal(result.quality.passed,false);
 }finally{cleanup(value.root);}
});

test("accepts one measured text refinement only after all visual metrics strictly improve", async () => {
  const value = fixture();
  try {
    const original = structuredClone(value.deck);
    const result = await refineRenderedTextOnce(request(value));
    assert.equal(result.accepted, true); assert.equal(result.changedTextBoxes, 1);
    assert.notEqual(result.deck, value.deck); assert.notEqual(result.deck.pages[0], value.deck.pages[0]);
    assert.equal(result.deck.pages[0].retained, value.deck.pages[0].retained);
    assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt > 16, true);
    assert.deepEqual(value.deck, original);
    assert.equal(fs.existsSync(result.deckFile), true); assert.equal(fs.existsSync(result.pptxFile), true);
  } finally { cleanup(value.root); }
});

test("explicit progressive mode retains strict visual improvement without marking it passed", async () => {
  const value = fixture();
  try {
    const improved = quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 });
    const initial = quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 });
    const rejected = await refineRenderedTextOnce(request(value, { initialQuality: initial, verifyCandidate: async () => improved }));
    assert.equal(rejected.accepted, false);
    const accepted = await refineRenderedTextOnce(request(value, { initialQuality: initial, verifyCandidate: async () => improved, acceptImprovedFailure: true }));
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.quality.passed, false);
    assert.equal(accepted.quality.metrics["pixel-diff-ratio"], 0.18);
  } finally { cleanup(value.root); }
});

test("tries a smaller ranked text subset when the full measured set regresses", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = [
      textBox(),
      textBox()
    ];
    value.deck.pages[0].textBoxes[1].id = "secondary";
    value.deck.pages[0].textBoxes[1].box = { x: 50, y: 20, w: 30, h: 15 };
    pngMany(value.source, [{ x: 12, y: 22, w: 22, h: 10 }, { x: 52, y: 22, w: 18, h: 8 }]);
    pngMany(value.rendered, [{ x: 12, y: 22, w: 16, h: 7 }, { x: 52, y: 22, w: 16, h: 7 }]);
    let verifications = 0;
    const result = await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        verifications += 1;
        const changed = deck.pages[0].textBoxes.filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt).length;
        return changed === 1
          ? quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 })
          : quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 });
      },
      initialQuality: quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      acceptImprovedFailure: true
    }));

    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 1);
    assert.equal(verifications >= 2, true);
  } finally { cleanup(value.root); }
});

test("bounds ranked text refinement batches to avoid unbounded render attempts", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = Array.from({ length: 20 }, (_, index) => ({
      ...textBox(),
      id: `text-${index}`,
      box: { x: 2 + index * 4.5, y: 20, w: 4, h: 15 }
    }));
    pngMany(value.source, Array.from({ length: 20 }, (_, index) => ({ x: 3 + index * 4, y: 22, w: 3, h: 9 })));
    pngMany(value.rendered, Array.from({ length: 20 }, (_, index) => ({ x: 3 + index * 4, y: 22, w: 2, h: 7 })));
    let largestChanged = 0;
    await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes.filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt).length;
        largestChanged = Math.max(largestChanged, changed);
        return quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 });
      },
      initialQuality: quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      acceptImprovedFailure: true
    }));

    assert.equal(largestChanged <= 16, true);
  } finally { cleanup(value.root); }
});

test("can cap text refinement candidate specs for latency-sensitive callers", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = Array.from({ length: 8 }, (_, index) => ({
      ...textBox(),
      id: `text-${index}`,
      box: { x: 5 + index * 10, y: 20, w: 8, h: 15 }
    }));
    pngMany(value.source, Array.from({ length: 8 }, (_, index) => ({ x: 6 + index * 10, y: 22, w: 7, h: 9 })));
    pngMany(value.rendered, Array.from({ length: 8 }, (_, index) => ({ x: 6 + index * 10, y: 22, w: 5, h: 7 })));
    let builds = 0;
    await refineRenderedTextOnce(request(value, {
      candidateSpecLimit: 2,
      buildCandidate: async ({ pptxFile }) => { builds += 1; fs.writeFileSync(pptxFile, "candidate"); },
      verifyCandidate: async () => quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 }),
      initialQuality: quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      acceptImprovedFailure: true
    }));

    assert.equal(builds, 2);
    await assert.rejects(refineRenderedTextOnce(request(value, { candidateSpecLimit: 0 })), /candidate limit is invalid/);
  } finally { cleanup(value.root); }
});

test("tries the complete ranked text set when the measured batch is bounded", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = Array.from({ length: 10 }, (_, index) => ({
      ...textBox(),
      id: `text-${index}`,
      box: { x: 5 + (index % 5) * 18, y: 20 + Math.floor(index / 5) * 25, w: 7, h: 15 }
    }));
    pngMany(value.source, Array.from({ length: 10 }, (_, index) => ({ x: 6 + (index % 5) * 18, y: 22 + Math.floor(index / 5) * 25, w: 7, h: 9 })));
    pngMany(value.rendered, Array.from({ length: 10 }, (_, index) => ({ x: 6 + (index % 5) * 18, y: 22 + Math.floor(index / 5) * 25, w: 5, h: 7 })));
    let sawCompleteSet = false;
    await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes.filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt).length;
        sawCompleteSet = sawCompleteSet || changed === 10;
        return quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 });
      },
      initialQuality: quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      acceptImprovedFailure: true
    }));

    assert.equal(sawCompleteSet, true);
  } finally { cleanup(value.root); }
});

test("tries one systemic OCR growth cohort when measured under-sizing is page-wide", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = Array.from({ length: 8 }, (_, index) => ({
      ...textBox(),
      id: `ocr-${index}`,
      box: { x: 2 + index * 12, y: 20, w: 10, h: 15 },
      style: { visibility: "visible", wrap: false, fit: "shrink" },
      source: { editable: true, confidence: 0.96, ocrProvider: "team-pinned-ocr" }
    }));
    pngMany(value.source, Array.from({ length: 8 }, (_, index) => ({ x: 3 + index * 12, y: 22, w: 8, h: 9 })));
    pngMany(value.rendered, Array.from({ length: 8 }, (_, index) => ({ x: 3 + index * 12, y: 22, w: 6, h: 7 })));
    const verifiedChangeCounts = [];
    const result = await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes.filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt).length;
        verifiedChangeCounts.push(changed);
        return changed === 8
          ? quality(true, { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 })
          : quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20 });
      }
    }));

    assert.equal(verifiedChangeCounts[0], 8);
    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 8);
    assert.equal(result.deck.pages[0].textBoxes.every((item, index) => item.font.sizePt > value.deck.pages[0].textBoxes[index].font.sizePt), true);
  } finally { cleanup(value.root); }
});

test("tries a complete positioned OCR line instead of refining one segment", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = Array.from({ length: 3 }, (_, index) => ({
      ...textBox(),
      id: `segment-${index}`,
      box: { x: 10 + index * 28, y: 20, w: 24, h: 15 },
      font: { color: "#141e28", family: "Arial", sizePt: 8, align: "left", valign: "middle" },
      style: { visibility: "visible", wrap: false, fit: "shrink" },
      source: {
        editable: true,
        confidence: 0.98,
        ocrProvider: "team-pinned-ocr",
        segmentedOcrLineId: "ocr-line",
        evidenceBox: { x: 10 + index * 28, y: 20, w: 24, h: 15 }
      }
    }));
    pngMany(value.source, Array.from({ length: 3 }, (_, index) => ({ x: 12 + index * 28, y: 22, w: 18, h: 9 })));
    pngMany(value.rendered, Array.from({ length: 3 }, (_, index) => ({ x: 12 + index * 28, y: 22, w: 13, h: 7 })));
    const verifiedChangedIds = [];
    const result = await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes
          .filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt)
          .map((item) => item.id);
        verifiedChangedIds.push(changed);
        return changed.length === 3
          ? quality(true, { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 })
          : quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20 });
      }
    }));

    assert.deepEqual(verifiedChangedIds[0], ["segment-0", "segment-1", "segment-2"]);
    assert.equal(verifiedChangedIds.some((ids) => ids.length === 1), false);
    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 3);
  } finally { cleanup(value.root); }
});

test("tries singleton text candidates when the highest ranked measured fit regresses", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = [
      textBox(),
      textBox()
    ];
    value.deck.pages[0].textBoxes[0].id = "harmful";
    value.deck.pages[0].textBoxes[1].id = "helpful";
    value.deck.pages[0].textBoxes[1].box = { x: 50, y: 20, w: 30, h: 15 };
    pngMany(value.source, [{ x: 12, y: 22, w: 24, h: 11 }, { x: 52, y: 22, w: 18, h: 8 }]);
    pngMany(value.rendered, [{ x: 12, y: 22, w: 16, h: 7 }, { x: 52, y: 22, w: 16, h: 7 }]);
    const verifiedChangedIds = [];
    const result = await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes
          .filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt)
          .map((item) => item.id);
        verifiedChangedIds.push(changed.join(","));
        return changed.length === 1 && changed[0] === "helpful"
          ? quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 })
          : quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3 });
      },
      initialQuality: quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      acceptImprovedFailure: true
    }));

    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 1);
    assert.ok(verifiedChangedIds.includes("harmful"));
    assert.ok(verifiedChangedIds.includes("helpful"));
    assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, value.deck.pages[0].textBoxes[0].font.sizePt);
    assert.notEqual(result.deck.pages[0].textBoxes[1].font.sizePt, value.deck.pages[0].textBoxes[1].font.sizePt);
  } finally { cleanup(value.root); }
});

test("prioritizes verifier-worst text singleton candidates over larger measured changes", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = [
      textBox(),
      textBox()
    ];
    value.deck.pages[0].textBoxes[0].id = "large-title";
    value.deck.pages[0].textBoxes[1].id = "worst-label";
    value.deck.pages[0].textBoxes[1].box = { x: 50, y: 20, w: 30, h: 15 };
    pngMany(value.source, [{ x: 12, y: 22, w: 24, h: 11 }, { x: 52, y: 22, w: 18, h: 8 }]);
    pngMany(value.rendered, [{ x: 12, y: 22, w: 16, h: 7 }, { x: 52, y: 22, w: 16, h: 7 }]);
    const verifiedChangedIds = [];
    const initialQuality = {
      ...quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      componentWorst: [{ pageIndex: 0, id: "worst-label", kind: "text", role: "text", severity: 3 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes
          .filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt)
          .map((item) => item.id);
        verifiedChangedIds.push(changed.join(","));
        return changed.length === 1 && changed[0] === "worst-label"
          ? quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3, "worst-component-normalized-severity": 2 })
          : quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3, "worst-component-normalized-severity": 3 });
      },
      initialQuality,
      acceptImprovedFailure: true
    }));

    assert.equal(result.accepted, true);
    assert.equal(verifiedChangedIds[0], "worst-label");
    assert.equal(result.changedTextBoxes, 1);
  } finally { cleanup(value.root); }
});

test("prioritizes the worst text with stronger measured local mismatch", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    value.deck.pages[0].textBoxes = [
      textBox(),
      textBox()
    ];
    value.deck.pages[0].textBoxes[0].id = "listed-first";
    value.deck.pages[0].textBoxes[1].id = "larger-mismatch";
    value.deck.pages[0].textBoxes[1].box = { x: 50, y: 20, w: 30, h: 15 };
    pngMany(value.source, [{ x: 13, y: 22, w: 20, h: 9 }, { x: 57, y: 22, w: 20, h: 9 }]);
    pngMany(value.rendered, [{ x: 12, y: 22, w: 16, h: 7 }, { x: 52, y: 22, w: 16, h: 7 }]);
    const verifiedChangedIds = [];
    const initialQuality = {
      ...quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      componentWorst: [
        { pageIndex: 0, id: "listed-first", kind: "text", role: "text", severity: 3 },
        { pageIndex: 0, id: "larger-mismatch", kind: "text", role: "text", severity: 3 }
      ]
    };
    await refineRenderedTextOnce(request(value, {
      verifyCandidate: async ({ deck }) => {
        const changed = deck.pages[0].textBoxes
          .filter((item, index) => item.font.sizePt !== value.deck.pages[0].textBoxes[index].font.sizePt)
          .map((item) => item.id);
        verifiedChangedIds.push(changed.join(","));
        return quality(false, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3, "worst-component-normalized-severity": 3 });
      },
      initialQuality,
      acceptImprovedFailure: true
    }));

    assert.equal(verifiedChangedIds[0], "larger-mismatch");
  } finally { cleanup(value.root); }
});

test("rejects singleton text refinements that worsen the targeted verifier component", async () => {
  const value = fixture();
  try {
    const initialQuality = {
      ...quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      initialQuality,
      acceptImprovedFailure: true,
      verifyCandidate: async () => ({
        ...quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3, "worst-component-normalized-severity": 1.1 }),
        componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.25 }]
      })
    }));

    assert.equal(result.accepted, false);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("accepts singleton text refinements when the targeted verifier component leaves the worst list", async () => {
  const value = fixture();
  try {
    const initialQuality = {
      ...quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "component-regions-attention": 4 }),
      componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      initialQuality,
      acceptImprovedFailure: true,
      verifyCandidate: async () => ({
        ...quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "component-regions-attention": 3, "worst-component-normalized-severity": 1.1 }),
        componentWorst: [{ pageIndex: 0, id: "other", kind: "text", role: "text", severity: 1.1 }]
      })
    }));

    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 1);
  } finally { cleanup(value.root); }
});

test("rejects target text disappearance when keyed local metrics do not prove improvement", async () => {
  const value = fixture();
  try {
    const initialQuality = {
      ...quality(false, {
        "pixel-diff-ratio": 0.2,
        "foreground-missing-ratio": 0.2,
        "mean-absolute-delta": 20,
        "component-regions-attention": 4
      }),
      componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2 }],
      componentLocalMetrics: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2, pixelDiffRatio: 0.5, foregroundMissingRatio: 0.3 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      initialQuality,
      acceptImprovedFailure: true,
      verifyCandidate: async () => ({
        ...quality(false, {
          "pixel-diff-ratio": 0.18,
          "foreground-missing-ratio": 0.18,
          "mean-absolute-delta": 18,
          "component-regions-attention": 3,
          "worst-component-normalized-severity": 1.1
        }),
        componentWorst: [{ pageIndex: 0, id: "other", kind: "text", role: "text", severity: 1.1 }],
        componentLocalMetrics: [{ pageIndex: 0, id: "other", kind: "text", role: "text", severity: 1.1, pixelDiffRatio: 0.45, foregroundMissingRatio: 0.25 }]
      })
    }));

    assert.equal(result.accepted, false);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("accepts target text only when keyed local metrics improve without regressions", async () => {
  const value = fixture();
  try {
    const initialQuality = {
      ...quality(false, {
        "pixel-diff-ratio": 0.2,
        "foreground-missing-ratio": 0.2,
        "mean-absolute-delta": 20,
        "component-regions-attention": 4,
        "worst-component-normalized-severity": 1.2
      }),
      componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2 }],
      componentLocalMetrics: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.2, pixelDiffRatio: 0.5, foregroundMissingRatio: 0.3 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      initialQuality,
      acceptImprovedFailure: true,
      verifyCandidate: async () => ({
        ...quality(false, {
          "pixel-diff-ratio": 0.18,
          "foreground-missing-ratio": 0.18,
          "mean-absolute-delta": 18,
          "component-regions-attention": 3,
          "worst-component-normalized-severity": 1.1
        }),
        componentWorst: [{ pageIndex: 0, id: "other", kind: "text", role: "text", severity: 1.1 }],
        componentLocalMetrics: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.1, pixelDiffRatio: 0.49, foregroundMissingRatio: 0.3 }]
      })
    }));

    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 1);
  } finally { cleanup(value.root); }
});

test("accepts target text progress when global pixel diff does not regress", async () => {
  const value = fixture();
  try {
    const initialQuality = {
      ...quality(false, {
        "pixel-diff-ratio": 0.13618,
        "foreground-missing-ratio": 0.1285,
        "mean-absolute-delta": 11.95,
        "component-regions-attention": 32,
        "worst-component-normalized-severity": 1.48,
        "worst-component-pixel-diff-ratio": 0.79,
        "worst-component-foreground-missing-ratio": 0.50
      }),
      componentWorst: [{ pageIndex: 0, id: "body", kind: "text", role: "text", severity: 1.48 }]
    };
    const result = await refineRenderedTextOnce(request(value, {
      initialQuality,
      acceptImprovedFailure: true,
      verifyCandidate: async () => ({
        ...quality(false, {
          "pixel-diff-ratio": 0.13618,
          "foreground-missing-ratio": 0.1268,
          "mean-absolute-delta": 11.96,
          "component-regions-attention": 31,
          "worst-component-normalized-severity": 1.41,
          "worst-component-pixel-diff-ratio": 0.79,
          "worst-component-foreground-missing-ratio": 0.48
        }),
        componentWorst: [{ pageIndex: 0, id: "other", kind: "text", role: "text", severity: 1.41 }]
      })
    }));

    assert.equal(result.accepted, true);
    assert.equal(result.changedTextBoxes, 1);
  } finally { cleanup(value.root); }
});

test("progressive refinement still rejects regressions and invalid policy", async () => {
  const value = fixture();
  try {
    await assert.rejects(refineRenderedTextOnce(request(value, { acceptImprovedFailure: "yes" })), /policy is invalid/);
    const result = await refineRenderedTextOnce(request(value, { acceptImprovedFailure: true, verifyCandidate: async () => quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.21, "mean-absolute-delta": 18 }) }));
    assert.equal(result.accepted, false);
    const initialQuality = quality(false, { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20, "worst-component-normalized-severity": 1 });
    const worsenedComponent = await refineRenderedTextOnce(request(value, { acceptImprovedFailure: true, initialQuality,
      verifyCandidate: async () => quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18, "worst-component-normalized-severity": 2 }) }));
    assert.equal(worsenedComponent.accepted, false);
    const missingEvidence = await refineRenderedTextOnce(request(value, { acceptImprovedFailure: true, initialQuality,
      verifyCandidate: async () => quality(false, { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 18 }) }));
    assert.equal(missingEvidence.accepted, false);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("skips an already passing baseline without building or verifying another candidate", async () => {
  const value = fixture();
  try {
    let built = 0, verified = 0;
    const initialQuality = quality(true, { "pixel-diff-ratio": 0.01, "foreground-missing-ratio": 0.01, "mean-absolute-delta": 1 });
    const result = await refineRenderedTextOnce(request(value, { initialQuality, buildCandidate: async () => { built += 1; }, verifyCandidate: async () => { verified += 1; return initialQuality; } }));
    assert.deepEqual(result, { deck: value.deck, deckFile: value.deckFile, pptxFile: value.pptxFile, quality: initialQuality, accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 });
    assert.equal(built, 0); assert.equal(verified, 0);
  } finally { cleanup(value.root); }
});

test("does not write or build when raster evidence yields no text adjustment", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    let built = 0;
    const result = await refineRenderedTextOnce(request(value, { buildCandidate: async () => { built += 1; } }));
    assert.equal(result.accepted, false); assert.equal(result.changedTextBoxes, 0); assert.equal(built, 0); assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("rejects a candidate that worsens visual quality and removes only its candidate artifacts", async () => {
  const value = fixture();
  try {
    const result = await refineRenderedTextOnce(request(value, { verifyCandidate: async () => quality(true, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 }) }));
    assert.equal(result.accepted, false); assert.equal(result.deck, value.deck); assert.equal(result.pptxFile, value.pptxFile);
    assert.equal(result.changedTextBoxes, 1);
    assert.deepEqual(candidates(value.root), []); assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("rejects malformed initial visual evidence before candidate work", async () => {
  const value = fixture();
  try {
    const invalid = { passed: false, checks: [{ name: "quality-rendered", passed: false }], metrics: {} };
    await assert.rejects(refineRenderedTextOnce(request(value, { initialQuality: invalid })), /initial quality is invalid/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("cleans partial candidate files after a builder failure", async () => {
  const value = fixture();
  try {
    await assert.rejects(refineRenderedTextOnce(request(value, { buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "partial"); throw new Error("build failed"); } })), /build failed/);
    assert.deepEqual(candidates(value.root), []); assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("cleans the reserved candidate after cancellation immediately after build", async () => {
  const value = fixture();
  try {
    let built = false;
    await assert.rejects(refineRenderedTextOnce(request(value, {
      buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "candidate"); built = true; },
      isCancellationRequested: async () => built
    })), /cancelled/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("rejects traversal and symbolic-link image inputs before decoding", async () => {
  const value = fixture();
  const outside = path.join(path.dirname(value.root), `outside-${crypto.randomUUID()}.png`);
  png(outside, { x: 1, y: 1, w: 8, h: 8 });
  try {
    await assert.rejects(refineRenderedTextOnce(request(value, { sourceImages: [outside] })), /outside the root/);
    const link = path.join(value.root, "linked.png");
    fs.symlinkSync(value.source, link, "file");
    await assert.rejects(refineRenderedTextOnce(request(value, { sourceImages: [link] })), /source image is invalid/);
  } finally { fs.rmSync(outside, { force: true }); cleanup(value.root); }
});

test("preserves a preexisting UUID-collision target instead of clobbering it", async () => {
  const value = fixture();
  const original = crypto.randomUUID;
  crypto.randomUUID = () => "known-collision";
  const collision = path.join(value.root, "text-refinement-known-collision.pptx");
  try {
    fs.writeFileSync(collision, "do-not-touch");
    await assert.rejects(refineRenderedTextOnce(request(value)), /EEXIST/);
    assert.equal(fs.readFileSync(collision, "utf8"), "do-not-touch");
  } finally { crypto.randomUUID = original; cleanup(value.root); }
});

test("invalid candidate reports and verifier failures propagate after candidate cleanup", async () => {
  const value = fixture();
  try {
    const inconsistent = quality(true); inconsistent.checks[1].passed = false;
    await assert.rejects(refineRenderedTextOnce(request(value, { verifyCandidate: async () => inconsistent })), /candidate quality is invalid/);
    assert.deepEqual(candidates(value.root), []);
    await assert.rejects(refineRenderedTextOnce(request(value, { verifyCandidate: async () => { throw new Error("verification failed"); } })), /verification failed/);
    assert.deepEqual(candidates(value.root), []);
    assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("empty, excessive and mismatched page sets fail before building", async () => {
  const value = fixture();
  try {
    for (const pages of [[], Array(21).fill(value.deck.pages[0]), [{ textBoxes: Array(2001).fill(null) }]]) {
      await assert.rejects(refineRenderedTextOnce(request(value, { deck: { ...value.deck, pages } })), /deck page/);
    }
    await assert.rejects(refineRenderedTextOnce(request(value, { renderedImages: [value.rendered, value.rendered] })), /page counts/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});
