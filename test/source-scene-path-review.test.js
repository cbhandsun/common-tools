'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply,topologyReviewPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {sourceScenePathFailures:failures}=require('../packages/slideclone-core/scene-plan/source-scene-compile-feedback');
const {localResponseFormat,decodeLocalResponse,parseLocalTargets,sceneRelationOutputPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-local-response');
const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
function fixture(){
 const f=sourceSharedNetworkFixture(),plan={version:1,sourceHash:'a'.repeat(64),widthPx:300,heightPx:230,relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:300,h:230}},
   {id:'region-source',parentId:'root',kind:'card',box:{...f.nodes[0].box}}],
  objects:f.nodes.slice(1).map(n=>({id:n.endpointId,regionId:'root',kind:'container',box:{...n.box}})),
  relations:networkRelations.map(r=>({...r,shaftBox:{x:35,y:45,w:230,h:130}}))};
 const evidence={unresolved:plan.relations.map(r=>({id:r.id,reason:'relation-source-evidence',detailCode:'shaft-window-boundary'})),
  sharedRoutes:{rejected:[{ids:plan.relations.map(r=>r.id),reason:'shared-relation-ambiguous'}]}};
 const targets=select(plan,32,evidence).map((t,i)=>({...t,index:20+i}));
 const paths=[[[150,50],[150,98],[138,98],[138,110],[50,110],[50,169]],
  [[150,50],[150,98],[138,98],[138,122],[162,122],[162,110],[250,110],[250,169]]]
  .map(vertices=>({kind:'polyline',dash:'solid',vertices:vertices.map(([x,y])=>({x,y}))}));
 return {f,plan,evidence,targets,paths};
}
function observations(f,offset=0){
 const frame={width:1000,height:1000,sourceTargets:f.targets.map(t=>({index:t.index,cropBox:{x:0,y:0,w:300,h:230}})),
  sheetTargets:f.targets.map(t=>({index:t.index,cropBox:{x:offset,y:offset,w:300,h:230}}))};
 const rows=f.targets.map((t,i)=>({index:t.index,fromId:f.plan.relations[i].fromId,toId:f.plan.relations[i].toId,direction:'forward',confidence:.99,
  visiblePath_2d:{...f.paths[i],vertices:f.paths[i].vertices.map(p=>({x:p.x+offset,y:p.y+offset}))}}));
 return {frame,rows,parsed:read({relations:rows},f.targets,frame)};
}
test('shared ambiguity nominates only existing unresolved identities within the same target and relation ceilings',()=>{
 const f=fixture(),before=structuredClone(f.plan);
 assert.equal(f.targets.length,2);assert.ok(f.targets.every(t=>t.pathReview));
 assert.deepEqual(f.targets.map(t=>t.endpoints.map(e=>e.id)),[['region-source','object-left'],['region-source','object-right']]);
 assert.deepEqual(select(f.plan,0,f.evidence),[]);assert.equal(select(f.plan,1,f.evidence).length,1);
 assert.deepEqual([...failures(f.plan,{unresolved:[],sharedRoutes:f.evidence.sharedRoutes})],[]);
 assert.deepEqual([...failures(f.plan,{unresolved:f.evidence.unresolved})],[]);
 assert.deepEqual([...failures(f.plan,{...f.evidence,sharedRoutes:{rejected:[{ids:['foreign'],reason:'shared-relation-ambiguous'}]}})],[]);
 for(const reason of ['private-provider-content','shared-shaft-width','shared-geometry-budget']){
  assert.deepEqual([...failures(f.plan,{...f.evidence,sharedRoutes:{rejected:[{ids:f.plan.relations.map(r=>r.id),reason}]}})],[]);
 }
 assert.deepEqual(f.plan,before);
});
test('two separately mapped complete observations narrow source-proven cycle routes without deleting any arm',()=>{
 const f=fixture(),a=observations(f),b=observations(f,400),before=structuredClone(f.plan),result=apply(f.plan,f.targets,[a.parsed,b.parsed]);
 assert.equal(result.evidence.corrected.length,2);assert.deepEqual(result.plan.relations.map(r=>r.visiblePath),f.paths);
 assert.deepEqual(result.plan.objects,f.plan.objects);assert.deepEqual(result.plan.regions,f.plan.regions);assert.deepEqual(f.plan,before);
 assert.deepEqual(result.plan.relations.map(r=>[r.id,r.shaftBox,r.fromId,r.toId]),f.plan.relations.map(r=>[r.id,r.shaftBox,r.fromId,r.toId]));
 const measured=measureSharedSourceRoute(f.f);assert.ok(measured.fit,measured.reason);
 const request={fit:measured.fit,image:f.f.image,id:'reviewed-cycle',sourceHash:f.plan.sourceHash,slideSize:{widthPt:300,heightPt:230}};
 assert.throws(()=>compileSharedSourceRoute({...request,relations:f.plan.relations}),/shared-relation-ambiguous/u);
 const native=compileSharedSourceRoute({...request,relations:result.plan.relations});
 assert.equal(native.graph.paths.length,2);assert.equal(native.graph.edges.length,native.graph.nodes.length);
 assert.throws(()=>compileSharedSourceRoute({...request,fit:structuredClone(measured.fit),relations:result.plan.relations}),/proof/u);
 const forged=structuredClone(result.plan.relations);forged[0].visiblePath.vertices[3].x-=10;
 assert.throws(()=>compileSharedSourceRoute({...request,relations:forged}),/shared-path-program/u);
 a.parsed[0].visiblePath.vertices[0].x++;assert.deepEqual(result.plan.relations.map(r=>r.visiblePath),f.paths);
});
test('one measured physical path cannot fill two logical slots in either traversal direction',()=>{
 const f=fixture(),measured=measureSharedSourceRoute(f.f);assert.ok(measured.fit,measured.reason);
 const first={...networkRelations[0]},request={fit:measured.fit,image:f.f.image,id:'duplicate-route',sourceHash:f.plan.sourceHash,slideSize:{widthPt:300,heightPt:230}};
 for(const second of [{...first,id:'clone'}, {...first,id:'reverse',fromId:first.toId,toId:first.fromId,direction:'backward'}]){
  assert.throws(()=>compileSharedSourceRoute({...request,relations:[first,second]}),/shared-relation-duplicate/u);
 }
});
test('path-only consensus retains parallel source identities but still rolls back duplicate complete observations',()=>{
 const f=fixture();f.plan.relations[1].toId=f.plan.relations[0].toId;
 f.targets=select(f.plan,32,f.evidence).map((t,i)=>({...t,index:20+i}));
 f.paths[1]={kind:'polyline',dash:'solid',vertices:[[150,50],[150,98],[162,98],[162,122],[138,122],[138,110],[50,110],[50,169]].map(([x,y])=>({x,y}))};
 const a=observations(f).parsed,result=apply(f.plan,f.targets,[a,structuredClone(a)]);
 assert.equal(result.evidence.corrected.length,2);assert.deepEqual(result.plan.relations.map(r=>r.visiblePath),f.paths);
 const b=structuredClone(a);b[1].visiblePath=structuredClone(b[0].visiblePath);
 const duplicate=apply(f.plan,f.targets,[b,structuredClone(b)]);
 assert.deepEqual(duplicate.plan.relations,f.plan.relations);assert.equal(duplicate.evidence.corrected.length,0);
 assert.equal(duplicate.evidence.rejected.filter(row=>row.reason==='duplicate-source-relation').length,2);
});
test('null, disagreement, wrong identity, stale source and low confidence never change a path or its endpoint references',()=>{
 for(const change of [b=>b[0].visiblePath=undefined,b=>b[0].pathRejection='path-anchor',b=>b[0].confidence=.89,
  b=>b[0].fromId='object-right',b=>b[0].toId=null,b=>b[0].direction='backward',
  b=>b[0].visiblePath.vertices.reverse(),b=>b[0].visiblePath.vertices[2].x+=2,b=>b[0].visiblePath.vertices.pop()]){
  const f=fixture(),a=observations(f).parsed,b=observations(f,400).parsed;change(b);
  assert.deepEqual(apply(f.plan,f.targets,[a,b]).plan.relations[0],f.plan.relations[0]);
 }
 for(const change of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx++,p=>p.regions[0].box.w++,p=>p.relations[0].shaftBox.y++,
  p=>p.relations[0].visiblePath={kind:'polyline',dash:'solid',vertices:[{x:150,y:50},{x:50,y:169}]}]){
  const f=fixture(),a=observations(f).parsed;change(f.plan);
  assert.deepEqual(apply(f.plan,f.targets,[a,a]).plan.relations[0],f.plan.relations[0]);
 }
 const f=fixture(),a=observations(f);a.rows[0].visiblePath_2d=null;
 assert.equal(read({relations:a.rows},f.targets,a.frame)[0].visiblePath,undefined);
});
test('path transport is an exact per-index schema variant and cannot consume extra shared targets',()=>{
 const f=fixture(),a=observations(f),t={reviews:[],missing:[],relations:[20,21],relationPathIndices:[20]},
  row={...a.rows[0]};delete row.index;
 const ordinary={fromId:'region-source',toId:'object-right',direction:'forward',confidence:.99},r={reviewsByIndex:{},recoveredByIndex:{},relationsByIndex:{20:row,21:ordinary}};
 const schema=localResponseFormat(t).json_schema.schema.properties.relationsByIndex.properties;
 assert.deepEqual(schema[20].required,['fromId','toId','direction','confidence','visiblePath_2d']);
 assert.deepEqual(schema[21].required,['fromId','toId','direction','confidence']);
 assert.equal(schema[20].properties.visiblePath_2d.anyOf[1].properties.vertices.maxItems,16);
 assert.deepEqual(decodeLocalResponse(r,t).relations[0],a.rows[0]);
 assert.match(sceneRelationOutputPrompt(t),/FIRST atlas frame/u);assert.match(topologyReviewPrompt(f.targets,a.frame),/needsPath/u);
 for(const bad of [{...t,relationPathIndices:[22]},{...t,relationPathIndices:[20,20]},{...t,relationLocalizationIndices:[20]},
  {reviews:Array.from({length:31},(_,i)=>i+100),missing:[],relations:[20,21],relationPathIndices:[20]},
  {reviews:[],missing:[],relationPathIndices:[20]}])assert.throws(()=>parseLocalTargets(bad),TypeError);
 for(const mutate of [v=>delete v.relationsByIndex[20].visiblePath_2d,v=>v.relationsByIndex[21].visiblePath_2d=null,
  v=>v.relationsByIndex[20].extra='private']){const bad=structuredClone(r);mutate(bad);assert.throws(()=>decodeLocalResponse(bad,t),TypeError);}
});
test('path parsing covers normalized bounds, vertex capacity, empty segments, wrong tiles and unsafe values',()=>{
 const f=fixture(),a=observations(f);let calls=0;const trap=()=>{calls++;throw Error('private-user-content');};
 const path={kind:'polyline',dash:'solid',vertices:[{x:150,y:50},{x:50,y:169}]};
 for(const bad of [undefined,{},[],{...path,dash:'dash'}, {...path,vertices:[]},{...path,vertices:new Array(2)},
  {...path,vertices:Array.from({length:17},()=>({x:1,y:1}))},{...path,vertices:[{x:1,y:1},{x:1,y:1}]},
  {...path,vertices:[{x:NaN,y:1},{x:1,y:1}]},{...path,vertices:[{x:.5,y:1},{x:1,y:1}]},
  {...path,vertices:[{x:-1,y:1},{x:1,y:1}]},{...path,vertices:[{x:1001,y:1},{x:1,y:1}]},
  {...path,vertices:[{x:800,y:800},{x:810,y:810}]},new Proxy(path,{get:trap}),
  {...path,vertices:new Proxy(path.vertices,{get:trap})},{...path,vertices:[{get x(){return trap();},y:50},{x:50,y:169}]}]){
  const rows=structuredClone(a.rows);rows[0].visiblePath_2d=bad;
  assert.throws(()=>read({relations:rows},f.targets,a.frame),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 for(const frame of [undefined,{...a.frame,sourceTargets:[]},{...a.frame,sheetTargets:[...a.frame.sheetTargets,a.frame.sheetTargets[0]]},
  {...a.frame,sourceTargets:new Proxy(a.frame.sourceTargets,{get:trap})},{...a.frame,width:Infinity},
  {...a.frame,sheetTargets:a.frame.sheetTargets.map(t=>({...t,cropBox:{...t.cropBox,w:299}}))}]){
  assert.throws(()=>read({relations:a.rows},f.targets,frame),TypeError);
 }
 assert.equal(calls,0);
 const rows=structuredClone(a.rows);rows[0].visiblePath_2d.vertices=Array.from({length:16},(_,i)=>({x:150-i*6,y:50+i*7}));
 assert.equal(read({relations:rows},f.targets,a.frame)[0].visiblePath.vertices.length,16);
});
test('unsafe shared feedback fails without getters or arbitrary diagnostic content escaping',()=>{
 const f=fixture();let calls=0;const trap=()=>{calls++;throw Error('private');};
 for(const sharedRoutes of [null,new Proxy({rejected:[]},{get:trap}),{rejected:new Array(1)},
  {rejected:new Proxy([],{get:trap})},{rejected:[{get ids(){return trap();},reason:'shared-relation-ambiguous'}]},
  {rejected:[{ids:new Proxy([],{get:trap}),reason:'shared-relation-ambiguous'}]},
  {rejected:[{ids:new Array(1),reason:'shared-relation-ambiguous'}]},
  {rejected:Array.from({length:25},()=>({ids:[],reason:'shared-relation-ambiguous'}))}]){
  assert.throws(()=>failures(f.plan,{...f.evidence,sharedRoutes}),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(calls,0);
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(r=>r.file.replaceAll('\\','/')==='test/source-scene-path-review.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-path-review.js'));
});
test('deferred path reviews carry the same exact schema through two source views and the existing pixel ledger',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {reviewDeferredSceneRelations}=require('../packages/slideclone-core/scene-plan/source-scene-deferred-relation-review');
 const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'scene-path-review-test-'));
 t.after(()=>{assert.equal(path.dirname(directory),parent);fs.rmSync(directory,{recursive:true,force:true});});
 const f=fixture(),budget={used:0},pixels=Buffer.from(f.f.image.rgba),requests=[];
 const result=await reviewDeferredSceneRelations({plan:f.plan,targets:f.targets,image:f.f.image,budget,directory,rules:'Source pixels only.',
  verifySource:()=>assert.deepEqual(f.f.image.rgba,pixels),isCancellationRequested:async()=>false,observe:async request=>{
   const n=requests.length;requests.push(request);assert.equal(request.task,'classify-ocr');
   assert.deepEqual(request.localTargets.relationPathIndices,[20,21]);
   const mapping=JSON.parse(fs.readFileSync(path.join(directory,'deferred-relations',`sheet-${n===0?0:.7}-mapping.json`)));
   const reply={reviewsByIndex:{},recoveredByIndex:{},relationsByIndex:Object.fromEntries(f.targets.map((target,i)=>{
    const source=mapping.sourceTargets.find(row=>row.index===target.index),sheet=mapping.sheetTargets.find(row=>row.index===target.index);
    return [target.index,{fromId:f.plan.relations[i].fromId,toId:f.plan.relations[i].toId,direction:'forward',confidence:.99,
     visiblePath_2d:{...f.paths[i],vertices:f.paths[i].vertices.map(p=>({
      x:Math.round((p.x-source.cropBox.x+sheet.cropBox.x)*1000/mapping.width),
      y:Math.round((p.y-source.cropBox.y+sheet.cropBox.y)*1000/mapping.height)}))}}];
   }))};
   localResponseFormat(request.localTargets);return decodeLocalResponse(reply,request.localTargets);
  }});
 assert.equal(requests.length,2);assert.equal(result.evidence.providerCalls,2);assert.equal(result.evidence.topology.corrected.length,2);
 assert.equal(result.plan.relations.length,f.plan.relations.length);assert.ok(budget.used>0&&budget.used<=4000000);
 assert.equal(result.evidence.spentAfter,budget.used);assert.deepEqual(f.f.image.rgba,pixels);
});
