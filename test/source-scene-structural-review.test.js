"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {selectStructuralReviewTargets:select,readStructuralObservations:read,applyStructuralReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
function fixture(){return parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
 {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:160}},
 {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:90,h:150}},
 {id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:90,h:150}}],objects:[
 {id:'a',regionId:'left',kind:'container',box:{x:110,y:30,w:30,h:20}},
 {id:'b',regionId:'right',kind:'icon',box:{x:150,y:30,w:20,h:20}},
 {id:'c',regionId:'left',kind:'container',box:{x:10,y:60,w:20,h:20}}],
 relations:[{id:'ab',regionId:'right',fromId:'a',toId:'b',direction:'forward'}]},
 {sourceHash:'a'.repeat(64),widthPx:200,heightPx:160});}
function targets(){return select(fixture(),32).map((t,i)=>({...t,index:i+10}));}
function observations(){return [{index:10,kind:'container',confidence:.99,regionId:'region-right',box:null},
 {index:11,kind:'container',confidence:.99,regionId:'region-right',box:null}];}

test('structural correction retains executable geometry only with independent agreement',()=>{
 const p=fixture(),a=observations();a[0].nativeGeometry={kind:'cylinder',capRatio:.2};
 const out=apply(p,targets(),[a,structuredClone(a)]);assert.equal(out.plan.objects[0].nativeGeometry.kind,'cylinder');
 const b=structuredClone(a);b[0].nativeGeometry.capRatio=.3;
 const rejected=apply(p,targets(),[a,b]);assert.equal(rejected.plan.objects[0].nativeGeometry,undefined);
 assert.ok(rejected.evidence.rejected.some(r=>r.reason==='native-geometry-consensus'));
 const raw={index:10,kind:'container',confidence:.99,regionId:'region-right',box_2d:null,nativeGeometry:a[0].nativeGeometry};
 assert.equal(read({structures:[raw]},[targets()[0]],undefined)[0].nativeGeometry.kind,'cylinder');
 assert.throws(()=>read({structures:[{...raw,kind:'icon'}]},[targets()[0]],undefined),/geometry owner/u);
});
test('structural contradictions and non-container relation endpoints share bounded target capacity',()=>{
 const p=fixture(),before=JSON.stringify(p);assert.deepEqual(select(p,32).map(r=>r.objectId),['object-a','object-b']);
 assert.equal(select(p,1).length,1);assert.deepEqual(select(p,0),[]);assert.deepEqual(select(undefined,32),[]);
 assert.equal(JSON.stringify(p),before);for(const n of [-1,33,NaN,1.5])assert.throws(()=>select(p,n),RangeError);
 p.objects[0].regionId='region-right';p.objects[1].kind='container';assert.deepEqual(select(p,32),[]);
});
test('two matching independent structure observations preserve IDs, geometry, source and relation direction',()=>{
 const p=fixture(),before=JSON.stringify(p),rows=observations(),result=apply(p,targets(),[rows,structuredClone(rows)]);
 assert.equal(result.plan.objects[0].regionId,'region-right');assert.equal(result.plan.objects[1].kind,'container');
 assert.deepEqual(result.plan.objects.map(o=>o.box),p.objects.map(o=>o.box));assert.deepEqual(result.plan.relations,p.relations);
 assert.equal(result.plan.sourceHash,p.sourceHash);assert.equal(result.evidence.corrected.length,2);assert.deepEqual(result.evidence.rejected,[]);
 assert.equal(JSON.stringify(p),before);assert.deepEqual(apply(p,[],[[],[]]).plan,p);
});
test('low confidence, disagreement, absent region, escaping geometry and broken region trees grant no correction',()=>{
 for(const change of [r=>r.confidence=.89,r=>r.kind='unknown',r=>r.kind='icon',r=>r.regionId=null,r=>r.regionId='region-missing',
 r=>r.regionId='region-left',r=>r.box={x:105,y:25,w:50,h:30}]){
  const p=fixture(),rows=observations(),other=structuredClone(rows);change(other[0]);const result=apply(p,targets(),[rows,other]);
  assert.deepEqual(result.plan.objects[0],p.objects[0]);assert.ok(result.evidence.rejected.some(r=>r.id==='object-a'));
 }
 for(const change of [p=>p.regions[2].parentId='region-right',p=>p.regions[2].parentId='region-missing',p=>p.regions[0].box.w=80]){
  const p=fixture(),t=targets(),rows=observations();change(p);assert.deepEqual(apply(p,t,[rows,rows]).plan.objects,p.objects);
 }
 assert.throws(()=>apply(fixture(),targets(),[observations()]),/consensus/);
});
test('observed boxes need matching envelopes, the original unit center and a legal source region',()=>{
 const p=fixture(),t=targets(),a=observations(),b=observations();a[0].box={x:108,y:28,w:34,h:24};b[0].box={x:108.2,y:28,w:34,h:24};
 assert.deepEqual(apply(p,t,[a,b]).plan.objects[0].box,a[0].box);
 b[0].box={x:100,y:80,w:34,h:24};assert.deepEqual(apply(p,t,[a,b]).plan.objects[0],p.objects[0]);
 a[0].box=b[0].box={x:110,y:30,w:4,h:4};assert.deepEqual(apply(p,t,[a,b]).plan.objects[0],p.objects[0]);
});
test('matching ancestor proposals retain a legal concrete owner and nesting link',()=>{
 const p=fixture();p.objects[0].regionId='region-right';p.objects[0].parentObjectId='object-b';
 p.regions.push({id:'region-band',parentId:'region-root',kind:'section',box:{x:100,y:0,w:100,h:160}});
 p.regions[2].parentId='region-band';
 for(const owner of ['region-band','region-root']){
  const t=[{index:10,objectId:'object-a',box:p.objects[0].box}],rows=[{index:10,kind:'container',confidence:1,regionId:owner,box:null}];
  const before=JSON.stringify(p),result=apply(p,t,[rows,structuredClone(rows)]);
  assert.deepEqual(result.plan,p);assert.equal(JSON.stringify(p),before);
  assert.deepEqual(result.evidence.corrected,[]);
  assert.deepEqual(result.evidence.rejected,[{id:'object-a',reason:'owner-ancestor-regression'}]);
 }
});
test('invalid previous containment still permits source-proven root correction',()=>{
 const p=fixture(),t=[{index:10,objectId:'object-a',box:p.objects[0].box}],rows=[{index:10,kind:'container',confidence:1,regionId:'region-root',box:null}];
 const result=apply(p,t,[rows,rows]);assert.equal(result.plan.objects[0].regionId,'region-root');
 assert.equal(result.evidence.corrected.length,1);assert.deepEqual(result.evidence.rejected,[]);
});
test('observed geometry extending outside a previous owner does not create an ancestry contradiction',()=>{
 const p=fixture();p.objects[0].regionId='region-right';
 const t=[{index:10,objectId:'object-a',box:p.objects[0].box}],rows=[{index:10,kind:'container',confidence:1,regionId:'region-root',box:{x:95,y:20,w:100,h:60}}];
 const result=apply(p,t,[rows,rows]);assert.equal(result.plan.objects[0].regionId,'region-root');
 assert.deepEqual(result.evidence.rejected,[]);
});
test('overlapping semantic regions do not infer ownership from area alone',()=>{
 const p=fixture();p.objects[0].regionId='region-right';
 p.regions.push({id:'region-overlay',parentId:'region-root',kind:'diagram',box:{x:100,y:0,w:100,h:160}});
 const t=[{index:10,objectId:'object-a',box:p.objects[0].box}],rows=[{index:10,kind:'container',confidence:1,regionId:'region-overlay',box:null}];
 const result=apply(p,t,[rows,rows]);assert.equal(result.plan.objects[0].regionId,'region-overlay');
 assert.deepEqual(result.evidence.rejected,[]);
});
test('broken or cyclic previous ancestry is not evidence for a narrower owner',()=>{
 for(const parentId of ['region-missing','region-right']){
  const p=fixture();p.objects[0].regionId='region-right';p.regions[2].parentId=parentId;
  const t=[{index:10,objectId:'object-a',box:p.objects[0].box}],rows=[{index:10,kind:'container',confidence:1,regionId:'region-root',box:null}];
  const result=apply(p,t,[rows,rows]);assert.equal(result.plan.objects[0].regionId,'region-root');
  assert.deepEqual(result.evidence.rejected,[]);
 }
});
const frame={width:100,height:100,sourceTargets:[{index:10,cropBox:{x:100,y:20,w:40,h:40}}],sheetTargets:[{index:10,cropBox:{x:10,y:10,w:40,h:40}}]};
const raw={index:10,kind:'container',confidence:.99,regionId:'region-right',box_2d:[200,200,400,400]};
test('sheet-frame structural geometry maps to exact source coordinates without gutter or neighboring authority',()=>{
 const result=read({structures:[raw]},[targets()[0]],frame);assert.deepEqual(result[0].box,{x:110,y:30,w:20,h:20});
 assert.equal(read({structures:[{...raw,box_2d:null}]},[targets()[0]],frame)[0].box,null);
 const outside=read({structures:[{...raw,box_2d:[0,0,900,900]}]},[targets()[0]],frame)[0];assert.equal(outside.rejection,'source-window');
 assert.equal(outside.box,null);assert.equal(apply(fixture(),targets().slice(0,1),[[outside],[outside]]).evidence.corrected.length,0);
 assert.deepEqual(read({},[],undefined),[]);
});
test('malformed, missing, extreme, proxy and accessor observations fail safely without provider content',()=>{
 for(const bad of [null,[],{structures:[]},{structures:[raw,raw]},{structures:new Array(1)},{structures:new Proxy([raw],{})}])assert.throws(()=>read(bad,[targets()[0]],frame),TypeError);
 for(const change of [r=>r.index=99,r=>r.kind='delete',r=>r.confidence=Infinity,r=>r.regionId='private token',
 r=>r.box_2d=[200,200,400,1001],r=>r.box_2d=[200,200,400.5,400],r=>r.extra=true]){
  const r=structuredClone(raw);change(r);assert.throws(()=>read({structures:[r]},[targets()[0]],frame),TypeError);
 }
 let calls=0;const hostile={get structures(){calls++;throw Error('private-token');}};
 assert.throws(()=>read(hostile,[targets()[0]],frame),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 const row={...raw};Object.defineProperty(row,'kind',{get(){calls++;throw Error('private-token');}});
 assert.throws(()=>read({structures:[row]},[targets()[0]],frame),TypeError);assert.equal(calls,0);
});

test('reversed or empty rectangles reject only that target and never fall back to its seed',()=>{
 const t=targets(),p=fixture(),before=structuredClone(p);
 const f={...frame,sourceTargets:[...frame.sourceTargets,{index:11,cropBox:{x:140,y:20,w:40,h:40}}],
  sheetTargets:[...frame.sheetTargets,{index:11,cropBox:{x:60,y:10,w:40,h:40}}]};
 for(const box_2d of [[400,200,200,400],[200,400,400,200],[200,200,200,400],[200,200,400,200]]){
  const bad={...raw,box_2d},good={...raw,index:11,box_2d:null};
  const a=read({structures:[bad,good]},t,f),b=read({structures:[{...raw,box_2d:null},good]},t,f);
  assert.equal(a[0].rejection,'geometry-contract');assert.equal(a[0].box,null);
  const out=apply(p,t,[a,b]);
  assert.deepEqual(out.plan.objects[0],p.objects[0]);
  assert.equal(out.plan.objects[1].kind,'container');
  assert.ok(out.evidence.rejected.some(r=>r.id==='object-a'&&r.reason==='geometry-contract'));
  assert.deepEqual(p,before);
 }
});
