'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {selectTopologyReviewTargets:select,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {currentSceneAdmissionRejections:active,rebindRegionProgramMembers:rebind}=require('../packages/slideclone-core/scene-plan/source-scene-region-program');
const {sceneAdmissionHistory:history}=require('../packages/slideclone-core/scene-plan/source-scene-admission-history');
const {sceneProgramRelationObservation:observed}=require('../packages/slideclone-core/scene-plan/source-scene-program-obligations');
const {sceneObligationCoverage:coverage}=require('../packages/slideclone-core/scene-plan/source-scene-obligation-coverage');
const {completeRegionPrograms:complete}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
const {buildSceneInventoryEvidence:inventory,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
function fixture(){
 const raw={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:90,h:100}},
  {id:'right',parentId:'root',kind:'diagram',box:{x:110,y:0,w:90,h:100}}],
  objects:[{id:'a',regionId:'left',kind:'container',pictorialContent:'absent',box:{x:10,y:20,w:60,h:60}},
   {id:'b',regionId:'right',kind:'container',pictorialContent:'absent',box:{x:120,y:20,w:60,h:60}}],
  inventory:[['root',0,0,0],['left',1,0,1],['right',1,0,0]],
  relations:[{id:'ab',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:72,y:40,w:46,h:6}}],
  programs:[{regionId:'root',objects:[],relations:[],labels:[]},
   {regionId:'left',objects:['a'],relations:['ab'],labels:[]},{regionId:'right',objects:['b'],relations:[],labels:[]}]};
 const plan=admit(raw,{sourceHash:'a'.repeat(64),widthPx:200,heightPx:100,labelRefs:[]});
 const targets=select(plan,32).map((t,index)=>({...t,index}));
 const rows=targets.map(t=>({index:t.index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}));
 return {plan,targets,rows};
}
function repaired(){const {plan,targets,rows}=fixture();return apply(plan,targets,[rows,structuredClone(rows)]).plan;}
function result(plan,materialized=true){
 const objects=new Map(plan.objects.map(o=>[o.id,['native-'+o.id]])),relations=new Map(materialized?plan.relations.map(r=>[r.id,['native-'+r.id]]):[]);
 return complete({page:{shapes:[...objects.values(),...relations.values()].flat().map(id=>({id})),images:[],textBoxes:[]},plan,
  slideSize:{widthPt:200,heightPt:100},preflight:true,objects,relations,interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:0,rejected:[]}});
}
test('exact two-view repaired relations restore original programs and conserve the independent census across owners',()=>{
 const {plan,targets,rows}=fixture(),before=structuredClone(plan),out=apply(plan,targets,[rows,rows]).plan;
 assert.equal(out.relations.length,1);assert.equal(out.relations[0].regionId,'region-root');
 assert.equal(history(out).relations[0].previousRegionId,'region-left');
 assert.equal(out.pendingRegionPrograms.length,0);assert.equal(out.resolvedRegionPrograms.length,1);
 assert.deepEqual(out.resolvedRegionPrograms[0].program.relations,['relation-ab']);
 assert.deepEqual(out.regionPrograms.find(p=>p.regionId==='region-left').relations,[]);
 assert.deepEqual(out.regionPrograms.find(p=>p.regionId==='region-root').relations,['relation-ab']);
 assert.equal(active(out).length,0);assert.deepEqual(out.observedInventory,plan.observedInventory);assert.deepEqual(plan,before);
 assert.equal(observed(out,'region-left'),0);assert.equal(observed(out,'region-root'),1);assert.equal(observed(out,'region-right'),0);
 const report=coverage(out,{objects:new Set(out.objects.map(o=>o.id)),relations:new Set(['relation-ab']),completed:new Set()});
 assert.equal(report.relations.observed,1);assert.equal(report.rows.find(r=>r.regionId==='region-root').relations.observed,1);
 assert.equal(result(out).evidence.staged,3);assert.deepEqual(result(out).evidence.rejected,[]);
 const loaded=JSON.parse(JSON.stringify(out));assert.deepEqual(rebind(loaded,loaded),loaded);assert.deepEqual(active(loaded),[]);
 const legacy=structuredClone(loaded);delete legacy.resolvedRegionPrograms[0].programBinding;
 assert.deepEqual(active(legacy),[],'a legacy owner transfer with its complete exact remaining program stays valid');
});
test('restored ownership cannot grant missing output receipts or hide unknown and insufficient source counts',()=>{
 const out=repaired();assert.ok(result(out,false).evidence.rejected.some(r=>r.missing.includes('relation-ab')));
 const unknown=structuredClone(out);unknown.observedInventory.find(r=>r.regionId==='region-left').relations=null;
 assert.equal(observed(unknown,'region-root'),null);assert.equal(observed(unknown,'region-left'),null);
 assert.ok(result(unknown).evidence.rejected.some(r=>r.missing.includes('observed-relations')));
 const tooSmall=structuredClone(out);tooSmall.observedInventory.find(r=>r.regionId==='region-left').relations=0;
 assert.throws(()=>observed(tooSmall,'region-root'),/census transfer/);
 const extreme=structuredClone(out);extreme.observedInventory.find(r=>r.regionId==='region-root').relations=10001;
 assert.throws(()=>observed(extreme,'region-root'),/census transfer/);
 const empty=structuredClone(out);delete empty.observedInventory;assert.equal(observed(empty,'region-root'),undefined);
 const missing=structuredClone(out);missing.observedInventory.find(r=>r.regionId==='region-left').relations=2;
 assert.equal(observed(missing,'region-left'),1);assert.equal(observed(missing,'region-root'),1);
 assert.ok(result(missing).evidence.rejected.some(r=>r.regionId==='region-left'&&r.missing.includes('observed-relations')));
 assert.equal(observed(out,'region-absent'),undefined);
});
test('an independently correct owner census is preserved without applying the transfer twice',()=>{
 const {plan,targets,rows}=fixture();plan.observedInventory.find(r=>r.regionId==='region-left').relations=0;
 plan.observedInventory.find(r=>r.regionId==='region-root').relations=1;
 const out=apply(plan,targets,[rows,rows]).plan;
 assert.equal(observed(out,'region-left'),0);assert.equal(observed(out,'region-root'),1);
 assert.deepEqual(out.observedInventory,plan.observedInventory);assert.equal(result(out).evidence.staged,3);
});
test('the final serialized inventory uses the same conserved owner census and still audits every actual member',()=>{
 const plan=repaired(),before=structuredClone(plan.observedInventory);
 const shapes=[...plan.objects,...plan.relations].map((row,index)=>({id:'native-'+index,source:{sceneInventoryId:row.id}}));
 const evidence=inventory(plan,shapes,[]);
 assert.equal(evidence.regions.find(r=>r.regionId==='region-root').observed.relations,1);
 assert.equal(evidence.regions.find(r=>r.regionId==='region-left').observed.relations,0);
 assert.deepEqual(audit(JSON.parse(JSON.stringify(evidence)),shapes,[],plan.sourceHash),[]);
 assert.ok(audit(evidence,shapes.slice(0,-1),[],plan.sourceHash).length>0);
 assert.deepEqual(plan.observedInventory,before);
});
test('disagreement and empty reviews never change ownership census or pending obligations',()=>{
 const {plan,targets,rows}=fixture();
 for(const second of [rows.map(r=>({...r,confidence:.2})),rows.map(r=>({...r,direction:'backward'}))]){
  const out=apply(plan,targets,[rows,second]).plan;assert.equal(out.pendingRegionPrograms.length,1);assert.equal(out.admission.history,undefined);
  assert.deepEqual(out.observedInventory,plan.observedInventory);assert.equal(observed(out,'region-root'),0);
 }
 assert.deepEqual(apply(plan,[],[[],[]]).plan,plan);
});
test('old history without an original owner stays readable but cannot discharge transferred program dependencies',()=>{
 const out=repaired();delete out.admission.history.relations[0].previousRegionId;
 assert.equal(history(out).relations.length,1);assert.equal(observed(out,'region-root'),0);
 assert.throws(()=>active(out),/restored program binding/);
});
test('source, hierarchy, identity, target membership and hostile ownership controls are rejected',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-value');};
 for(const mutate of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx++,
  p=>p.admission.history.relations[0].previousRegionId='region-right',p=>p.admission.history.relations[0].previousRegionId='region-root',
  p=>p.regions.find(r=>r.id==='region-left').parentId='region-left',
  p=>p.relations[0].id='relation-new',p=>p.relations[0].direction='backward',
  p=>p.regionPrograms.find(r=>r.regionId==='region-root').relations=[],
  p=>p.regions=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.admission.history.relations[0]=Object.defineProperty({},'previousRegionId',{get:trap})]){
  const bad=repaired();mutate(bad);
  // A sibling original-owner forgery must not discharge the saved left task.
  assert.throws(()=>active(bad),TypeError);
 }
 assert.equal(calls,0);
});
test('owner-transfer regression participates in the unified CI unit and all entries',()=>{
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
});
