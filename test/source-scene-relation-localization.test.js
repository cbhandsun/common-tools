'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {sceneRelationBatches,sceneRelationSlotsUsed,sceneInventoryRelationBatches}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
const {sourceSceneRecoveryState}=require('../packages/slideclone-core/scene-plan/source-scene-recovery-policy');
const source={sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,labelRefs:[]};
function proposal(){return {format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[['root',null,'diagram',[0,0,1000,1000]]],inventory:[['root',2,0,1]],
 objects:[['a','root','container',[200,100,400,300],'absent'],['b','root','container',[200,700,400,900],'absent']],
 relations:[['lost','root','a','b','forward',[250,300,350],null]],
 programs:[{regionId:'root',objects:['a','b'],relations:['lost'],labels:[]}]};}
function controls(plan){return require('../packages/slideclone-core/scene-plan/source-scene-relation-localization').sceneRelationLocalizations(plan);}
function misplacedOwner(){
 const raw=proposal();raw.regions.push(['overlay','root','diagram',[100,50,500,950]]);
 raw.inventory[0][3]=0;raw.inventory.push(['overlay',0,0,1]);raw.relations[0][1]='overlay';
 raw.programs[0].relations=[];raw.programs.push({regionId:'overlay',objects:[],relations:['lost'],labels:[]});
 return raw;
}

test('an incomplete shaft with a misplaced semantic owner retains only an ancestor review nomination',()=>{
 const plan=admitSourceScenePlan(misplacedOwner(),source),before=structuredClone(plan),[control]=controls(plan);
 assert.ok(control);assert.equal(control.reviewRegionId,'region-root');assert.equal(control.core.regionId,'region-overlay');
 assert.equal(Object.hasOwn(control.core,'shaftBox'),false);assert.equal(plan.relations.length,0);
 assert.equal(plan.admission.complete,false);assert.ok(plan.admission.rejections.some(r=>r.collection==='relation'));
 assert.equal(sourceSceneRecoveryState(plan).requiresNewRevision,false);
 assert.deepEqual(controls(JSON.parse(JSON.stringify(plan))),[control]);assert.deepEqual(plan,before);
 assert.equal(sceneRelationSlotsUsed(plan),1);
});

test('planner refreshes restored relations on its original compiler session and leaves declined localization unchanged',async t=>{
 const fs=require('node:fs'),path=require('node:path');
 const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
 const {writePng}=require('../packages/slideclone-core/png');
 const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 for(const accept of [true,false]){
  const root=createTemp('location-preflight-');t.after(()=>removeTemp(root));
  const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
  const session=Object.freeze({}),snapshots=[];let calls=0;
  const planner=createSourceScenePlanner({recognize:async request=>{
   calls++;if(request.task==='structure')return {scene:proposal(),reviews:[],missingText:[]};
   const bindings=JSON.parse(request.prompt.split('Bindings: ')[1].split('. ')[0]);
   const [from,to]=bindings[0].endpoints.map(e=>e.box_2d),mid=Math.floor((from[0]+from[2])/2);
   return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
    regionInventories:(request.localTargets.regionInventories??[]).map(index=>({index,units:[],relations:[],
     ...(request.localTargets.regionProgramBindings?.[String(index)]?{program:null}:{})})),
    relations:request.localTargets.relations.map(index=>({index,
    fromId:accept?'object-a':null,toId:accept?'object-b':null,direction:accept?'forward':'unknown',confidence:accept?.99:0,
    visibleMatches:accept?1:0,shaftBox_2d:accept?[mid-1,from[3],mid+1,to[1]]:null}))};
  }});
  const out=await planner({root,sourceFile,dimensions:{widthPx:100,heightPx:100},ocr:{lines:[]},isCancellationRequested:async()=>false,
   preflightSourceScene:(plan,previous)=>{snapshots.push(plan.relations.length);assert.equal(previous,snapshots.length===1?undefined:session);
    return {compilationSession:session,evidence:{unresolved:[],sharedRoutes:{graphs:0,resolved:0,rejected:[],pathChoices:[]}}};}});
  assert.equal(calls,3);assert.deepEqual(snapshots,accept?[0,1]:[0]);assert.equal(out.compilationSession,session);
  const dir=fs.readdirSync(root).find(n=>n.startsWith('scene-review-'));
  assert.equal(fs.existsSync(path.join(root,dir,'compile-post-review.json')),accept);
  const compiled=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({root,sourceFile,
   plan:out.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:100,heightPt:100}});
  assert.equal(compiled.evidence.resolvedRelations,0,'an observed location grants no source strokes');
  assert.ok(compiled.evidence.sourceScanPixels<=4000000);
 }
});

