'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneGlyphChoiceLedger:create,acquireSceneGlyphChoiceCells:acquire,stageSceneGlyphChoice:seed,
 stageSceneGlyphPortfolio:surface,commitSceneGlyphChoice:commit,sceneGlyphChoiceCost:cost}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-choice');
const owner=n=>({owned:new Uint8Array(n),count:0});
test('a complete surface includes direct proofs and selected child seeds while discarded children grant nothing',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(8);
 acquire(ledger,body,Uint8Array.from([1,0,0,0,0,0,0,0]));
 const candidate=surface(ledger,()=>{
  acquire(ledger,body,Uint8Array.from([1,1,0,0,0,0,0,0]));
  const rejected=seed(ledger,()=>acquire(ledger,body,Uint8Array.from([0,0,0,0,0,0,1,1])));
  assert.equal(rejected.value,true);assert.equal(evidence.glyphOwnedPixels,2);
  const chosen=seed(ledger,()=>acquire(ledger,body,Uint8Array.from([0,1,1,1,0,0,0,0])));
  assert.equal(commit(ledger,chosen.receipt),true);assert.equal(evidence.glyphOwnedPixels,4);return 'complete';
 });
 assert.equal(candidate.value,'complete');assert.equal(evidence.glyphOwnedPixels,1);
 assert.deepEqual([...body.owned],[1,0,0,0,0,0,0,0]);assert.equal(cost(ledger,candidate.receipt),3);
 assert.equal(commit(ledger,candidate.receipt),true);assert.equal(evidence.glyphOwnedPixels,4);
 assert.deepEqual([...body.owned],[1,1,1,1,0,0,0,0]);
 assert.throws(()=>cost(ledger,candidate.receipt),TypeError);
});
test('a failed complete surface rolls back child commits and direct claims, including exceptional failure',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(4),scan={used:0};
 acquire(ledger,body,Uint8Array.from([1,0,0,0]));
 assert.throws(()=>surface(ledger,()=>{
  scan.used+=20;const chosen=seed(ledger,()=>acquire(ledger,body,Uint8Array.from([1,1,0,0])));
  commit(ledger,chosen.receipt);acquire(ledger,body,Uint8Array.from([0,0,1,0]));throw Error('predicate-failed');
 }),/predicate-failed/);
 assert.equal(evidence.glyphOwnedPixels,1);assert.equal(body.count,1);assert.equal(scan.used,20);
 const next=surface(ledger,()=>acquire(ledger,body,Uint8Array.from([0,0,0,1])));
 assert.equal(cost(ledger,next.receipt),1);assert.equal(commit(ledger,next.receipt),true);
});
test('a child receipt cannot escape the surface whose temporary claims its measurement depended on',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(3);let escaped;
 const parent=surface(ledger,()=>{
  acquire(ledger,body,Uint8Array.from([1,0,0]));
  escaped=seed(ledger,()=>acquire(ledger,body,Uint8Array.from([1,1,0]))).receipt;
  return null;
 });
 assert.equal(evidence.glyphOwnedPixels,0);assert.throws(()=>commit(ledger,escaped),TypeError);
 assert.throws(()=>cost(ledger,escaped),TypeError);
 surface(ledger,()=>assert.throws(()=>commit(ledger,escaped),TypeError));
 assert.equal(cost(ledger,parent.receipt),1);assert.equal(evidence.glyphOwnedPixels,0);
});
test('candidate union costs adapt to other selections and final commits remain atomic at the existing ceiling',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(100000);
 const left=new Uint8Array(100000);left.fill(1,0,60000);
 const right=new Uint8Array(100000);right.fill(1,40000,99999);
 const first=surface(ledger,()=>acquire(ledger,body,left)),second=surface(ledger,()=>acquire(ledger,body,right));
 assert.equal(evidence.glyphOwnedPixels,0);assert.equal(cost(ledger,first.receipt),60000);
 assert.equal(commit(ledger,first.receipt),true);assert.equal(cost(ledger,second.receipt),39999);
 assert.equal(commit(ledger,second.receipt),true);assert.equal(evidence.glyphOwnedPixels,99999);
 const extra=owner(2),candidate=surface(ledger,()=>acquire(ledger,extra,Uint8Array.from([1,0])));
 acquire(ledger,body,Uint8Array.from([...new Uint8Array(99999),1]));
 assert.equal(cost(ledger,candidate.receipt),1);assert.equal(commit(ledger,candidate.receipt),false);
 assert.equal(extra.count,0);assert.equal(evidence.glyphOwnedPixels,100000);
});
test('hostile controls, reentrancy, asynchronous work and foreign or copied receipts stay rejected',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),foreign=create({glyphOwnedPixels:0}),body=owner(2);
 assert.throws(()=>surface(ledger,()=>surface(ledger,()=>null)),TypeError);
 assert.throws(()=>seed(ledger,()=>surface(ledger,()=>null)),TypeError);
 assert.throws(()=>surface(ledger,()=>seed(ledger,()=>seed(ledger,()=>null))),TypeError);
 assert.throws(()=>surface(ledger,()=>{acquire(ledger,body,Uint8Array.from([1,0]));return Promise.resolve(null);}),TypeError);
 assert.equal(evidence.glyphOwnedPixels,0);
 const candidate=surface(ledger,()=>acquire(ledger,body,Uint8Array.from([1,1])));let calls=0;
 const getter={get entries(){calls++;throw Error('secret');}};
 for(const receipt of [null,{},getter,new Proxy(candidate.receipt,{}),structuredClone(candidate.receipt)]){
  assert.throws(()=>cost(ledger,receipt),TypeError);assert.throws(()=>commit(ledger,receipt),TypeError);
 }
 assert.throws(()=>cost(foreign,candidate.receipt),TypeError);
 assert.throws(()=>surface(ledger,new Proxy(()=>null,{})),TypeError);assert.equal(calls,0);
 assert.equal(commit(ledger,candidate.receipt),true);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-glyph-portfolio.test.js','all'),true);
});
test('real source fill seed transactions can be staged as one complete surface without losing their observed geometry',()=>{
 const glyph=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const {measureSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-container');
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},budget={used:0},fill=[0,130,70],box={x:30,y:30,w:40,h:40};
 for(let y=20;y<80;y++)for(let x=20;x<80;x++)if((x-49.5)**2+(y-49.5)**2<900)image.rgba.set([...fill,255],(y*100+x)*4);
 for(let y=30;y<70;y++)for(let x=30;x<70;x++)if(x<41||x>=59||y>=44&&y<56)image.rgba.set([255,255,255,255],(y*100+x)*4);
 const before=Buffer.from(image.rgba),token=glyph.createSceneGlyphOcclusion(image,[{text:'H',box,font:{color:'#FFFFFF'}}],{widthPt:100,heightPt:100},budget);
 const candidate=glyph.stageSceneSurfaceOwnership(token,()=>measureSceneContainer(image,{x:20,y:20,w:60,h:60},[box],budget,token));
 assert.ok(candidate.value);assert.equal(glyph.sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 const requested=glyph.sceneSurfaceOwnershipCost(token,candidate.receipt);assert.ok(requested>0);
 assert.ok(glyph.commitSceneGlyphOwnership(token,candidate.receipt));assert.equal(glyph.sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,requested);
 assert.deepEqual(image.rgba,before);assert.ok(budget.used>0&&budget.used<=4000000);
});
