"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {regenerateSourceSceneRegions:regenerate}=require('../packages/slideclone-core/source-scene-regeneration');
const {initializeSceneObjectBatches,sceneLocalObjectCapacity}=require('../packages/slideclone-core/source-scene-object-batches');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
function fixture(){
 const bytes=Buffer.from('immutable source bytes'),dimensions={widthPx:100,heightPx:100},box={x:20,y:20,w:10,h:10};
 const ref=sourceLabelIdentity(box,dimensions);
 const plan=initializeSceneObjectBatches({version:1,sourceHash:crypto.createHash('sha256').update(bytes).digest('hex'),...dimensions,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],objects:[],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:1,relations:0}],
  regionPrograms:[{regionId:'root',objects:[],relations:[],labels:[{refs:[ref],family:'SimHei'}]}]});
 return {plan,bytes,retired:[{index:0,box}],sourceLabels:[],verifySource:()=>{},isCancellationRequested:async()=>false};
}
function response(request,units=[{kind:'icon',confidence:.99,box_2d:[180,180,320,320]}]){
 const {parseLocalTargets}=require('../packages/slideclone-core/source-scene-local-response');parseLocalTargets(request.localTargets);
 return {reviews:[],recoveredText:[],regionInventories:request.localTargets.regionInventories.map(index=>({index,units,relations:[]}))};
}

