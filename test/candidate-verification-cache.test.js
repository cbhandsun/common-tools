"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCandidateVerificationCache } = require("../packages/slideclone-worker-adapter/candidate-verification-cache");
const { createRawImageRenderQualityVerifier } = require("../packages/slideclone-worker-adapter/team-render-quality");
const { writeStoredZipAtomic } = require("../packages/slideclone-core/pptx-zip");

function writePptx(file, marker = "same-slide") {
  writeStoredZipAtomic(file, [
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from("<p:presentation/>") },
    { name: "ppt/slides/slide1.xml", data: Buffer.from(`<p:sld>${marker}</p:sld>`) }
  ]);
}

function rewriteZipTimestamps(source, destination) {
  const bytes = Buffer.from(fs.readFileSync(source));
  for (let offset = 0; offset + 16 <= bytes.length; offset += 1) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      bytes.writeUInt16LE(17, offset + 10);
      bytes.writeUInt16LE(33, offset + 12);
    }
    if (signature === 0x02014b50) {
      bytes.writeUInt16LE(17, offset + 12);
      bytes.writeUInt16LE(33, offset + 14);
    }
  }
  fs.writeFileSync(destination, bytes);
}

function deck(revision = 1) {
  return {
    version: "1.0",
    meta: { revision },
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "assets/source.png",
      shapes: [],
      images: [{ id: "icon", assetPath: "assets/icon.png", box: { x: 10, y: 10, w: 20, h: 20 } }],
      textBoxes: [],
      tables: [],
      charts: [],
      icons: []
    }]
  };
}

function quality(passed = false, extra = {}) {
  return {
    passed,
    checks: [
      { name: "quality-rendered", passed: true },
      { name: "visual-fidelity", passed }
    ],
    metrics: {
      "pixel-diff-ratio": passed ? 0.04 : 0.19,
      "foreground-missing-ratio": passed ? 0.03 : 0.21,
      "mean-absolute-delta": passed ? 8 : 20,
      "quality-pages-compared": 1
    },
    ...extra
  };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-verification-cache-"));
  const assets = path.join(root, "assets");
  fs.mkdirSync(assets);
  const sourceImage = path.join(assets, "source.png");
  const icon = path.join(assets, "icon.png");
  const pptxFile = path.join(root, "candidate-a.pptx");
  fs.writeFileSync(sourceImage, "source-one");
  fs.writeFileSync(icon, "icon-one");
  writePptx(pptxFile);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const renderer = async () => ({});
  const comparator = () => ({});
  const settings = { render: { dpi: 144, maxPages: 1 }, comparison: { threshold: 24 } };
  const policy = { maximumPixelDiffRatio: 0.08, maximumForegroundMissingRatio: 0.12, maximumMeanAbsoluteDelta: 12 };
  const binding = (overrides = {}) => ({
    root,
    pptxFile,
    sourceImages: [sourceImage],
    deck: deck(),
    renderer,
    comparator,
    settings,
    policy,
    ...overrides
  });
  return { root, sourceImage, icon, pptxFile, renderer, comparator, settings, policy, binding };
}

function store(cache, binding, result = quality(false)) {
  const attempt = cache.begin(binding);
  assert.equal(attempt.cached, null);
  assert.equal(attempt.commit(result), true);
}

test("complete failed verification is reused across output paths and volatile ZIP timestamps", (t) => {
  const files = fixture(t);
  const cache = createCandidateVerificationCache();
  store(cache, files.binding());

  const secondPptx = path.join(files.root, "candidate-b.pptx");
  rewriteZipTimestamps(files.pptxFile, secondPptx);
  assert.notDeepEqual(fs.readFileSync(files.pptxFile), fs.readFileSync(secondPptx));
  const cached = cache.begin(files.binding({ pptxFile: secondPptx })).cached;

  assert.equal(cached.passed, false);
  assert.equal(cached.metrics["pixel-diff-ratio"], 0.19);
  assert.equal(Object.isFrozen(cached), true);
  assert.equal(Object.isFrozen(cached.metrics), true);
  assert.throws(() => { cached.metrics["pixel-diff-ratio"] = 0; }, TypeError);
  assert.equal(cache.begin(files.binding()).cached.metrics["pixel-diff-ratio"], 0.19);
});

