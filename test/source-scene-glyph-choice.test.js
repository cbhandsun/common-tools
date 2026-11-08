'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneGlyphChoiceLedger:create,acquireSceneGlyphChoiceCells:acquire,stageSceneGlyphChoice:stage,commitSceneGlyphChoice:commit}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-choice');
const owner=n=>({owned:new Uint8Array(n),count:0});

test('provisional candidates release new rights and selected candidates commit their actual union',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(6);
 assert.equal(acquire(ledger,body,Uint8Array.from([1,0,0,0,0,0])),true);
 const first=stage(ledger,()=>{assert.equal(acquire(ledger,body,Uint8Array.from([1,1,1,0,0,0])),true);assert.equal(evidence.glyphOwnedPixels,3);return 'first';});
 assert.equal(first.value,'first');assert.equal(evidence.glyphOwnedPixels,1);assert.equal(body.count,1);
 const second=stage(ledger,()=>{acquire(ledger,body,Uint8Array.from([0,0,1,1,0,0]));return 'second';});
 assert.equal(commit(ledger,second.receipt),true);assert.equal(evidence.glyphOwnedPixels,3);
 assert.equal(commit(ledger,first.receipt),true);assert.equal(evidence.glyphOwnedPixels,4);assert.equal(body.count,4);
 assert.deepEqual([...body.owned],[1,1,1,1,0,0]);assert.throws(()=>commit(ledger,first.receipt),TypeError);
});

test('failure and thrown source predicates release ownership but retain previously selected cells',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),body=owner(3),sourceBudget={used:10};
 acquire(ledger,body,Uint8Array.from([1,0,0]));
 assert.throws(()=>stage(ledger,()=>{sourceBudget.used+=7;acquire(ledger,body,Uint8Array.from([1,1,0]));throw Error('measurement failed');}),/measurement failed/);
 assert.equal(evidence.glyphOwnedPixels,1);assert.equal(sourceBudget.used,17);assert.deepEqual([...body.owned],[1,0,0]);
 const empty=stage(ledger,()=>null);assert.equal(empty.value,null);assert.equal(commit(ledger,empty.receipt),true);
 assert.throws(()=>stage(ledger,()=>stage(ledger,()=>null)),TypeError);assert.equal(evidence.glyphOwnedPixels,1);
 assert.throws(()=>stage(ledger,()=>Promise.resolve(null)),TypeError);assert.equal(evidence.glyphOwnedPixels,1);
});

test('the unchanged shared ceiling is atomic for staging and later conflicting selection',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),base=owner(100000),newBody=owner(3);
 const initial=new Uint8Array(100000);initial.fill(1,0,99999);assert.equal(acquire(ledger,base,initial),true);
 const candidate=stage(ledger,()=>acquire(ledger,newBody,Uint8Array.from([1,0,0])));
 assert.equal(candidate.value,true);assert.equal(evidence.glyphOwnedPixels,99999);
 assert.equal(acquire(ledger,newBody,Uint8Array.from([0,1,1])),false);assert.equal(newBody.count,0);
 const last=new Uint8Array(100000);last[99999]=1;assert.equal(acquire(ledger,base,last),true);
 assert.equal(commit(ledger,candidate.receipt),false);assert.equal(evidence.glyphOwnedPixels,100000);assert.equal(newBody.count,0);
});

test('unknown receipts and hostile controls cannot invoke accessors or cross ownership ledgers',()=>{
 const evidence={glyphOwnedPixels:0},ledger=create(evidence),foreign=create({glyphOwnedPixels:0}),body=owner(2);let calls=0;
 const getter={get owned(){calls++;throw Error('private-data');},count:0};
 for(const invalid of [null,{},new Proxy({},{}),getter])assert.throws(()=>acquire(ledger,invalid,new Uint8Array(2)),TypeError);
 assert.throws(()=>acquire(ledger,body,new Proxy(new Uint8Array(2),{})),TypeError);
 assert.throws(()=>acquire(ledger,body,Uint8Array.from([1,2])),TypeError);
 const getterCells=new Uint8Array(2);Object.defineProperty(getterCells,'length',{get(){calls++;throw Error('private-data');}});
 assert.throws(()=>acquire(ledger,body,getterCells),TypeError);
 assert.throws(()=>acquire(ledger,body,new Uint8Array(new SharedArrayBuffer(2))),TypeError);
 assert.throws(()=>acquire(ledger,{owned:new Uint8Array(2),count:1},new Uint8Array(2)),TypeError);
 assert.throws(()=>acquire(ledger,owner(262145),new Uint8Array(262145)),TypeError);
 const choice=stage(ledger,()=>{acquire(ledger,body,Uint8Array.from([1,1]));return 0;});
 for(const receipt of [null,{},new Proxy(choice.receipt,{}),structuredClone(choice.receipt)])assert.throws(()=>commit(ledger,receipt),TypeError);
 assert.throws(()=>commit(foreign,choice.receipt),TypeError);assert.equal(evidence.glyphOwnedPixels,0);assert.equal(calls,0);
 assert.equal(commit(ledger,choice.receipt),true);assert.equal(evidence.glyphOwnedPixels,2);
});

