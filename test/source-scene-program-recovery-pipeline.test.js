'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {selectTopologyReviewTargets:select,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {currentSceneAdmissionRejections:active,rebindRegionProgramMembers:rebind}=require('../packages/slideclone-core/scene-plan/source-scene-region-program');
const {compileSourceScene:compile,preflightSourceScene:preflight}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {sceneRelationSlotsUsed:slots,sceneLocalRelationCapacity:localCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
const {auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');

function fixture(t,blank=false,malformedPath=false,withAlias=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-program-recovery-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},put=(x,y,c)=>image.rgba.set([...c,255],(y*200+x)*4);
 if(!blank){
  for(const x0 of [20,120])for(let y=20;y<140;y++)for(let x=x0;x<x0+60;x++)
   put(x,y,x<x0+2||x>=x0+58||y<22||y>=138?[90,40,60]:[210,230,245]);
  for(let x=80;x<120;x++)for(let y=49;y<=51;y++)put(x,y,[30,60,90]);
  for(let x=114;x<120;x++)for(let y=50-(119-x);y<=50+(119-x);y++)put(x,y,[30,60,90]);
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const source={sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:200,heightPx:180,labelRefs:[]};
 const proposal={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:180}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:95,h:180}},
  {id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:100,h:180}}],
  inventory:[['root',0,0,1],['left',1,0,0],['right',1,0,0]],objects:[
   {id:'a',regionId:'left',kind:'container',box:{x:20,y:20,w:60,h:120}},
   {id:'b',regionId:'right',kind:'container',box:{x:120,y:20,w:60,h:120}}],
  relations:[{id:'one',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:81,y:43,w:38,h:14}}],
  programs:[{regionId:'root',objects:[],relations:['one'],labels:[]},
   {regionId:'left',objects:['a'],relations:[],labels:[]},{regionId:'right',objects:['b'],relations:[],labels:[]}]};
 if(withAlias){
  proposal.regions=proposal.regions.slice(0,1);proposal.inventory=[['root',2,0,1]];
  proposal.objects=proposal.objects.map(o=>({...o,regionId:'root'}));
  proposal.objects.push({...proposal.objects[0],id:'alias',box:{...proposal.objects[0].box}});
  proposal.relations[0].regionId='root';
  proposal.programs=[{regionId:'root',objects:['a','b','alias'],relations:['one'],labels:[]}];
 }
 const corners=b=>[Math.floor(b.y*1000/180),Math.floor(b.x*1000/200),Math.ceil((b.y+b.h)*1000/180),Math.ceil((b.x+b.w)*1000/200)];
 const input=malformedPath?{...proposal,format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:proposal.regions.map(r=>[r.id,r.parentId,r.kind,corners(r.box)]),
  objects:proposal.objects.map(o=>[o.id,o.regionId,o.kind,corners(o.box),'absent']),
  relations:[['one','root','a','b','forward',corners(proposal.relations[0].shaftBox),[[405]]]]}:proposal;
 const plan=admit(input,source);
 const targets=select(plan,32).map((row,index)=>({...row,index:20+index}));
 const observations=targets.map(row=>({index:row.index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}));
 const repaired=apply(plan,targets,[observations,structuredClone(observations)]).plan;
 const request={root,sourceFile,plan:repaired,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:200,heightPt:180}};
 return {plan,repaired,request,targets,observations,proposal:input};
}