test("full IR, source, assets, renderer, settings, policy, reference, and emitted OOXML stay in the cache key", async (t) => {
  const cases = [
    ["full IR revision", files => files.binding({ deck: deck(2) })],
    ["source content", files => { fs.writeFileSync(files.sourceImage, "source-two"); return files.binding(); }],
    ["asset content", files => { fs.writeFileSync(files.icon, "icon-two"); return files.binding(); }],
    ["renderer", files => files.binding({ renderer: async () => ({ changed: true }) })],
    ["comparator", files => files.binding({ comparator: () => ({ changed: true }) })],
    ["settings", files => files.binding({ settings: { ...files.settings, render: { ...files.settings.render, dpi: 192 } } })],
    ["policy", files => files.binding({ policy: { ...files.policy, maximumPixelDiffRatio: 0.09 } })],
    ["reference quality", files => files.binding({ referenceQuality: quality(true) })],
    ["emitted OOXML", files => { const changed = path.join(files.root, "changed.pptx"); writePptx(changed, "changed-slide"); return files.binding({ pptxFile: changed }); }]
  ];
  for (const [name, changedBinding] of cases) {
    await t.test(name, child => {
      const files = fixture(child);
      const cache = createCandidateVerificationCache();
      store(cache, files.binding());
      assert.equal(cache.begin(changedBinding(files)).cached, null);
    });
  }
});

test("optional undefined object fields match the JSON passed to the builder", t => {
  const files = fixture(t);
  const cache = createCandidateVerificationCache();
  const original = deck();
  original.pages[0].images[0].source = { optional: undefined };
  store(cache, files.binding({ deck: original }));
  const serialized = JSON.parse(JSON.stringify(original));
  assert.equal(cache.begin(files.binding({ deck: serialized })).cached.passed, false);
});

test("reference render timing and cache-hit telemetry cannot invalidate an identical verified candidate", t => {
  const files=fixture(t),cache=createCandidateVerificationCache();
  const reference=quality(false);reference.metrics["quality-render-milliseconds"]=11964;
  const before=structuredClone(reference);
  store(cache,files.binding({referenceQuality:reference}));
  const replay=structuredClone(reference);replay.metrics["quality-render-milliseconds"]=0;replay.metrics["quality-verification-cache-hit"]=1;
  assert.equal(cache.begin(files.binding({referenceQuality:replay})).cached?.passed,false);
  assert.deepEqual(reference,before);
  for(const change of [q=>q.metrics["pixel-diff-ratio"]=.18,q=>q.passed=true,
    q=>q.checks[0].passed=false,q=>q.componentLocalMetrics=[{id:'changed',pixelDiffRatio:.1}],
    q=>q.metrics["quality-render-milliseconds"]=-1,q=>q.metrics["quality-render-milliseconds"]='0',
    q=>q.metrics["quality-verification-cache-hit"]=2,q=>q.metrics.otherTelemetry=1]){
    const changed=structuredClone(replay);change(changed);
    assert.equal(cache.begin(files.binding({referenceQuality:changed})).cached,null);
  }
  let calls=0;const unsafe=structuredClone(replay);
  Object.defineProperty(unsafe.metrics,'quality-render-milliseconds',{enumerable:true,get(){calls++;return 0;}});
  assert.equal(cache.begin(files.binding({referenceQuality:unsafe})).cached,null);assert.equal(calls,0);
});

