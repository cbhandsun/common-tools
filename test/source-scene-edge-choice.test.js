'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-edge-choice.cjs');
const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply,topologyReviewPrompt,sceneEdgeLocalTargets}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {localResponseFormat,decodeLocalResponse,parseLocalTargets,sceneRelationOutputPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-local-response');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
function controls(f){return select(f.plan,32,f.evidence).map((t,i)=>({...t,index:20+i}));}
function rows(f){return f.plan.relations.map((r,i)=>({index:20+i,fromId:r.fromId,toId:r.toId,direction:r.direction,confidence:.99,sourceEdgePath:f.choices[i]}));}
test('complete source catalogs nominate an exclusive edge choice in the original relation slots',()=>{
 const f=fixture(),targets=controls(f);assert.equal(targets.length,2);assert.ok(targets.every(t=>t.edgeReview&&!t.pathReview));
 const observations=read({relations:rows(f)},targets),result=apply(f.plan,targets,[observations,structuredClone(observations)]);
 assert.equal(result.evidence.corrected.length,2);assert.equal(result.plan.relations.length,2);
 assert.ok(result.plan.relations.every(r=>r.sourcePathChoice&&!r.visiblePath));assert.ok(f.plan.relations.every(r=>!r.sourcePathChoice));
 const compiled=compileSharedSourceRoute({fit:f.fit,image:f.f.image,relations:result.plan.relations,id:'edge-choice',sourceHash:f.plan.sourceHash,slideSize:{widthPt:300,heightPt:230}});
 assert.equal(compiled.graph.paths.length,2);assert.equal(compiled.graph.nodes.length,compiled.graph.edges.length);
 const frame={width:300,height:230,sourceTargets:targets.map(t=>({index:t.index,cropBox:t.box})),sheetTargets:targets.map(t=>({index:t.index,cropBox:t.box}))};
 const prompt=topologyReviewPrompt(targets,frame);assert.match(prompt,/needsEdgeChoice/);assert.match(prompt,/ALL cycle arms/);
 for(const edge of f.context.catalog.edges)assert.ok(prompt.includes(edge.id));
});
test('edge consensus rejects uncertainty, disagreement, stale snapshots and attempts to change identity',()=>{
 for(const change of [b=>delete b[0].sourcePathChoice,b=>b[0].confidence=.89,b=>b[0].direction='backward',b=>b[0].fromId='object-left',
  b=>b[0].sourcePathChoice.networkHash='b'.repeat(64),b=>b[0].sourcePathChoice.steps.reverse()]){
  const f=fixture(),t=controls(f),a=read({relations:rows(f)},t),b=structuredClone(a);change(b);
  let result;try{result=apply(f.plan,t,[a,b]);}catch(e){assert.ok(e instanceof TypeError);continue;}
  assert.deepEqual(result.plan.relations[0],f.plan.relations[0]);
 }
 for(const change of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx++,p=>p.regions[0].box.h++,p=>p.relations[0].shaftBox.x++]){
  const f=fixture(),t=controls(f),a=read({relations:rows(f)},t);change(f.plan);assert.deepEqual(apply(f.plan,t,[a,a]).plan.relations[0],f.plan.relations[0]);
 }
 const f=fixture(),t=controls(f),r=rows(f);r[0].sourceEdgePath=null;assert.equal(read({relations:r},t)[0].sourcePathChoice,undefined);
 for(const mutate of [r=>r[0].sourceEdgePath[0].reversed=!r[0].sourceEdgePath[0].reversed,r=>r[0].sourceEdgePath.push(r[0].sourceEdgePath[0]),
  r=>r[0].sourceEdgePath.splice(1,1),r=>r[0].sourceEdgePath[0].id='ink-'+'f'.repeat(24),r=>r[0].visiblePath_2d=null]){
  const r=structuredClone(rows(f));mutate(r);assert.throws(()=>read({relations:r},t),TypeError);
 }
});
test('edge choice transport enforces exact per-index schema, bounded enums and safe containers',()=>{
 const f=fixture(),t=controls(f),targets={reviews:[],missing:[],relations:[20,21,22],...sceneEdgeLocalTargets(t)};
 const ordinary={fromId:null,toId:null,direction:'unknown',confidence:0};
 const reply={reviewsByIndex:{},recoveredByIndex:{},relationsByIndex:Object.fromEntries([...rows(f).map(({index,...r})=>[index,r]),[22,ordinary]])};
 const schema=localResponseFormat(targets).json_schema.schema.properties.relationsByIndex.properties;
 assert.deepEqual(schema[20].required,['fromId','toId','direction','confidence','sourceEdgePath']);assert.equal(schema[22].required.length,4);
 assert.equal(schema[20].properties.sourceEdgePath.anyOf[1].maxItems,15);assert.deepEqual(schema[20].properties.sourceEdgePath.anyOf[1].items.properties.id.enum,f.context.catalog.edges.map(e=>e.id));
 assert.deepEqual(decodeLocalResponse(reply,targets).relations.slice(0,2),rows(f));assert.match(sceneRelationOutputPrompt(targets),/edge-choice indices/);
 for(const extra of [{relationPathIndices:[20]},{relationLocalizationIndices:[21]}])assert.throws(()=>parseLocalTargets({...targets,...extra}),TypeError);
 for(const mutate of [r=>delete r.relationsByIndex[20].sourceEdgePath,r=>r.relationsByIndex[22].sourceEdgePath=null,r=>r.relationsByIndex[20].sourceEdgePath[0].id='ink-'+'f'.repeat(24)]){
  const r=structuredClone(reply);mutate(r);assert.throws(()=>decodeLocalResponse(r,targets),TypeError);
 }
 let calls=0;const getter=()=>{calls++;throw Error('private-content');};
 for(const value of [new Proxy({},{get:getter}),Object.defineProperty({},'20',{get:getter}),{20:new Proxy({},{get:getter})}])
  assert.throws(()=>parseLocalTargets({...targets,relationEdgePaths:value}),TypeError);
 assert.equal(calls,0);
});
test('deferred observations carry complete edge bindings through two views and the shared pixel ledger',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'scene-edge-review-'));
 t.after(()=>{assert.equal(path.dirname(directory),parent);fs.rmSync(directory,{recursive:true,force:true});});
 const f=fixture(),targets=controls(f),budget={used:0},calls=[];
 const result=await require('../packages/slideclone-core/scene-plan/source-scene-deferred-relation-review').reviewDeferredSceneRelations({plan:f.plan,targets,image:f.f.image,budget,directory,rules:'Source only.',verifySource:()=>{},isCancellationRequested:async()=>false,
  observe:async request=>{calls.push(request);assert.deepEqual(request.localTargets.relationEdgePaths,sceneEdgeLocalTargets(targets).relationEdgePaths);
   assert.equal(request.localTargets.relationPathIndices,undefined);const reply={reviewsByIndex:{},recoveredByIndex:{},relationsByIndex:Object.fromEntries(rows(f).map(({index,...r})=>[index,r]))};
   return decodeLocalResponse(reply,request.localTargets);}});
 assert.equal(calls.length,2);assert.equal(result.evidence.topology.corrected.length,2);assert.ok(budget.used>0&&budget.used<=4000000);
});
test('default compilation remeasures choices and cannot downgrade a failed identity through any fallback',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene:compile}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const {parseSourceScenePlan:parse}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'source-edge-default-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const f=fixture(),sourceFile=path.join(root,'source.png');writePng(sourceFile,f.f.image);
 f.plan.regions=f.plan.regions.slice(0,1);
 f.plan.objects.unshift({id:'object-source',regionId:'root',kind:'container',box:{...f.f.nodes[0].box},pictorialContent:'absent'});
 for(const r of f.plan.relations)r.fromId='object-source';
 f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 f.plan=require('../packages/slideclone-core/scene-plan/source-scene-object-batches').initializeSceneObjectBatches(parse({...f.plan,coordinateSpace:'source-pixels',inventory:[['root',3,0,2]]},f.plan));
 const request={page:{shapes:[],images:[],textBoxes:[]},plan:f.plan,sourceFile,root,slideSize:{widthPt:300,heightPt:230}};
 const original=compile(request);assert.equal(original.evidence.resolvedRelations,0);
 assert.equal(original.evidence.sharedRoutes.pathChoices[0].edges.length,6);
 const targets=select(f.plan,32,original.evidence).map((r,i)=>({...r,index:20+i})),a=read({relations:rows(f)},targets);
 const reviewed=apply(f.plan,targets,[a,structuredClone(a)]).plan;
 const completed=compile({...request,plan:reviewed});
 assert.equal(completed.evidence.resolvedRelations,2);
 // Successful preflight must retain the CURRENT source catalog for the host's
 // final retained-choice boundary, not only expose catalogs on failure.
 const {sourceRouteCatalogsFromEvidence}=require('../packages/slideclone-core/routing/source-shared-route-reprojection');
 const catalogs=sourceRouteCatalogsFromEvidence(completed.evidence);
 assert.equal(catalogs.length,1);assert.equal(catalogs[0].edges.length,6);
 const endpoint=id=>{const row=reviewed.objects.find(o=>o.id===id);assert.ok(row);
  return {collection:'objects',kind:row.kind,point:{x:row.box.x+row.box.w/2,y:row.box.y+row.box.h/2}};};
 const retained={sourceHash:reviewed.sourceHash,widthPx:300,heightPx:230,reviewId:'successful-preflight',icon:null,
  routes:reviewed.relations.map((r,i)=>({from:endpoint(r.fromId),to:endpoint(r.toId),direction:r.direction,steps:f.choices[i]}))};
 const {applyRetainedSceneReview}=require('../packages/slideclone-core/scene-plan/retained-scene-review');
 const restored=applyRetainedSceneReview({...request,plan:reviewed,sourceRouteCatalogs:catalogs},retained);
 assert.equal(compile(restored).evidence.resolvedRelations,2);
 assert.throws(()=>applyRetainedSceneReview({...request,plan:reviewed,sourceRouteCatalogs:[]},retained),/source network is unavailable/);
 const stale=structuredClone(catalogs);stale[0].sourceHash='b'.repeat(64);
 assert.throws(()=>applyRetainedSceneReview({...request,plan:reviewed,sourceRouteCatalogs:stale},retained),TypeError);
 const forged=structuredClone(reviewed);for(const r of forged.relations)r.sourcePathChoice.networkHash='b'.repeat(64);
 const rejected=compile({...request,plan:forged});assert.equal(rejected.evidence.resolvedRelations,0);
 for(const r of forged.relations)assert.ok(rejected.evidence.unresolved.some(e=>e.id===r.id&&e.detailCode==='source-edge-choice'));
 for(const collection of [rejected.page.shapes,rejected.page.images])assert.ok(collection.every(s=>s.source?.nativeComponentRole!=='relationship'));
 for(const value of [null,{},new Proxy({},{get(){throw Error('private');}})]){
  const invalid=structuredClone(reviewed);invalid.relations[0].sourcePathChoice=value;assert.throws(()=>compile({...request,plan:invalid}),TypeError);
 }
 const parsed=parse({...reviewed,coordinateSpace:'source-pixels',inventory:[['region-root',3,0,2]]},reviewed);assert.deepEqual(parsed.relations.map(r=>r.sourcePathChoice),reviewed.relations.map(r=>r.sourcePathChoice));
 const dual=structuredClone(reviewed);dual.relations[0].visiblePath={kind:'polyline',dash:'solid',vertices:[{x:150,y:50},{x:50,y:170}]};
 assert.throws(()=>parse({...dual,coordinateSpace:'source-pixels',inventory:[['region-root',3,0,2]]},dual),/choice/);assert.throws(()=>compile({...request,plan:dual}),/choice/);
});