test('a malformed compact path is quarantined and two original observations recover the actual native relation and owner program',t=>{
 const {plan,repaired,request}=fixture(t,false,true);
 assert.equal(plan.admission.rejections.find(r=>r.collection==='relation').detailCode,'tuple');
 assert.equal(plan.relations.length,0);assert.equal(plan.admission.relationCandidates[0].reason,'tuple');
 assert.equal(plan.admission.relationCandidates[0].relation.visiblePath,undefined);
 const baseline=compile({...request,plan});assert.equal(baseline.evidence.resolvedRelations,0);assert.equal(baseline.evidence.regionPrograms.completed,2);
 assert.deepEqual(active(repaired),[]);assert.equal(slots(repaired),1);assert.equal(localCapacity(repaired),23);
 assert.equal(repaired.admission.history.relations[0].detailCode,'tuple');
 const out=compile(request);assert.equal(out.evidence.resolvedRelations,1);assert.equal(out.evidence.regionPrograms.completed,3);
 assert.deepEqual(out.evidence.unresolved,[]);assert.deepEqual(audit(out.evidence.observedInventory,out.page.shapes,out.page.images,repaired.sourceHash),[]);
 assert.equal(out.page.images.length,0);assert(out.evidence.sourceScanPixels<=4000000);
 const saved=JSON.parse(JSON.stringify(repaired));assert.equal(compile({...request,plan:saved}).evidence.resolvedRelations,1);
 const blank=fixture(t,true,true),denied=compile(blank.request);assert.equal(denied.evidence.resolvedRelations,0);assert.equal(denied.evidence.regionPrograms.completed,0);
});

test('original two-view topology repair restores a rejected owner program and reaches actual native compilation',t=>{
 const {plan,repaired,request}=fixture(t),baseline=compile({...request,plan});
 assert.equal(plan.pendingRegionPrograms.length,1);assert.equal(plan.regionPrograms.length,2);
 assert.equal(baseline.evidence.resolvedRelations,0);assert(baseline.evidence.unresolved.some(r=>r.reason==='program-contract'));
 assert.equal(repaired.regionPrograms.length,3);assert.deepEqual(repaired.pendingRegionPrograms,[]);
 assert.equal(repaired.resolvedRegionPrograms.length,1);assert.equal(repaired.resolvedRegionPrograms[0].sourceHash,repaired.sourceHash);
 assert.deepEqual(repaired.admission.rejections,plan.admission.rejections.filter(r=>r.collection==='program'),'original program failure remains immutable history');
 assert.equal(repaired.admission.complete,false,'original admission is not relabeled as flawless');assert.deepEqual(active(repaired),[]);
 assert.equal(slots(repaired),slots(plan));assert.equal(localCapacity(repaired),localCapacity(plan)-1,'the original local review still consumes its slot');
 const out=compile(request);
 assert.equal(out.evidence.resolvedRelations,1);assert.equal(out.evidence.regionPrograms.completed,3);
 assert.deepEqual(out.evidence.unresolved,[]);assert.deepEqual(out.evidence.admissionRecovery,{historicalRejected:2,unresolved:0,resolvedPrograms:1,resolvedRelations:1});
 assert.deepEqual(repaired.admission.history.rejections,plan.admission.rejections,'original relation and program failures both survive repair');
 assert.equal(out.page.images.length,0);assert(out.page.shapes.length>0);assert(out.evidence.sourceScanPixels<=4000000);
 assert.deepEqual(audit(out.evidence.observedInventory,out.page.shapes,out.page.images,repaired.sourceHash),[]);
 const restored=compile({...request,plan:JSON.parse(JSON.stringify(repaired))});
 assert.equal(restored.evidence.regionPrograms.completed,3,'persisted controls still require new source compilation');
 const arrow=out.page.shapes.find(s=>s.source?.sceneInventoryId==='relation-one');assert(arrow);
 assert(audit(out.evidence.observedInventory,out.page.shapes.filter(s=>s!==arrow),out.page.images,repaired.sourceHash).some(f=>f.reason==='compile-missing'));
});

