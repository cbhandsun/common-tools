"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-topology-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:200,height:100,rgba:Buffer.alloc(80000,255)});
 const scene={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:95,h:100}},
  {id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:100,h:100}}],objects:[
  ...['a','b','c'].map((id,i)=>({id,regionId:'left',kind:'container',pictorialContent:'absent',box:{x:5+i*30,y:20,w:20,h:20}})),
  ...['u','v','w'].map((id,i)=>({id,regionId:'right',kind:'container',pictorialContent:'absent',box:{x:105+i*30,y:20,w:20,h:20}})),
  ...Array.from({length:58},(_,i)=>({id:'icon-'+i,regionId:'root',kind:'icon',box:{x:1,y:90,w:1,h:1}}))],relations:[
  {id:'ab',regionId:'left',fromId:'u',toId:'v',direction:'forward'},
  {id:'bc',regionId:'left',fromId:'v',toId:'w',direction:'forward'}]};
 return {root,sourceFile,scene,input:{root,sourceFile,dimensions:{widthPx:200,heightPx:100},ocr:{lines:[]},isCancellationRequested:async()=>false}};
}

test('global physical region endpoints retain icons and consume no topology repair targets',async t=>{
 const f=fixture(t);let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
  {id:'left',parentId:'root',kind:'card',box:{x:10,y:10,w:70,h:70}},
  {id:'right',parentId:'root',kind:'container',box:{x:120,y:10,w:70,h:70}}],
 objects:[{id:'a',regionId:'left',kind:'icon',box:{x:25,y:25,w:20,h:20}},
  {id:'b',regionId:'right',kind:'icon',box:{x:135,y:25,w:20,h:20}}],
 relations:[{id:'edge',regionId:'root',fromId:'left',toId:'right',direction:'both',shaftBox:{x:80,y:38,w:40,h:14}}],
 inventory:[['root',0,0,1],['left',0,1,0],['right',0,1,0]]};
 const result=await createSourceScenePlanner({recognize:async request=>{
  calls++;
  if(request.task!=='structure'){
   assert.equal(request.localTargets.relations?.length??0,0,'genuine icon checks do not require endpoint rebinding');
   return {reviews:[],recoveredText:(request.localTargets.missing??[]).map(index=>({index,text:null,confidence:0})),
    structures:(request.localTargets.structures??[]).map(index=>({index,kind:'unknown',confidence:0}))};
  }
  assert.equal(calls,1);
  assert.match(request.prompt,/container or standalone icon object IDs, or card\/container region IDs/u);
  assert.match(request.prompt,/compiler proves the actual contacted native member/u);
  assert.match(request.prompt,/BOTH full endpoint bodies and shaftBox/u);
  assert.match(request.prompt,/A two-headed shaft is ONE relation/u);
  return {scene,reviews:[],missingText:[]};
 }})(f.input);
 assert.equal(calls,3);assert.deepEqual(result.plan.objects.map(o=>o.kind),['icon','icon']);
 assert.deepEqual(result.plan.relations.map(r=>[r.fromId,r.toId,r.direction]),[['region-left','region-right','both']]);
 assert.equal(result.evidence.topologyReview.proposed,0);assert.equal(result.plan.admission.complete,true);
});
test('two original local calls rebind wrong-card references at full object capacity; source-less relations still fail compilation',async t=>{
 const f=fixture(t);let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene:f.scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.relations.length,2);assert.match(request.prompt,/relationsByIndex/);assert.match(request.prompt,/"object-c"/);
  assert.ok(Object.values(request.localTargets).flat().length<=32);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   inventories:(request.localTargets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   structures:(request.localTargets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   relations:request.localTargets.relations.map((index,i)=>({index,fromId:i?'object-b':'object-a',toId:i?'object-c':'object-b',direction:'forward',confidence:.99}))};
 }})(f.input);
 assert.equal(calls,3);assert.equal(result.plan.objects.length,64);assert.equal(result.plan.relations.length,2);
 assert.equal(result.evidence.topologyReview.corrected.length,2);assert.ok(result.evidence.reviewAllocation.retainedTargets<=32);
 const dir=fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-'));
 assert.ok(JSON.parse(fs.readFileSync(path.join(f.root,dir,'evidence.json'))).cropPixels<=4000000);
 const page={shapes:[],images:[],textBoxes:[]},compiled=compileSourceScene({root:f.root,sourceFile:f.sourceFile,page,plan:result.plan,slideSize:{widthPt:200,heightPt:100}});
 assert.equal(compiled.evidence.resolvedRelations,0);assert.equal(compiled.page.shapes.some(s=>s.source?.nativeComponentRole==='relationship'),false);
 assert.equal(compiled.evidence.unresolved.filter(r=>r.reason==='relation-source-evidence').length,2);
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
});
test('disagreement preserves erroneous references and emits a scope failure rather than deleting the relation',async t=>{
 const f=fixture(t);let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene:f.scene,reviews:[],missingText:[]};
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   inventories:(request.localTargets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   structures:(request.localTargets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   relations:request.localTargets.relations.map((index,i)=>({index,fromId:i?'object-b':'object-a',toId:i?'object-c':'object-b',direction:calls===2?'forward':'backward',confidence:.99}))};
 }})(f.input);
 assert.equal(calls,3);assert.equal(result.evidence.topologyReview.corrected.length,0);assert.equal(result.evidence.topologyReview.rejected.length,2);
 assert.deepEqual(result.plan.relations.map(r=>r.fromId),['object-u','object-v']);
 const compiled=compileSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan:result.plan,slideSize:{widthPt:200,heightPt:100}});
 assert.equal(compiled.evidence.unresolved.filter(r=>r.detailCode==='relation-scope').length,2);
});
test('required relation crops cannot silently exceed or discard the unchanged shared pixel budget',async t=>{
 const f=fixture(t);let calls=0;
 writePng(f.sourceFile,{width:3000,height:2000,rgba:Buffer.alloc(24000000,255)});
 f.input.dimensions={widthPx:3000,heightPx:2000};
 const scene={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:3000,h:2000}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:2800,h:2000}}],objects:[
  {id:'a',regionId:'left',kind:'container',box:{x:0,y:0,w:100,h:100}},
  {id:'b',regionId:'left',kind:'container',box:{x:2700,y:1900,w:100,h:100}},
  {id:'u',regionId:'root',kind:'container',box:{x:2900,y:0,w:100,h:100}},
  {id:'v',regionId:'root',kind:'container',box:{x:2900,y:200,w:100,h:100}}],relations:[{id:'ab',regionId:'left',fromId:'u',toId:'v',direction:'forward'}]};
 await assert.rejects(createSourceScenePlanner({recognize:async()=>{calls++;return {scene,reviews:[],missingText:[]};}})(f.input),/pixel budget/);
 assert.equal(calls,1);
});
