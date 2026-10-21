"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createNativeOnlyMissingRefiner:create}=require("../packages/slideclone-worker-adapter/native-only-missing-refinement");
const region=(x,severity)=>({pageIndex:0,id:`missing-${x}`,kind:"missing",role:"missing-native-component",box:{x,y:20,w:20,h:20},severity,source:{detector:"missing-native-component-quality"}});
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"missing-refiner-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,"source.png");fs.writeFileSync(source,"source");
  const deck={pages:[{textBoxes:[],images:[],shapes:[]}]};
  const quality={passed:false,checks:[{name:"quality-rendered",passed:true}],metrics:{"pixel-diff-ratio":0.2},componentWorst:[region(20,8),region(80,4)]};
  const candidateDeck=structuredClone(deck);candidateDeck.pages[0].shapes=[20,80].map((x,index)=>({id:index?"bad":"good",type:"freeform",box:{x,y:20,w:20,h:20},source:{detector:"missing-native-blob-freeform-component",sourceMissingNativeComponentIds:[`missing-${x}`]}}));
  const builds=[],seen=[];
  const dependencies={qualityRendered:q=>q?.checks?.some(c=>c.name==="quality-rendered"&&c.passed),
    fitDeckMissingNativeVisualAtomShapes:()=>({deck:structuredClone(candidateDeck),addedShapes:2,candidateTargets:2,candidateAtoms:2}),
    nativeOnlyMissingNativeTargetBudgets:()=>[2],validateDeckIr:()=>{},changedComponentKeysFromFit:()=>[],
    nativeOnlyRefinementImproves:({baselineQuality,candidateQuality})=>candidateQuality.metrics["pixel-diff-ratio"]<baselineQuality.metrics["pixel-diff-ratio"],
    targetMissingNativeComponentQualityImproves:()=>false,nativeOnlyMissingNativeLinesDoesNotRegress:()=>true,nativeOnlySemanticChecksPass:()=>true};
  const request={nativeOnlyCandidate:{deck,quality,renderedImages:[source]},root,sourceImages:[source],isCancellationRequested:async()=>false,
    runBuild:async({deckFile,pptxFile})=>{const d=JSON.parse(fs.readFileSync(deckFile));builds.push(d);fs.writeFileSync(pptxFile,"pptx");},
    rawImageQualityVerifier:async input=>{seen.push(input);input.collectRenderedPages([source]);return {passed:false,checks:[{name:"quality-rendered",passed:true}],metrics:{"pixel-diff-ratio":seen.length===1?0.15:0.1},
      componentReferenceMetrics:[region(20,2),region(80,seen.length===1?6:4)]};}};
  return {root,deck,request,dependencies,builds,seen};
}
test("missing native refinement rebuilds and re-renders a local rollback before any acceptance",async t=>{
  const f=setup(t),before=structuredClone(f.request.nativeOnlyCandidate),v=await create(f.dependencies)(f.request);
  assert.equal(f.builds.length,2);assert.equal(f.seen.length,2);
  assert.deepEqual(f.builds[0].pages[0].shapes.map(s=>s.id),["good","bad"]);
  assert.deepEqual(f.builds[1].pages[0].shapes.map(s=>s.id),["good"]);
  assert.deepEqual(v.deck,f.builds[1]);assert.equal(v.quality.passed,false);
  assert.equal(v.quality.metrics["native-only-missing-native-rolled-back-shapes"],1);
  assert.equal(v.quality.metrics["native-only-missing-native-lines-shapes"],1);
  assert.deepEqual(f.request.nativeOnlyCandidate,before);
  assert.equal(f.seen[0].referenceQuality.componentReferenceMetrics,undefined);
});
test("a rejected native diagnostic without deck or quality is preserved without further fitting",async t=>{
  const f=setup(t),rejected={rejected:true,rejectionCode:4};
  assert.equal(await create(f.dependencies)({...f.request,nativeOnlyCandidate:rejected}),rejected);
  assert.equal(f.builds.length,0);assert.equal(f.seen.length,0);
});
test("all-regressed, unrendered and regressed rechecks cannot become accepted output",async t=>{
  for(const mode of ["all","unrendered","recheck"]){const f=setup(t);let calls=0;
    f.request.rawImageQualityVerifier=async input=>{calls++;input.collectRenderedPages([path.join(f.root,"source.png")]);return {passed:false,checks:[{name:"quality-rendered",passed:mode!=="unrendered"}],metrics:{"pixel-diff-ratio":0.1},
      componentReferenceMetrics:[region(20,mode==="all"||mode==="recheck"&&calls>1?9:2),region(80,6)]};};
    const v=await create(f.dependencies)(f.request);assert.deepEqual(v.deck,f.deck);
    assert.equal(v.quality.metrics["native-only-missing-native-lines-accepted"],0);
    assert.equal(fs.readdirSync(f.root).some(name=>name.endsWith(".pptx")),false);
  }
});
test("empty, invalid, hostile, cancelled and failed builds preserve the baseline and propagate failures",async t=>{
  const f=setup(t),refine=create(f.dependencies);
  assert.equal(await refine({...f.request,nativeOnlyCandidate:null}),null);
  await assert.rejects(refine(null),/invalid/i);
  let read=false;await assert.rejects(refine({...f.request,get root(){read=true;throw Error("private-content");}}));assert.equal(read,false);
  const empty=setup(t);empty.dependencies.fitDeckMissingNativeVisualAtomShapes=()=>({addedShapes:0});
  assert.equal(await create(empty.dependencies)(empty.request),empty.request.nativeOnlyCandidate);
  for(const mode of ["cancel","build","verify"]){const v=setup(t);
    if(mode==="cancel")v.request.isCancellationRequested=async()=>true;
    if(mode==="build")v.request.runBuild=async()=>{throw Error("build failed");};
    if(mode==="verify")v.request.rawImageQualityVerifier=async()=>{throw Error("render failed");};
    await assert.rejects(create(v.dependencies)(v.request));assert.deepEqual(v.request.nativeOnlyCandidate.deck,v.deck);
  }
});
test("regional candidates overlap in pairs, keep original tie order and the same target allocations",async t=>{
  const f=setup(t),template=f.dependencies.fitDeckMissingNativeVisualAtomShapes();
  const fitted=[],completed=[];let release,active=0,peak=0;
  const gate=new Promise(resolve=>{release=resolve;});
  f.dependencies.nativeOnlyMissingNativeTargetBudgets=()=>[1,2,3];
  f.dependencies.fitDeckMissingNativeVisualAtomShapes=(deck,{maximumTargets,maximumAtoms})=>{
    assert.equal(deck,f.deck);assert.equal(maximumAtoms,80);fitted.push(maximumTargets);
    return {...template,deck:{...structuredClone(template.deck),targetCount:maximumTargets}};
  };
  f.request.rawImageQualityVerifier=async input=>{
    active++;peak=Math.max(peak,active);const n=input.deck.targetCount;
    if(n===1)await gate;else if(n===2)release();
    completed.push(n);active--;input.collectRenderedPages([f.request.sourceImages[0]]);
    return {passed:false,checks:[{name:'quality-rendered',passed:true}],metrics:{'pixel-diff-ratio':.1},
      componentReferenceMetrics:[region(20,2),region(80,2)]};
  };
  const result=await create(f.dependencies)(f.request);
  assert.equal(peak,2);assert.deepEqual(completed,[2,1,3]);assert.deepEqual(fitted,[24,1,2,3]);
  assert.equal(result.deck.targetCount,1);assert.equal(result.quality.metrics['native-only-missing-native-lines-attempts'],3);
  assert.equal(result.quality.metrics['native-only-missing-native-lines-target-budget'],1);
  assert.equal(fs.readdirSync(f.root).filter(n=>n.endsWith('.pptx')).length,1);
  assert.equal(fs.readdirSync(f.root).filter(n=>n.endsWith('.json')).length,1);
});
test("failed regional render cancels and joins its sibling before cleaning artifacts and launching more work",async t=>{
  const f=setup(t),template=f.dependencies.fitDeckMissingNativeVisualAtomShapes();
  f.dependencies.nativeOnlyMissingNativeTargetBudgets=()=>[1,2,3];
  f.dependencies.fitDeckMissingNativeVisualAtomShapes=(deck,{maximumTargets})=>({...template,deck:{...structuredClone(template.deck),targetCount:maximumTargets}});
  let release,started,finished=false,settled=false;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const calls=[];
  f.request.rawImageQualityVerifier=async input=>{
    calls.push(input.deck.targetCount);
    if(input.deck.targetCount===1){await ready;throw new Error('controlled regional render failure');}
    started();await gate;
    assert.equal(fs.existsSync(input.pptxFile),true);assert.equal(await input.isCancellationRequested(),true);
    finished=true;throw new Error('editable job was cancelled');
  };
  const result=assert.rejects(create(f.dependencies)(f.request),/controlled regional render failure/).then(()=>{settled=true;});
  await ready;await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  release();await result;assert.equal(finished,true);assert.deepEqual(calls,[1,2]);
  assert.deepEqual(fs.readdirSync(f.root),['source.png']);assert.deepEqual(f.request.nativeOnlyCandidate.deck,f.deck);
});
test("candidate allocation boundary rejects duplicates, holes, excessive and accessor values",async t=>{
  let accessed=false;const hostile=[];Object.defineProperty(hostile,0,{get(){accessed=true;return 1;}});
  for(const budgets of [null,[0],[25],[1,1],Array(2),Array(25).fill(1),hostile]){
    const f=setup(t);f.dependencies.nativeOnlyMissingNativeTargetBudgets=()=>budgets;
    await assert.rejects(create(f.dependencies)(f.request),/Invalid missing native candidate budgets/);
    assert.equal(f.builds.length,0);
  }
  assert.equal(accessed,false);
});
test("an unresolved scene cannot be repaired by additive shapes and never spends render work",async t=>{
  for (const scene of [{version:1,unresolved:[{id:'node',reason:'container-perimeter'}]}, {version:1,unresolved:'invalid'}]) {
    const f=setup(t);f.deck.pages[0].source={sourceScene:scene};const original=structuredClone(f.request.nativeOnlyCandidate);
    let fits=0;f.dependencies.fitDeckMissingNativeVisualAtomShapes=()=>{fits++;throw Error('must not fit an impossible repair');};
    const result=await create(f.dependencies)(f.request);
    assert.equal(fits,0);assert.equal(f.builds.length,0);assert.equal(f.seen.length,0);
    assert.deepEqual(result.deck,original.deck);assert.equal(result.quality.passed,false);
    assert.equal(result.quality.metrics['native-only-missing-native-lines-blocked-scene'],1);
    assert.equal(result.quality.metrics['native-only-missing-native-lines-attempts'],0);
    assert.equal(result.quality.metrics['native-only-missing-native-lines-accepted'],0);
  }
});
test("scene readiness is reevaluated rather than permanently caching a blocked result",async t=>{
  const f=setup(t);f.deck.pages[0].source={sourceScene:{version:1,unresolved:[{id:'edge',reason:'relation-source-evidence'}]}};
  const fit=f.dependencies.fitDeckMissingNativeVisualAtomShapes;
  f.dependencies.fitDeckMissingNativeVisualAtomShapes=(...args)=>{
    const candidate=fit(...args);candidate.deck.pages[0].source=structuredClone(f.deck.pages[0].source);return candidate;
  };
  const refine=create(f.dependencies);await refine(f.request);assert.equal(f.builds.length,0);
  f.deck.pages[0].source.sourceScene.unresolved=[];
  await refine(f.request);assert.equal(f.builds.length,2);
});