test('source glyph candidates cache observation without inheriting unselected ownership',()=>{
 const {createSceneGlyphOcclusion,sceneFillGlyphBridge:bridge,sceneGlyphOcclusionEvidence:report,stageSceneGlyphOwnership,commitSceneGlyphOwnership}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const image={width:120,height:90,rgba:Buffer.alloc(120*90*4,255)},budget={used:0};
 for(let y=35;y<50;y++)for(let x=50;x<54;x++)image.rgba.set([0,0,0,255],(y*120+x)*4);
 const token=createSceneGlyphOcclusion(image,[{text:'I',box:{x:40,y:30,w:30,h:25},font:{color:'#000000'}}],{widthPt:120,heightPt:90},budget);
 const query=()=>bridge(token,image,budget,{x:40,y:30,w:30,h:25},[255,255,255]);
 const candidate=stageSceneGlyphOwnership(token,query);assert.equal(candidate.value.size,60);assert.equal(report(token).glyphOwnedPixels,0);
 const scan=budget.used;assert.ok(scan>0);
 const replacement=stageSceneGlyphOwnership(token,query);assert.equal(replacement.value.size,60);assert.equal(report(token).glyphOwnedPixels,0);assert.equal(budget.used,scan);
 assert.equal(commitSceneGlyphOwnership(token,replacement.receipt),true);assert.equal(report(token).glyphOwnedPixels,60);
 assert.equal(commitSceneGlyphOwnership(token,candidate.receipt),true);assert.equal(report(token).glyphOwnedPixels,60);assert.equal(budget.used,scan);
 assert.throws(()=>stageSceneGlyphOwnership({},query),TypeError);
 assert.throws(()=>commitSceneGlyphOwnership(token,{}),TypeError);
 const preflight=stageSceneGlyphOwnership(undefined,()=>null);assert.equal(preflight.value,null);assert.equal(commitSceneGlyphOwnership(undefined,preflight.receipt),true);
});

test('cached icon footprints reacquire their complete population after a discarded choice',()=>{
 const {createSceneGlyphOcclusion,sceneIconTextFootprint:footprint,sceneGlyphOcclusionEvidence:report,stageSceneGlyphOwnership:measure,commitSceneGlyphOwnership:select}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const image={width:120,height:90,rgba:Buffer.alloc(120*90*4,255)},budget={used:0},box={x:40,y:30,w:30,h:25};
 for(let y=35;y<50;y++)for(let x=50;x<54;x++)image.rgba.set([0,0,0,255],(y*120+x)*4);
 const token=createSceneGlyphOcclusion(image,[{text:'I',box,font:{color:'#000000'}}],{widthPt:120,heightPt:90},budget);
 const first=measure(token,()=>footprint(token,image,budget,box));assert.ok(first.value);assert.equal(report(token).glyphOwnedPixels,0);
 const scan=budget.used,next=measure(token,()=>footprint(token,image,budget,box));assert.ok(next.value);assert.equal(report(token).glyphOwnedPixels,0);
 assert.equal(budget.used,scan);assert.equal(select(token,next.receipt),true);assert.equal(report(token).glyphOwnedPixels,60);
});

test('a rejected complete container leaves observation fees but no permanent glyph allocation',()=>{
 const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence:report}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const {measureSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-container');
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},budget={used:0},box={x:30,y:30,w:40,h:40};
 for(let y=20;y<80;y++)for(let x=20;x<80;x++)if((x-49.5)**2+(y-49.5)**2<900)image.rgba.set([0,130,70,255],(y*100+x)*4);
 for(let y=30;y<70;y++)for(let x=30;x<70;x++)if(x<41||x>=59||y>=44&&y<56)image.rgba.set([255,255,255,255],(y*100+x)*4);
 for(let y=0;y<45;y++)for(let x=30;x<41;x++)image.rgba.set([255,255,255,255],(y*100+x)*4);
 const before=Buffer.from(image.rgba),token=createSceneGlyphOcclusion(image,[{text:'H',box,font:{color:'#FFFFFF'}}],{widthPt:100,heightPt:100},budget);
 assert.equal(measureSceneContainer(image,{x:20,y:20,w:60,h:60},[box],budget,token),null);
 assert.ok(budget.used>0);assert.equal(report(token).glyphOwnedPixels,0);assert.deepEqual(image.rgba,before);
});