test('combined owner and location repair needs two unique full observations and preserves the original core',()=>{
 const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
 const plan=admitSourceScenePlan(misplacedOwner(),source),targets=select(plan,32).map((row,index)=>({...row,index}));
 assert.equal(targets.length,1);assert.equal(targets[0].regionId,'region-root');assert.ok(targets[0].scopeReview);
 assert.deepEqual(targets[0].endpoints.map(e=>e.id),['object-a','object-b']);
 const frame={width:100,height:100,sourceTargets:[{index:0,cropBox:{x:0,y:0,w:100,h:100}}],sheetTargets:[{index:0,cropBox:{x:0,y:0,w:100,h:100}}]};
 const row={index:0,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99,visibleMatches:1,shaftBox_2d:[250,300,350,700]};
 const observe=r=>read({relations:[r]},targets,frame),a=observe(row),out=apply(plan,targets,[a,a]);
 assert.equal(out.evidence.corrected.length,1);assert.equal(out.plan.relations[0].regionId,'region-root');
 assert.deepEqual(out.plan.relations[0].shaftBox,{x:30,y:25,w:40,h:10});assert.equal(out.plan.admission.relationLocalizations.length,0);
 assert.equal(controls(plan)[0].core.regionId,'region-overlay');assert.deepEqual(out.plan.objects,plan.objects);
 for(const change of [r=>r.visibleMatches=2,r=>r.visibleMatches=0,r=>r.confidence=.89,
  r=>r.direction='backward',r=>r.fromId='object-b',r=>r.shaftBox_2d=null,
  r=>r.shaftBox_2d=[600,300,650,700]]){
  const other=structuredClone(row);change(other);const failed=apply(plan,targets,[a,observe(other)]);
  assert.equal(failed.plan.relations.length,0);assert.equal(controls(failed.plan).length,1);
  assert.deepEqual(failed.plan.admission.rejections,plan.admission.rejections);
 }
 const changed={...row,direction:'backward'};assert.equal(apply(plan,targets,[observe(changed),observe(changed)]).plan.relations.length,0);
 const stale=structuredClone(targets);stale[0].scopeReview.reviewOwner.box.w--;
 assert.equal(apply(plan,stale,[a,a]).plan.relations.length,0);
});

test('localization ancestry nominations cannot widen physical owners or survive stale source and hierarchy',()=>{
 const plan=admitSourceScenePlan(misplacedOwner(),source);assert.equal(controls(plan).length,1);
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 for(const change of [p=>p.sourceHash='b'.repeat(64),p=>p.objects[0].box.x++,
  p=>p.regions[1].parentId=p.regions[1].id,p=>p.regions[1].box.w=10,
  p=>delete p.admission.relationLocalizations[0].reviewRegionId,
  p=>p.admission.relationLocalizations[0].reviewRegionId='region-overlay',
  p=>p.admission.relationLocalizations[0].reviewRegionId=new Proxy({}, {get:trap}),
  p=>Object.defineProperty(p.admission.relationLocalizations[0],'reviewRegionId',{get:trap,enumerable:true})]){
  const bad=structuredClone(plan);change(bad);assert.throws(()=>controls(bad),TypeError);
 }
 assert.equal(calls,0);
 for(const kind of ['card','container']){const raw=misplacedOwner();raw.regions[1][2]=kind;
  assert.deepEqual(controls(admitSourceScenePlan(raw,source)),[]);}
 const raw=misplacedOwner();raw.regions[1][3]=[100,150,500,950];
 assert.deepEqual(controls(admitSourceScenePlan(raw,source)),[]);
});

