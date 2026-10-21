'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {primitiveImage,paintPrimitive}=require('./helpers/scene-primitive-program-fixture.cjs');
const {proposeSourceCylinderTopology:propose}=require('../packages/slideclone-core/source-scene-source-topology');
const {admitSourceMeasuredScenePlan:admit,admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {withSceneCompilationSession:open}=require('../packages/slideclone-core/source-scene-compilation-session');
const {compileSceneCageProgram:compile}=require('../packages/slideclone-core/source-scene-cage-program');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
function fixture(seams=[.4,.7]){
 const f=primitiveImage('cylinder');f.image.rgba.fill(255);paintPrimitive(f.image,{...f.recipe,seams});
 return {image:f.image,object:{id:'object-unit',regionId:'region-root',kind:'container',box:f.box,nativeGeometry:f.nativeGeometry},textMasks:[],budget:{used:0}};
}
function wire(f){return {coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
 objects:[{...f.object,id:'unit',regionId:'root'}],relations:[]};}
function source(f){return {sourceHash:'a'.repeat(64),widthPx:f.image.width,heightPx:f.image.height};}
test('zero, one and two source dividers propose complete topology with charged evidence and no authority',()=>{
 for(const seams of [[],[.5],[.4,.7]]){const f=fixture(seams),before=Buffer.from(f.image.rgba),r=propose(f);
  assert.equal(r.failure,null,JSON.stringify(r));assert.equal(r.proposal.nativeGeometry.seams.length,seams.length);
  assert.equal(r.observedFaces,seams.length+2);assert.equal(r.authorityGranted,false);assert(f.budget.used>0);
  assert.deepEqual(f.image.rgba,before);assert.equal(r.parentPaint,undefined);
 }
});
test('initial source admission preserves the original hypothesis and shares its charge with real compilation',()=>{
 const f=fixture([.5]),result=admit(wire(f),source(f),{image:f.image,textMasks:[]});
 const original=admitSourceScenePlan(wire(f),source(f)),p=result.plan;
 assert.equal(original.objects[0].nativeGeometry.seams.length,2);assert.equal(p.objects[0].nativeGeometry.seams.length,1);
 assert.equal(result.sourceTopology.observations[0].originalGeometry.seams.length,2);
 assert.equal(result.sourceTopology.observations[0].observedFaces,3);
 assert.deepEqual(p.objectBatches.batches.map(b=>b.members.length),original.objectBatches.batches.map(b=>b.members.length));
 const next=open({image:f.image,sourceHash:p.sourceHash,session:result.compilationSession},s=>{
  const initial=s.budget.used;assert.equal(initial,result.sourceTopology.sourceScanPixels);
  const r=compile({image:s.image,object:p.objects[0],textMasks:[],budget:s.budget,slideSize:{widthPt:f.image.width,heightPt:f.image.height}});
  assert.equal(r.failure,null,JSON.stringify(r));assert(s.budget.used>=initial&&s.budget.used<=4000000);return r;
 });assert(next.result.parentPaint);assert.throws(()=>admit(p,source(f),{image:f.image,textMasks:[]}),/already admitted/);
});
test('blank, OCR intersection, unknown alpha and exhausted budget keep the hypothesis unresolved',()=>{
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(propose(blank).failure,'cage-source-isolation');
 const masked=fixture();masked.textMasks=[{x:40,y:40,w:8,h:8}];assert.equal(propose(masked).failure,'cage-source-text');
 const alpha=fixture();alpha.image.rgba[(60*alpha.image.width+65)*4+3]=0;assert.equal(propose(alpha).failure,'cage-source-alpha');
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(propose(exhausted).failure,'cage-source-budget');assert.equal(exhausted.budget.used,4000000);
 const r=admit(wire(blank),source(blank),{image:blank.image,textMasks:[]});assert.equal(r.plan.objects[0].nativeGeometry.seams.length,2);
 assert.equal(r.sourceTopology.observations[0].failure,'cage-source-isolation');
});
test('missing cap and source glyphs cannot become a new smaller complete topology',()=>{
 const f=fixture();f.image.rgba.fill(255);paintPrimitive(f.image,{...primitiveImage().recipe},{missingCap:true});assert.notEqual(propose(f).failure,null);
 const small=fixture();small.object.box={x:30,y:30,w:1,h:90};assert.notEqual(propose(small).failure,null);
});
test('unsafe, illegal and extreme source inputs reject without invoking getters or conversion',()=>{
 const f=fixture();let calls=0;const getter={};Object.defineProperty(getter,'object',{get(){calls++;throw Error('private');}});
 for(const value of [null,{},getter,new Proxy(f,{}),{...f,object:new Proxy(f.object,{})},
  {...f,object:{...f.object,id:{toString(){calls++;throw Error('private');}}}},
  {...f,object:{...f.object,box:{x:0,y:0,w:Infinity,h:1}}},
  {...f,textMasks:[{get x(){calls++;throw Error('private');},y:0,w:1,h:1}]},
  {...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))}},
  {...f,budget:{used:-1}}])assert.throws(()=>propose(value),TypeError);
 assert.equal(calls,0);
 const large=fixture();large.image={width:1100,height:600,rgba:Buffer.alloc(1100*600*4,255)};large.object.box={x:20,y:20,w:1000,h:500};
 assert.equal(propose(large).failure,'cage-native-capacity');assert.equal(large.budget.used,0);
});
test('empty initial proposals still validate all controls without executing unsafe accessors',()=>{
 const f=fixture();let calls=0;
 const r=admit(undefined,source(f),{image:f.image,textMasks:[]});assert.equal(r.plan,undefined);assert.equal(r.sourceTopology.sourceScanPixels,0);
 for(const controls of [null,{},new Proxy({image:f.image,textMasks:[]},{}),{image:f.image,textMasks:null},
  {image:f.image,get textMasks(){calls++;throw Error('private');}},
  {image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))},textMasks:[]},
  {image:f.image,textMasks:[{x:99999,y:0,w:1,h:1}]}])assert.throws(()=>admit(undefined,source(f),controls),TypeError);
 assert.equal(calls,0);
});
test('actual optional planner proposes before its first ledger and carries the source budget through preflight',async t=>{
 const f=fixture([.5]),root=fs.mkdtempSync(path.join(os.tmpdir(),'source-topology-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 let count=0,session;
 const result=await createSourceScenePlanner({sourceTopology:true,recognize:async request=>{
  if(++count===1)return {scene:wire(f),reviews:[],missingText:[]};
  const targets=request.localTargets;
  return {reviews:[],recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   inventories:(targets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   structures:(targets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,box_2d:null})),
   regionInventories:(targets.regionInventories??[]).map(index=>({index,units:[],relations:[]}))};
 }} )({root,sourceFile,dimensions:{widthPx:f.image.width,heightPx:f.image.height},ocr:{lines:[]},isCancellationRequested:async()=>false,
  preflightSourceScene:(plan,token)=>{assert(token);session=token;assert.equal(plan.objects[0].nativeGeometry.seams.length,1);
   const opened=open({image:f.image,sourceHash:plan.sourceHash,session:token},s=>s.budget.used);assert(opened.result>0);
   return require('../packages/slideclone-core/source-scene-compiler').preflightSourceScene({root,sourceFile,plan,
    page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:f.image.width,heightPt:f.image.height},compilationSession:token});}});
 assert.equal(result.compilationSession,session);assert.equal(result.plan.objects[0].nativeGeometry.seams.length,1);
 const directory=fs.readdirSync(root).find(name=>name.startsWith('scene-review-'));
 const evidence=JSON.parse(fs.readFileSync(path.join(root,directory,'source-topology.json'),'utf8'));
 assert.equal(evidence.authorityGranted,false);assert.equal(evidence.observations[0].observedFaces,3);
 assert.throws(()=>createSourceScenePlanner({recognize:async()=>null,sourceTopology:'yes'}),TypeError);
});