test("render errors, incomplete results, and unsafe bindings are never cached", (t) => {
  const files = fixture(t);
  const cache = createCandidateVerificationCache();
  const renderFailure = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: false }],
    metrics: { "quality-render-failed": 1 }
  };
  assert.equal(cache.begin(files.binding()).commit(renderFailure), false);
  assert.equal(cache.begin(files.binding()).cached, null);
  assert.equal(cache.begin(files.binding()).commit({ passed: false, checks: [], metrics: {} }), false);
  assert.equal(cache.begin(files.binding()).cached, null);

  let getterCalls = 0;
  const unsafeDeck = {};
  Object.defineProperty(unsafeDeck, "pages", { enumerable: true, get() { getterCalls += 1; return []; } });
  const accessorAttempt = cache.begin(files.binding({ deck: unsafeDeck }));
  assert.equal(accessorAttempt.cached, null);
  assert.equal(accessorAttempt.commit(quality(false)), false);
  assert.equal(getterCalls, 0);

  let proxyCalls = 0;
  const proxiedDeck = new Proxy(deck(), { get(target, key, receiver) { proxyCalls += 1; return Reflect.get(target, key, receiver); } });
  assert.equal(cache.begin(files.binding({ deck: proxiedDeck })).cached, null);
  assert.equal(proxyCalls, 0);

  const traversalDeck = deck();
  traversalDeck.pages[0].images[0].assetPath = "../outside.png";
  assert.equal(cache.begin(files.binding({ deck: traversalDeck })).commit(quality(false)), false);
  const outside = path.join(files.root, "..", `${path.basename(files.root)}-outside.png`);
  fs.writeFileSync(outside, "outside");
  try {
    assert.equal(cache.begin(files.binding({ sourceImages: [outside] })).commit(quality(false)), false);
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

test("cache is LRU bounded and rejects oversized result payloads", (t) => {
  const files = fixture(t);
  const cache = createCandidateVerificationCache({ maxEntries: 2, maxBytes: 4096, maxResultBytes: 1024 });
  store(cache, files.binding({ deck: deck(1) }));
  store(cache, files.binding({ deck: deck(2) }));
  store(cache, files.binding({ deck: deck(3) }));
  assert.equal(cache.begin(files.binding({ deck: deck(1) })).cached, null);
  assert.equal(cache.begin(files.binding({ deck: deck(2) })).cached.passed, false);
  assert.equal(cache.begin(files.binding({ deck: deck(3) })).cached.passed, false);

  const large = quality(false, { diagnostics: "x".repeat(3000) });
  const attempt = cache.begin(files.binding({ deck: deck(4) }));
  assert.equal(attempt.commit(large), false);
  assert.equal(cache.begin(files.binding({ deck: deck(4) })).cached, null);
});

test("render-quality wrapper memoizes complete failures but bypasses cache when rendered pages are requested", async (t) => {
  const files = fixture(t);
  let renders = 0;
  let collected = null;
  const renderDirectories = [];
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => {
      renders += 1;
      renderDirectories.push(context.outputDir);
      return { ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } };
    },
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.19, foregroundMissingRatio: 0.21, meanAbsoluteDelta: 20 })
  });
  const request = { root: files.root, pptxFile: files.pptxFile, sourceImages: [files.sourceImage], deck: deck(), isCancellationRequested: async () => false };
  const first = await verify(request);
  const second = await verify(request);
  assert.equal(first.passed, false);
  assert.equal(second.passed, false);
  assert.equal(renders, 1);
  assert.equal(second.metrics["quality-verification-cache-hit"], 1);
  assert.equal(second.metrics["quality-render-milliseconds"], 0);

  let cancellationChecks = 0;
  await assert.rejects(verify({ ...request, isCancellationRequested: async () => {
    cancellationChecks += 1;
    return cancellationChecks === 2;
  } }), /cancelled/u);
  assert.equal(renders, 1);

  await verify({ ...request, collectRenderedPages: pages => { collected = pages; } });
  assert.equal(renders, 2);
  assert.deepEqual(collected, [path.join(renderDirectories[1], "page-1.png")]);
  assert.equal(path.dirname(renderDirectories[1]), files.root);
  assert.notEqual(renderDirectories[0], renderDirectories[1]);
  await verify({ ...request, deck: deck(2) });
  assert.equal(renders, 3);
});
test("concurrent quality requests isolate their writable render and diff files", async t => {
  const files=fixture(t),outputs=[],diffs=[];
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const verify=createRawImageRenderQualityVerifier({
    renderPresentation:async (input,context)=>{
      outputs.push(context.outputDir);
      if(input.ir.meta.revision===1)await gate;else release();
      fs.writeFileSync(path.join(context.outputDir,'marker'),String(input.ir.meta.revision));
      return {ok:true,data:{renderedPages:[{image:path.join(context.outputDir,'page-1.png')}]}};
    },
    comparePageFiles:job=>{
      assert.equal(path.dirname(job.diffImage),path.dirname(job.renderedImage));diffs.push(job.diffImage);
      const revision=Number(fs.readFileSync(path.join(path.dirname(job.diffImage),'marker'),'utf8'));
      return {ok:true,pixelDiffRatio:revision/100,foregroundMissingRatio:0,meanAbsoluteDelta:1};
    }
  });
  const request={root:files.root,pptxFile:files.pptxFile,sourceImages:[files.sourceImage],isCancellationRequested:async()=>false};
  const result=await Promise.all([verify({...request,deck:deck(1)}),verify({...request,deck:deck(2)})]);
  assert.equal(new Set(outputs).size,2);assert.equal(new Set(diffs).size,2);
  assert.deepEqual(result.map(q=>q.metrics['pixel-diff-ratio']),[.01,.02]);
});
test("identical in-flight candidates render once and replay independently collected snapshots",async t=>{
  const files=fixture(t),{writePng}=require('../packages/slideclone-core/png');let renders=0;
  const verify=createRawImageRenderQualityVerifier({
    renderPresentation:async (_input,context)=>{
      renders++;await new Promise(resolve=>setImmediate(resolve));
      const image=path.join(context.outputDir,'page-1.png');writePng(image,{width:2,height:2,rgba:Buffer.alloc(16,255)});
      return {ok:true,data:{renderedPages:[{image}]}};
    },comparePageFiles:()=>({ok:true,pixelDiffRatio:.04,foregroundMissingRatio:.03,meanAbsoluteDelta:8})
  });
  const other=path.join(files.root,'candidate-copy.pptx');fs.copyFileSync(files.pptxFile,other);
  const request={root:files.root,pptxFile:files.pptxFile,sourceImages:[files.sourceImage],deck:deck(),isCancellationRequested:async()=>false};
  let first,second;
  const result=await Promise.all([verify({...request,collectRenderedPages:p=>{first=p;}}),
    verify({...request,pptxFile:other,collectRenderedPages:p=>{second=p;}})]);
  assert.equal(renders,1);assert.equal(result[1].metrics['quality-verification-cache-hit'],1);
  assert.deepEqual(fs.readFileSync(first[0]),fs.readFileSync(second[0]));
  assert.equal(result[0].metrics['pixel-diff-ratio'],result[1].metrics['pixel-diff-ratio']);
});
test("failed in-flight renders release waiters without caching a failed rendering",async t=>{
  const files=fixture(t);let calls=0;
  const verify=createRawImageRenderQualityVerifier({renderPresentation:async (_input,context)=>{
    const index=++calls;await new Promise(resolve=>setImmediate(resolve));
    if(index===1)throw new Error('controlled renderer failure');
    return {ok:true,data:{renderedPages:[{image:path.join(context.outputDir,'page-1.png')}]}};
  },comparePageFiles:()=>({ok:true,pixelDiffRatio:.04,foregroundMissingRatio:.03,meanAbsoluteDelta:8})});
  const request={root:files.root,pptxFile:files.pptxFile,sourceImages:[files.sourceImage],deck:deck(),isCancellationRequested:async()=>false};
  const results=await Promise.all([verify(request),verify(request)]);
  assert.equal(calls,2);assert.equal(results[0].checks[0].passed,false);assert.equal(results[1].passed,true);
});
test("a cancelled duplicate cannot reuse a completed owner's success",async t=>{
  const files=fixture(t);let release,started,cancelled=false,renders=0;
  const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const verify=createRawImageRenderQualityVerifier({renderPresentation:async (_input,context)=>{
    renders++;started();await gate;
    return {ok:true,data:{renderedPages:[{image:path.join(context.outputDir,'page-1.png')}]}};
  },comparePageFiles:()=>({ok:true,pixelDiffRatio:.04,foregroundMissingRatio:.03,meanAbsoluteDelta:8})});
  const request={root:files.root,pptxFile:files.pptxFile,sourceImages:[files.sourceImage],deck:deck(),isCancellationRequested:async()=>false};
  const owner=verify(request);await ready;
  const waiter=assert.rejects(verify({...request,isCancellationRequested:async()=>cancelled}),/cancelled/);
  await new Promise(resolve=>setImmediate(resolve));cancelled=true;release();
  assert.equal((await owner).passed,true);await waiter;assert.equal(renders,1);
});