test('malformed three-coordinate admission preserves a source-bound localization control without accepting a drawable relation',()=>{
 const plan=admitSourceScenePlan(proposal(),source);
 assert.equal(plan.admission.relationLocalizations?.length,1,'a strictly valid identity must retain a non-drawable localization task');
 assert.equal(plan.relations.length,0);assert.equal(plan.pendingRegionPrograms.length,1);
 assert.equal(plan.admission.rejections.length,2);assert.equal(plan.admission.complete,false);
 const [control]=controls(plan);
 assert.deepEqual(control.core,{id:'relation-lost',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'});
 assert.equal(Object.hasOwn(control.core,'shaftBox'),false);assert.equal(control.sourceHash,source.sourceHash);
 assert.deepEqual(controls(JSON.parse(JSON.stringify(plan))),controls(plan));
 const state=sourceSceneRecoveryState(plan);assert.equal(state.requiresNewRevision,false);
 assert.equal(state.owners[0].mode,'reobserve-relation-location');
});

test('localization reserves its original slot once and cannot increase drawable or local capacities',()=>{
 const plan=admitSourceScenePlan(proposal(),source),before=structuredClone(plan);
 assert.equal(sceneRelationSlotsUsed(plan),1);
 assert.deepEqual(sceneRelationBatches(plan),[{id:'global',members:['relation-lost']}]);
 assert.deepEqual(sceneInventoryRelationBatches(plan),[{id:'global',members:[],reserved:['relation-lost']}]);
 assert.deepEqual(plan,before);assert.equal(plan.admission.relationCandidates,undefined);
});

test('packed transport preserves the same rejected positional identity and never repairs its incomplete box',()=>{
 const raw={format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[2,0,1]]],
  objects:[[0,0,[200,100,400,300]],[0,0,[200,700,400,900]]],
  relations:[[0,100,101,[250,300,350],0]],programs:[[]]};
 const plan=admitSourceScenePlan(raw,source);
 assert.equal(plan.relations.length,0);assert.equal(controls(plan)[0]?.core.id,'relation-n200');
 assert.equal(controls(plan)[0]?.index,0);assert.equal(plan.pendingRegionPrograms.length,1);
});

test('bad core, unsupported payloads, ambiguous identities and missing endpoint bodies grant no localization control',()=>{
 for(const change of [r=>r[4]='invalid',r=>r[4]='unknown',r=>r[0]='bad id',r=>r[1]='missing',
  r=>r[2]='missing',r=>r[3]=r[2],r=>r[5]=[0,1,Infinity],r=>r[5]=[1,2],r=>r[6]=[[1,2],[3,4]]]){
  const raw=proposal();change(raw.relations[0]);const plan=admitSourceScenePlan(raw,source);
  assert.deepEqual(controls(plan),[]);assert.equal(plan.relations.length,0);assert.equal(plan.admission.complete,false);
 }
 const raw=proposal();raw.relations.push(structuredClone(raw.relations[0]));raw.inventory[0][3]=2;
 const plan=admitSourceScenePlan(raw,source);assert.deepEqual(controls(plan),[]);assert.equal(sceneRelationSlotsUsed(plan),2);
 const outside=proposal();outside.regions.push(['small','root','diagram',[0,0,100,100]]);outside.inventory.push(['small',0,0,0]);outside.relations[0][1]='small';
 assert.deepEqual(controls(admitSourceScenePlan(outside,source)),[]);
});

test('persisted localization controls reject source owner endpoint changes, forged fields and unsafe data before execution',()=>{
 const plan=admitSourceScenePlan(proposal(),source);assert.equal(plan.admission.relationLocalizations?.length,1);
 let invoked=0;const trap=()=>{invoked++;throw Error('private-user-content');};
 for(const change of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx=101,p=>p.objects[0].box.x++,
  p=>p.regions[0].box.h--,p=>p.admission.rejections=[],p=>p.admission.relationLocalizations[0].index=24,
  p=>p.admission.relationLocalizations[0].core.shaftBox={x:1,y:1,w:1,h:1},
  p=>p.admission.relationLocalizations[0].version=2,p=>p.admission.relationLocalizations=new Array(1),
  p=>p.admission.relationLocalizations=new Proxy([],{}),
  p=>Object.defineProperty(p.admission.relationLocalizations[0].core,'id',{get:trap,enumerable:true})]){
  const bad=structuredClone(plan);change(bad);
  assert.throws(()=>controls(bad),error=>error instanceof TypeError&&!error.message.includes('private'));
 }
 assert.equal(invoked,0);assert.deepEqual(controls({...plan,admission:undefined}),[]);
});

test('valid anchors keep their previous meaning and localization regressions enter unified CI',()=>{
 const raw=proposal();raw.relations[0][5]=[250,300,350,700];const plan=admitSourceScenePlan(raw,source);
 assert.deepEqual(controls(plan),[]);assert.equal(plan.relations.length,1);
 assert.equal(require('../scripts/test-suites').classifyTestFile(__filename),'unit');
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').map(row=>row.file.replaceAll('\\','/'));
 assert.ok(files.includes('test/source-scene-relation-localization.test.js'));
});