test('independent regional regeneration preserves the admitted logical relation census without migrating legacy plans',async()=>{
 const {SCENE_LOGICAL_RELATION_PROMPT}=require('../packages/slideclone-core/source-scene-program-prompt');
 for(const logical of [false,true]){
  const f=fixture();if(logical)f.plan.relationObservationUnit='logical-relations-v1';let calls=0;
  const out=await regenerate({...f,recognize:async request=>{calls++;assert.equal(request.prompt.includes(SCENE_LOGICAL_RELATION_PROMPT),logical);return response(request);}});
  assert.equal(calls,2);assert.equal(out.plan.relationObservationUnit,logical?'logical-relations-v1':undefined);
  assert.deepEqual(out.plan.observedInventory,f.plan.observedInventory);
 }
});
test('classification regeneration emits missing graphic members and replaces stale references with required object obligations',async()=>{
 const f=fixture(),before=structuredClone(f.plan),bytes=Buffer.from(f.bytes);let calls=0;
 const out=await regenerate({...f,recognize:async request=>{calls++;assert.match(request.prompt,/Classification has finished/);return response(request);}});
 assert.equal(calls,2);assert.equal(out.plan.objects.length,1);assert.equal(out.plan.objects[0].kind,'icon');
 assert.deepEqual(out.plan.regionPrograms[0].objects,[out.plan.objects[0].id]);
 assert.deepEqual(out.plan.regionPrograms[0].labels,[]);assert.equal(out.evidence.resolvedLabels.length,1);
 assert.deepEqual(out.plan.observedInventory,before.observedInventory);assert.equal(sceneLocalObjectCapacity(out.plan),31);
 assert.deepEqual(f.plan,before);assert.deepEqual(f.bytes,bytes);
 // The proposal alone cannot complete the region: no emitted source receipt.
 const {completeRegionPrograms}=require('../packages/slideclone-core/source-scene-region-completion');
 const completed=completeRegionPrograms({page:{shapes:[],textBoxes:[],images:[]},plan:out.plan,slideSize:{widthPt:100,heightPt:100},preflight:false,
  objects:new Map(),relations:new Map(),interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:0,rejected:[]}});
 assert.equal(completed.evidence.completed,0);assert.ok(completed.evidence.rejected[0].missing.includes(out.plan.objects[0].id));
});
test('empty or disagreeing observations keep old binding and charge failed attempts without refunds',async()=>{
 for(const mode of ['empty','disagree','text-overlap']){
  const f=fixture();let calls=0;
  if(mode==='text-overlap')f.sourceLabels=[{text:'retain',confidence:.99,box:{x:25,y:25,w:8,h:8}}];
  const out=await regenerate({...f,recognize:async req=>response(req,mode==='empty'?[]:[{kind:'icon',confidence:.99,
   box_2d:mode==='disagree'&&++calls===2?[500,500,640,640]:[180,180,320,320]}])});
  assert.deepEqual(out.plan.regionPrograms[0].labels,f.plan.regionPrograms[0].labels,mode);
  assert.equal(out.evidence.unresolvedLabels.length,1,mode);
  if(mode==='disagree'){assert.equal(out.plan.objects.length,0);assert.equal(sceneLocalObjectCapacity(out.plan),31);}
 }
});
test('no census gap and exhausted capacity do not start another provider wave',async()=>{
 for(const mode of ['complete','legacy','exhausted']){
  const f=fixture();if(mode==='complete')f.plan.observedInventory[0].icons=0;
  if(mode==='legacy')delete f.plan.objectBatches;
  if(mode==='exhausted')f.plan.objectBatches.batches.push({id:'local-consensus',members:[],reviewed:[],rejected:32});
  const out=await regenerate({...f,recognize:async()=>{throw Error('must not call');}});
  assert.equal(out.evidence.providerCalls,0);assert.deepEqual(out.plan,f.plan);
 }
});
test('hostile input, wrong source, unsafe collections and provider pixel changes cannot enter reconstruction',async()=>{
 const f={...fixture(),recognize:async()=>{throw Error('must not call');}};let calls=0;const getter={get plan(){calls++;throw Error('private');}};
 for(const bad of [null,getter,new Proxy(f,{}),{...f,bytes:Buffer.from('wrong')},{...f,retired:new Array(1)},
  {...f,sourceLabels:[{get text(){calls++;throw Error('private');}}]},
  {...f,retired:[...f.retired,...f.retired]}])await assert.rejects(regenerate(bad));
 assert.equal(calls,0);
 await assert.rejects(regenerate({...f,recognize:async req=>{req.images[0].bytes[0]=0;return response(req);}}),/source changed/u);
 assert.deepEqual(f.bytes,Buffer.from('immutable source bytes'));
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});
test('production planner classifies and generates required graphics in the same two local calls',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-regeneration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[],relations:[],inventory:[['root',0,1,0]],programs:[{regionId:'root',objects:[],relations:[],labels:[{refs:[0]}]}]};
 let calls=0;
 const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const out=await createSourceScenePlanner({recognize:async request=>{
  calls++;if(calls===1)return {scene,reviews:[{index:0,kind:'graphic'}],missingText:[]};
  assert.ok(calls<=3,'one global and two local calls are a hard boundary');
  assert.match(request.prompt,/Classify OCR and generate complete missing regional units TOGETHER/u);
  const targets=request.localTargets;
  const dir=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')));
  const ratio=request.images[0].bytes.equals(fs.readFileSync(path.join(dir,'sheet-0.png')))?0:0.7;
  const frame=JSON.parse(fs.readFileSync(path.join(dir,`sheet-${ratio}-mapping.json`),'utf8'));
  const unit=index=>{
   const source=frame.sourceTargets.find(t=>t.index===index).cropBox,atlas=frame.sheetTargets.find(t=>t.index===index).cropBox;
   const x=atlas.x+18-source.x,y=atlas.y+18-source.y;
   const box_2d=require('../packages/slideclone-core/source-scene-coordinate-frame').sourceBox2D({x,y,w:14,h:14},frame);
   return {kind:'icon',confidence:.99,box_2d};
  };
  return {reviews:targets.reviews.map(index=>({index,kind:'graphic'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   regionInventories:(targets.regionInventories??[]).map(index=>({index,units:[unit(index)],relations:[]}))};
 }} )({root,sourceFile,dimensions:{widthPx:100,heightPx:100},isCancellationRequested:async()=>false,
  ocr:{lines:[{text:'Q',confidence:.4,box:{x:20,y:20,w:10,h:10}}]}});
 assert.equal(calls,3);assert.equal(out.ocr.lines.length,0);assert.equal(out.plan.objects.length,1,JSON.stringify({regional:out.evidence.regionalInventoryReview,allocation:out.evidence.reviewAllocation}));
 assert.deepEqual(out.plan.regionPrograms[0].labels,[]);assert.deepEqual(out.plan.regionPrograms[0].objects,[out.plan.objects[0].id]);
 const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')));
 const evidence=JSON.parse(fs.readFileSync(path.join(directory,'regeneration.json'),'utf8'));
 assert.equal(evidence.providerCalls,0);assert.equal(evidence.mode,'shared-local-consensus');assert.equal(evidence.resolvedLabels.length,1);
 assert.equal(out.evidence.regionalRegeneration.providerCalls,0);
 assert.equal(out.evidence.unresolvedReviewedGraphics.length,1); // White source remains unproven.
});

test('shared generation reconciles only unique listed graphics and preserves incomplete obligations',()=>{
 const {reconcileSceneGraphicLabels:reconcile}=require('../packages/slideclone-core/source-scene-regeneration');
 for(const mode of ['accepted','empty','ambiguous','text-collision','unlisted','wrong-owner']){
  const f=fixture(),plan=structuredClone(f.plan);
  const icon={id:'object-regional-1-0',regionId:'root',kind:'icon',box:{x:18,y:18,w:14,h:14}};
  if(mode!=='empty')plan.objects.push(icon);
  if(mode==='ambiguous')plan.objects.push({...icon,id:'object-regional-1-1'});
  if(mode==='wrong-owner')icon.regionId='other';
  if(mode!=='unlisted')plan.regionPrograms[0].objects=plan.objects.map(o=>o.id);
  const sourceLabels=mode==='text-collision'?[{text:'real label',confidence:.99,box:{x:24,y:24,w:2,h:2}}]:[];
  const before=structuredClone(plan);
  const out=reconcile({plan,retired:f.retired,sourceLabels,added:plan.objects.map(o=>o.id)});
  assert.deepEqual(plan,before);assert.equal(out.evidence.providerCalls,0);
  assert.equal(out.evidence.resolvedLabels.length,mode==='accepted'?1:0,mode);
  assert.equal(out.evidence.unresolvedLabels.length,mode==='accepted'?0:1,mode);
  if(mode!=='accepted')assert.deepEqual(out.plan.regionPrograms,plan.regionPrograms,mode);
  assert.deepEqual(out.plan.objects,plan.objects,mode);
 }
});

test('shared generation rejects unsafe, unbounded and unbound inputs without invoking accessors',()=>{
 const {reconcileSceneGraphicLabels:reconcile}=require('../packages/slideclone-core/source-scene-regeneration');
 const f=fixture(),input={plan:f.plan,retired:f.retired,sourceLabels:[],added:[]};let calls=0;
 const hostile={get plan(){calls++;throw Error('private');}};
 for(const bad of [null,hostile,new Proxy(input,{}),{...input,retired:new Array(1)},
  {...input,retired:[...f.retired,...f.retired]},{...input,added:['missing']},
  {...input,added:Array(33).fill('missing')},{...input,sourceLabels:[{get box(){calls++;throw Error('private');}}]},
  {...input,retired:[{index:0,box:{x:Infinity,y:0,w:1,h:1}}]}])assert.throws(()=>reconcile(bad));
 assert.equal(calls,0);
 const out=reconcile({...input,retired:[]});assert.deepEqual(out.plan,f.plan);assert.deepEqual(out.evidence.resolvedLabels,[]);
});
test('provider failure drains both requests and cancellation prevents dispatch',async()=>{
 const f=fixture();let finished=false,started=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
 await assert.rejects(regenerate({...f,recognize:async request=>{
  if(++started===2)release();await barrier;
  if(request.images[0].label.includes('observation 1'))throw Error('failure');
  await new Promise(resolve=>setTimeout(resolve,10));finished=true;return response(request);
 }}));
 assert.equal(started,2);assert.equal(finished,true);
 let calls=0;await assert.rejects(regenerate({...f,isCancellationRequested:async()=>true,recognize:async()=>{calls++;return {};}}),/cancelled/u);
 assert.equal(calls,0);
});