test('a repaired owner with charged physical aliases reaches native compilation and final member audit after compaction',t=>{
 const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
 const {sceneHeaderObjectCapacity:headerCapacity,sceneLocalObjectCapacity:objectCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 for(const blank of [false,true]){
  const {repaired,request}=fixture(t,blank,true,true),snapshot=structuredClone(repaired.resolvedRegionPrograms);
  const next=compact(repaired,[{id:'object-alias',canonicalId:'object-a'}]).plan;
  assert.deepEqual(next.resolvedRegionPrograms,snapshot);assert.deepEqual(active(next),[]);
  assert.deepEqual(next.regionPrograms[0].objects,['object-a','object-b']);
  assert.equal(headerCapacity(next),headerCapacity(repaired));assert.equal(objectCapacity(next),objectCapacity(repaired));
  assert.equal(slots(next),slots(repaired));assert.equal(localCapacity(next),localCapacity(repaired));
  const out=compile({...request,plan:JSON.parse(JSON.stringify(next))});
  assert.equal(out.evidence.resolvedRelations,blank?0:1);assert.equal(out.evidence.regionPrograms.completed,blank?0:1);
  assert.equal(out.page.images.length,0);assert(out.evidence.sourceScanPixels<=4000000);
  if(blank){assert(out.evidence.unresolved.length>0);continue;}
  assert.deepEqual(out.evidence.unresolved,[]);
  assert.deepEqual(audit(out.evidence.observedInventory,out.page.shapes,out.page.images,next.sourceHash),[]);
  const member=out.page.shapes.find(s=>s.source?.sceneInventoryId==='object-a');assert(member);
  assert(audit(out.evidence.observedInventory,out.page.shapes.filter(s=>s!==member),out.page.images,next.sourceHash).some(f=>f.reason==='compile-missing'));
 }
});

test('unselected or disagreeing original observations cannot discharge the program rejection',t=>{
 const {plan,targets,observations}=fixture(t);
 for(const next of [apply(plan,[],[[],[]]).plan,apply(plan,targets,[observations,observations.map(row=>({...row,direction:'unknown'}))]).plan]){
  assert.equal(next.pendingRegionPrograms.length,1);assert.equal(next.resolvedRegionPrograms,undefined);
  assert(active(next).some(row=>row.collection==='program'));assert.equal(slots(next),slots(plan));
 }
 const original=structuredClone(plan);delete original.pendingRegionPrograms;
 assert(active(original).some(row=>row.collection==='program'),'absence of a task does not erase its failure');
});

test('the production planner schedules the original relation repair and persists its restored owner program within one observation pair',async t=>{
 for(const malformedPath of [false,true]){
 const {proposal,request}=fixture(t,false,malformedPath),{createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 const counts={global:0,local:0};
 const planner=createSourceScenePlanner({recognize:async input=>{
  if(input.task==='structure'){counts.global++;return {scene:proposal,reviews:[],missingText:[]};}
  counts.local++;const targets=input.localTargets;
  return {reviews:targets.reviews.map(index=>({index,kind:'text'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   ...(targets.relations?{relations:targets.relations.map(index=>({index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}))}:{}),
   ...(targets.structures?{structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.regionInventories?{regionInventories:targets.regionInventories.map(index=>({index,units:[],relations:[],
    ...(targets.regionBoundaryIndices?.includes(index)?{boundary:{confidence:0,box_2d:null}}:{})}))}:{})};
 }});
 const out=await planner({root:request.root,sourceFile:request.sourceFile,dimensions:{widthPx:200,heightPx:180},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.deepEqual(counts,{global:1,local:2});assert.deepEqual(out.plan.pendingRegionPrograms,[]);assert.equal(out.plan.resolvedRegionPrograms.length,1);
 assert.deepEqual(active(out.plan),[]);const compiled=compile({...request,plan:out.plan});
 assert.equal(compiled.evidence.resolvedRelations,1);assert.equal(compiled.evidence.regionPrograms.completed,3);assert.deepEqual(compiled.evidence.unresolved,[]);
 const directories=fs.readdirSync(request.root).filter(name=>name.startsWith('scene-review-'));assert.equal(directories.length,1);
 const saved=JSON.parse(fs.readFileSync(path.join(request.root,directories[0],'plan.json')));
 assert.deepEqual(saved.resolvedRegionPrograms,out.plan.resolvedRegionPrograms);assert.deepEqual(active(saved),[]);
 assert.equal(saved.admission.history.relations[0].detailCode,malformedPath?'tuple':'relation-anchor-scope');
 }
});

test('the production planner restores original dependencies after real source-measured preflight compaction',async t=>{
 const {proposal,request}=fixture(t,false,true,true),{createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 const counts={global:0,local:0,preflight:0},sessions=[];
 const planner=createSourceScenePlanner({recognize:async input=>{
  if(input.task==='structure'){counts.global++;return {scene:proposal,reviews:[],missingText:[]};}
  counts.local++;const targets=input.localTargets;
  return {reviews:targets.reviews.map(index=>({index,kind:'text'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   ...(targets.relations?{relations:targets.relations.map(index=>({index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}))}:{}),
   ...(targets.structures?{structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.regionInventories?{regionInventories:targets.regionInventories.map(index=>({index,units:[],relations:[],
    ...(targets.regionBoundaryIndices?.includes(index)?{boundary:{confidence:0,box_2d:null}}:{})}))}:{})};
 }});
 const out=await planner({root:request.root,sourceFile:request.sourceFile,dimensions:{widthPx:200,heightPx:180},ocr:{lines:[]},
  isCancellationRequested:async()=>false,preflightSourceScene:(plan,compilationSession)=>{
   counts.preflight++;const out=preflight({...request,plan,compilationSession});sessions.push(out.compilationSession);return out;
  }});
 assert.deepEqual(counts,{global:1,local:2,preflight:2});assert.deepEqual(active(out.plan),[]);
 assert.equal(sessions[0],sessions[1],'recovered route dependencies must refresh on the original compiler ledger');
 assert.equal(out.compilationSession,sessions[0]);
 assert.deepEqual(out.plan.pendingRegionPrograms,[]);assert.equal(out.plan.resolvedRegionPrograms.length,1);
 assert(out.plan.objectBatches.aliases.some(row=>row.id==='object-alias'&&row.canonicalId==='object-a'));
 assert(out.plan.resolvedRegionPrograms[0].program.objects.includes('object-alias'));
 assert.deepEqual(out.plan.regionPrograms[0].objects,['object-a','object-b']);
 const compiled=compile({...request,plan:out.plan,compilationSession:out.compilationSession});
 assert.equal(compiled.evidence.resolvedRelations,1);assert.equal(compiled.evidence.regionPrograms.completed,1);
 assert.deepEqual(compiled.evidence.unresolved,[]);assert(compiled.evidence.sourceScanPixels<=4000000);
 assert.deepEqual(audit(compiled.evidence.observedInventory,compiled.page.shapes,compiled.page.images,out.plan.sourceHash),[]);
 const directory=fs.readdirSync(request.root).find(name=>name.startsWith('scene-review-'));assert(directory);
 const saved=JSON.parse(fs.readFileSync(path.join(request.root,directory,'plan.json')));
 assert.deepEqual(saved.resolvedRegionPrograms,out.plan.resolvedRegionPrograms);assert.deepEqual(active(saved),[]);
});

test('resolution controls cannot hide changed source, missing dependencies, conflicting labels or different admission failures',t=>{
 const {repaired,request}=fixture(t);
 let mutationIndex=0;
 for(const change of [p=>p.resolvedRegionPrograms[0].sourceHash='b'.repeat(64),p=>p.resolvedRegionPrograms[0].widthPx++,
  p=>p.resolvedRegionPrograms[0].index=23,p=>p.resolvedRegionPrograms[0].program.regionId='region-left',
  p=>p.regionPrograms.find(row=>row.regionId==='region-root').relations=[],p=>p.resolvedRegionPrograms.push(structuredClone(p.resolvedRegionPrograms[0])),
  p=>p.resolvedRegionPrograms[0].program.labels=[{refs:['label-'+'a'.repeat(24)],family:'Arial'}],
  p=>p.admission.rejections[0].detailCode='program-contract',p=>p.pendingRegionPrograms=[{index:0,program:structuredClone(p.resolvedRegionPrograms[0].program)}]]){
  const bad=structuredClone(repaired);change(bad);assert.throws(()=>compile({...request,plan:bad}),e=>e instanceof TypeError&&/^Scene /u.test(e.message),'resolution mutation '+mutationIndex);mutationIndex++;
 }
 const unknown=structuredClone(repaired);unknown.admission.rejections.push({collection:'relation',index:5,reason:'relation-contract',detailCode:'tuple'});
 delete unknown.relationBatches;assert.equal(active(unknown).length,1);assert.equal(active(unknown)[0].collection,'relation');
 const legacy=structuredClone(repaired);delete legacy.resolvedRegionPrograms;
 assert(active(legacy).some(row=>row.collection==='program'));
 assert.throws(()=>rebind(repaired,{...repaired,resolvedRegionPrograms:structuredClone(repaired.resolvedRegionPrograms)}),/transition/);
});

test('new resolution bindings retain the original owner before canonical transfer and survive serialization without becoming source authority',t=>{
 const {repaired,request}=fixture(t);assert.match(repaired.resolvedRegionPrograms[0].programBinding,/^[a-f0-9]{64}$/);
 const saved=JSON.parse(JSON.stringify(repaired));assert.equal(compile({...request,plan:saved}).evidence.resolvedRelations,1);
 for(const value of ['',null,7,'x'.repeat(64),'a'.repeat(65)]){
  const invalid=structuredClone(saved);invalid.resolvedRegionPrograms[0].programBinding=value;
  assert.throws(()=>compile({...request,plan:invalid}),e=>e instanceof TypeError&&/^Scene /u.test(e.message));
 }
 const legacy=structuredClone(saved);delete legacy.resolvedRegionPrograms[0].programBinding;
 assert.equal(compile({...request,plan:legacy}).evidence.resolvedRelations,1,'legacy records still require their ordinary validated dependencies');
 const stripped=structuredClone(legacy);stripped.resolvedRegionPrograms[0].program.regionId='region-left';
 assert.throws(()=>compile({...request,plan:stripped}),/Scene restored program binding/,'removing the fingerprint cannot reattach an empty dependency set to another owner');
 const reordered=structuredClone(saved),original=reordered.resolvedRegionPrograms[0].program;
 reordered.resolvedRegionPrograms[0].program={labels:original.labels,relations:original.relations,objects:original.objects,regionId:original.regionId};
 assert.equal(compile({...request,plan:reordered}).evidence.resolvedRelations,1);
 const empty=fixture(t,true),candidate=structuredClone(empty.repaired);
 assert.equal(compile({...empty.request,plan:candidate}).evidence.resolvedRelations,0,'the binding never supplies source strokes');
});

test('program restoration metadata cannot authorize native content on an empty source',t=>{
 const {repaired,request}=fixture(t,true);assert.deepEqual(active(repaired),[]);
 const out=compile(request);assert.equal(out.evidence.resolvedRelations,0);assert.equal(out.evidence.regionPrograms.completed,0);
 assert(out.evidence.unresolved.length>0);assert.equal(out.page.shapes.length,0);assert.equal(out.page.images.length,0);
});

test('empty, oversized, proxy and accessor resolution controls fail without running caller code',t=>{
 const {repaired}=fixture(t);let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 assert.deepEqual(active({version:1,sourceHash:'a'.repeat(64),widthPx:1,heightPx:1,regions:[],objects:[],relations:[]}),[]);
 for(const change of [p=>p.resolvedRegionPrograms=Array(25).fill(p.resolvedRegionPrograms[0]),
  p=>p.resolvedRegionPrograms=new Proxy(p.resolvedRegionPrograms,{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.resolvedRegionPrograms[0]=Object.defineProperty({},'program',{get:trap}),
  p=>p.resolvedRegionPrograms[0].program.relations=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.resolvedRegionPrograms[0].program.labels=[Object.defineProperty({},'refs',{get:trap})]]){
  const bad=structuredClone(repaired);change(bad);assert.throws(()=>active(bad),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 }
 for(const admission of [new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap}),Object.defineProperty({},'rejections',{get:trap}),
  {rejections:[Object.defineProperty({},'collection',{get:trap})]}]){
  const bad=structuredClone(repaired);delete bad.resolvedRegionPrograms;bad.admission=admission;
  assert.throws(()=>active(bad),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 }
 assert.equal(calls,0);
});

test('program recovery pipeline regressions are discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(f=>path.normalize(f.file)===path.normalize('test/source-scene-program-recovery-pipeline.test.js')));
});