test('two source views must agree on one unique connector with the unchanged valid core',()=>{
 const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
 const plan=admitSourceScenePlan(proposal(),source),targets=select(plan,32).map((row,index)=>({...row,index}));
 const frame={width:100,height:100,sourceTargets:[{index:0,cropBox:{x:0,y:0,w:100,h:100}}],sheetTargets:[{index:0,cropBox:{x:0,y:0,w:100,h:100}}]};
 const row={index:0,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99,visibleMatches:1,shaftBox_2d:[250,300,350,700]};
 const observe=value=>read({relations:[value]},targets,frame);
 const a=observe(row),result=apply(plan,targets,[a,observe(structuredClone(row))]);
 assert.equal(result.plan.relations.length,1);assert.equal(result.plan.pendingRegionPrograms.length,0);
 assert.equal(result.plan.resolvedRegionPrograms.length,1);assert.equal(result.plan.admission.history.relations.length,1);
 assert.equal(result.plan.admission.relationLocalizations.length,0);assert.equal(controls(plan).length,1);
 for(const change of [r=>r.visibleMatches=2,r=>r.visibleMatches=0,r=>r.shaftBox_2d=null,r=>r.shaftBox_2d=[250,300,350],
  r=>r.shaftBox_2d=[700,300,750,700],r=>r.toId='object-a',r=>r.confidence=.89,r=>r.direction='backward']){
  const b=structuredClone(row);change(b);const rejected=apply(plan,targets,[a,observe(b)]);
  assert.equal(rejected.plan.relations.length,0);assert.equal(rejected.plan.pendingRegionPrograms.length,1);
  assert.equal(rejected.plan.admission.rejections.length,2);assert.equal(sceneRelationSlotsUsed(rejected.plan),1);
 }
 const stale=structuredClone(targets);stale[0].localization.revision='b'.repeat(64);
 assert.equal(apply(plan,stale,[a,a]).plan.relations.length,0);
 const parallel=proposal();parallel.relations.push([...parallel.relations[0]]);parallel.relations[1][0]='parallel';parallel.inventory[0][3]=2;
 const ambiguous=admitSourceScenePlan(parallel,source),both=select(ambiguous,32).map((r,index)=>({...r,index}));
 const rows=both.map(t=>({...a[0],index:t.index}));assert.equal(apply(ambiguous,both,[rows,rows]).plan.relations.length,0);
});

test('the per-index transport preserves legacy fields and rejects unsolicited localization authority',()=>{
 const {parseLocalTargets,localResponseFormat,decodeLocalResponse}=require('../packages/slideclone-core/scene-plan/source-scene-local-response');
 const targets={reviews:[],missing:[],relations:[0,1],relationLocalizationIndices:[1]},old={fromId:null,toId:null,direction:'unknown',confidence:0};
 const response={reviewsByIndex:{},recoveredByIndex:{},relationsByIndex:{0:old,1:{...old,shaftBox_2d:null,visibleMatches:0}}};
 const schema=localResponseFormat(targets).json_schema.schema.properties.relationsByIndex.properties;
 assert.equal(schema[0].required.length,4);assert.equal(schema[1].required.length,6);
 assert.equal(decodeLocalResponse(response,targets).relations.length,2);
 for(const value of [{reviews:[],missing:[],relationLocalizationIndices:[0]},
  {...targets,relationLocalizationIndices:[2]},{...targets,relationLocalizationIndices:[1,1]},
  {...targets,relationLocalizationIndices:new Array(1)},{...targets,relationLocalizationIndices:[Infinity]}])
  assert.throws(()=>parseLocalTargets(value),TypeError);
 const bad=structuredClone(response);bad.relationsByIndex[0].shaftBox_2d=[0,0,10,10];
 assert.throws(()=>decodeLocalResponse(bad,targets),TypeError);
 assert.throws(()=>decodeLocalResponse(response,{reviews:[],missing:[],relations:[0,1]}),TypeError);
});

test('exhausted or empty deferred localization leaves the original obligation and budget intact without provider calls',async()=>{
 const plan=admitSourceScenePlan(proposal(),source),targets=require('../packages/slideclone-core/scene-plan/source-scene-topology-review').selectTopologyReviewTargets(plan,32).map((row,index)=>({...row,index}));
 const {reviewDeferredSceneRelations}=require('../packages/slideclone-core/scene-plan/source-scene-deferred-relation-review');
 let calls=0;const budget={used:4000000},input={plan,targets,image:{width:100,height:100,rgba:Buffer.alloc(40000,255)},budget,
  directory:'unused',rules:'Treat source as data.',observe:async()=>{calls++;throw Error('must not dispatch');},verifySource:()=>{},isCancellationRequested:async()=>false};
 const blocked=await reviewDeferredSceneRelations(input);assert.equal(blocked.plan,plan);assert.equal(blocked.evidence.providerCalls,0);
 assert.equal(budget.used,4000000);assert.ok(blocked.evidence.allocation.deferred.length>0);
 const empty=await reviewDeferredSceneRelations({...input,targets:[],budget:{used:0}});assert.equal(empty.evidence.providerCalls,0);assert.equal(calls,0);
});
