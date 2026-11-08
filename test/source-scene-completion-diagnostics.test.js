'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sceneRegionCompletionDiagnostics:report}=require('../packages/slideclone-core/scene-plan/source-scene-completion-diagnostics');
const {completeRegionPrograms:complete}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const source={sourceHash:'a'.repeat(64),widthPx:200,heightPx:100,labelRefs:[]};
function fixture(alias=false){
 const plan=admit({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:200,h:100}},
  {id:'frame',parentId:'root',kind:'container',box:{x:5,y:5,w:190,h:90}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:20,y:30,w:30,h:30}},
   {id:'b',regionId:'root',kind:'container',box:{x:140,y:30,w:30,h:30}},
   ...(alias?[{id:'alias',regionId:'root',kind:'container',box:{x:20,y:30,w:30,h:30}}]:[])],
  relations:[{id:'lost',regionId:'root',fromId:'a',toId:'b',direction:'invalid',shaftBox:{x:50,y:40,w:90,h:4}}],
  inventory:[['root',alias?3:2,0,1],['frame',0,0,0]],
  programs:[{regionId:'root',objects:[alias?'alias':'a','b'],relations:['lost'],labels:[]},
   {regionId:'frame',objects:[],relations:[],labels:[]}]},source);
 return {plan,actual:{objects:new Set(['object-a','object-b']),relations:new Set(),completed:new Set()},
  rejected:[{regionId:'region-frame',reason:'region-members-incomplete',missing:['region-frame']},
   {regionId:'region-root',reason:'region-members-incomplete',missing:['observed-relations']}],
  unresolved:[{id:'region-frame',reason:'container-perimeter',detailCode:'outline-no-closed-component',
   alternativeFailures:[{path:'outline',code:'patterned-rail-gap'}]}]};
}
test('frame failures and missing original relation dependencies remain distinct without claiming editing or visual failure',()=>{
 const f=fixture(),before=structuredClone(f),out=report(f.plan,f.actual,f.rejected,f.unresolved);
 assert.equal(out.coverage.regions.completed,0);assert.deepEqual(out.coverage.relations,{observed:1,admitted:0,materialized:0,unprogrammed:0});
 assert.equal(out.diagnostics.basis,'compiler-region-completion-only');
 assert.equal(out.diagnostics.editingVerification,'not-assessed');assert.equal(out.diagnostics.visualVerification,'not-assessed');
 const frame=out.diagnostics.regions.find(r=>r.regionId==='region-frame'),root=out.diagnostics.regions.find(r=>r.regionId==='region-root');
 assert.deepEqual(frame.blockers,[{kind:'owner-surface-not-materialized',memberId:'region-frame',
  sourceChecks:[{path:'outline',code:'patterned-rail-gap'}]}]);
 assert.deepEqual(root.blockers,[{kind:'observed-inventory-mismatch',inventory:'relations',sourceChecks:[]}]);
 assert.deepEqual(root.pendingDependencies,{objects:[],relations:['relation-lost']});
 assert.deepEqual(f,before);
 out.diagnostics.regions[0].pendingDependencies.relations.push('forged');assert.deepEqual(f,before);
});
test('source-bound physical aliases do not become false missing original objects',()=>{
 const f=fixture(true),{compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
 const plan=compact(f.plan,[{id:'object-alias',canonicalId:'object-a'}]).plan;
 const out=report(plan,f.actual,f.rejected,f.unresolved);
 assert.deepEqual(out.diagnostics.regions.find(r=>r.regionId==='region-root').pendingDependencies,
  {objects:[],relations:['relation-lost']});
});

test('numeric source rejection locations survive completion reporting without promoting a failed region',()=>{
 const f=fixture(),witness={kind:'rail-gap',stage:'rail',side:1,startPx:20,endPx:70,trackPx:95,thicknessPx:2,allowedGapPx:8};
 f.unresolved[0].alternativeFailures[0].witness=witness;
 const out=report(f.plan,f.actual,f.rejected,f.unresolved);
 const actual=out.diagnostics.regions.find(r=>r.regionId==='region-frame').blockers[0].sourceChecks[0];
 assert.deepEqual(actual.witness,witness);assert.notEqual(actual.witness,witness);
 assert.equal(out.coverage.regions.completed,0);assert.equal(out.diagnostics.editingVerification,'not-assessed');
 actual.witness.startPx=0;assert.equal(witness.startPx,20);
 f.unresolved[0].alternativeFailures[0].code='patterned-corner-unproven';
 assert.throws(()=>report(f.plan,f.actual,f.rejected,f.unresolved),{message:'Scene frame diagnostic is invalid'});
 f.unresolved[0].alternativeFailures[0].code='unknown';
 f.unresolved[0].alternativeFailures[0].witness={secret:'sensitive-user-content'};
 assert.equal(JSON.stringify(report(f.plan,f.actual,f.rejected,f.unresolved)).includes('sensitive'),false);
});
test('admitted missing relationships keep their own category and source-check deduplication',()=>{
 const f=fixture();f.plan.relations.push({id:'relation-kept',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'});
 const rejected=[{regionId:'region-root',reason:'region-members-incomplete',missing:['relation-kept','relation-kept']}];
 const unresolved=[{id:'relation-kept',detailCode:'patterned-corner-unproven',
  alternativeFailures:[{path:'outline',code:'patterned-corner-unproven'},{path:'outline',code:'patterned-corner-unproven'}]}];
 assert.deepEqual(report(f.plan,f.actual,rejected,unresolved).diagnostics.regions[0].blockers,[
  {kind:'relation-not-materialized',memberId:'relation-kept',sourceChecks:[{path:'outline',code:'patterned-corner-unproven'}]}]);
});
test('normal completion attaches diagnostics while preserving output, exact obligations and failure counts',()=>{
 const f=fixture(),page={shapes:[{id:'a'},{id:'b'}],textBoxes:[],images:[]},before=structuredClone(page);
 const input={page,plan:f.plan,slideSize:{widthPt:200,heightPt:100},preflight:false,
  objects:new Map([['object-a',['a']],['object-b',['b']]]),relations:new Map(),interiorParents:new Set(),recoveries:[],
  unresolved:f.unresolved,labelEvidence:{prepared:0,rejected:[]}};
 const out=complete(input);assert.equal(out.evidence.completed,0);assert.equal(out.evidence.rejected.length,2);
 assert.deepEqual(out.page,before);assert.deepEqual(page,before);
 assert.deepEqual(out.evidence.diagnostics,report(f.plan,f.actual,out.evidence.rejected,f.unresolved).diagnostics);
 assert.equal(out.evidence.coverage.regions.pending,1);
 const staged=complete({...input,preflight:true});assert.equal(staged.evidence.completed,0);
 assert.equal(staged.evidence.diagnostics.editingVerification,'not-assessed');
});
test('member, pictorial, census, program and label causes use fixed categories; unknown text never leaks',()=>{
 const f=fixture();
 f.rejected=[{regionId:'region-root',reason:'private-message',missing:['object-a','object-a:pictorial',
  'observed-containers','observed-icons','source-label-binding','final-label-binding','region-program','secret-user-content']}];
 f.unresolved=[{id:'object-a',reason:'private-message',detailCode:'token-private-content',
  alternativeFailures:[{path:'private-path',code:'private-message'}]}];
 const out=report(f.plan,f.actual,f.rejected,f.unresolved),encoded=JSON.stringify(out);
 assert.equal(encoded.includes('private'),false);assert.equal(encoded.includes('secret-user-content'),false);
 const blockers=out.diagnostics.regions.find(r=>r.regionId==='region-root').blockers;
 assert.deepEqual(blockers.map(b=>b.kind),['object-not-materialized','pictorial-content-not-materialized',
  'observed-inventory-mismatch','observed-inventory-mismatch','label-binding','region-program-missing','unclassified']);
 assert.deepEqual(blockers[0].sourceChecks,[{path:'unspecified',code:'unclassified'}]);
});
test('empty legacy and successful inputs do not acquire an acceptance claim or a failure',()=>{
 const empty={...source,version:1,regions:[],objects:[],relations:[]};
 const actual={objects:new Set(),relations:new Set(),completed:new Set()};
 const out=report(empty,actual,[],[]);assert.equal(out.coverage,null);assert.deepEqual(out.diagnostics.regions,[]);
 assert.equal(out.diagnostics.editingVerification,'not-assessed');
 const f=fixture();delete f.plan.pendingRegionPrograms;f.plan.admission.rejections=[];
 f.plan.observedInventory[0].relations=0;f.plan.regionPrograms.push({regionId:'region-root',objects:['object-a','object-b'],relations:[],labels:[]});
 const input={page:{shapes:[{id:'a'},{id:'b'},{id:'frame'}],textBoxes:[],images:[]},plan:f.plan,slideSize:{widthPt:200,heightPt:100},
  preflight:false,objects:new Map([['object-a',['a']],['object-b',['b']],['region-frame',['frame']]]),relations:new Map(),
  interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:0,rejected:[]}};
 const result=complete(input);assert.equal(result.evidence.completed,2);assert.deepEqual(result.evidence.diagnostics.regions,[]);
 const staged=complete({...input,preflight:true});assert.equal(staged.evidence.staged,2);assert.equal(staged.evidence.completed,0);
 assert.deepEqual(staged.evidence.diagnostics.regions,[]);
});
test('invalid sparse extreme and hostile diagnostic inputs fail safely without invoking accessors',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('sensitive-value');};
 const mutations=[f=>f.rejected=new Array(1),f=>f.rejected=Array(49).fill(f.rejected[0]),
  f=>f.rejected[0].regionId='foreign',f=>f.rejected[0].missing=Array(1025).fill('x'),
  f=>f.rejected[0].missing=[null],f=>f.rejected[0].missing=['x'.repeat(129)],
  f=>f.unresolved=new Array(1),f=>f.unresolved=Array(1025).fill(f.unresolved[0]),
  f=>f.unresolved[0].alternativeFailures=Array(33).fill({}),f=>f.unresolved[0].alternativeFailures=[null],
  f=>f.unresolved[0].alternativeFailures=new Proxy([],{get:trap}),
  f=>f.rejected=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  f=>f.rejected[0]=Object.defineProperty({},'regionId',{get:trap}),
  f=>f.unresolved[0]=Object.defineProperty({},'id',{get:trap}),
  f=>f.unresolved[0].alternativeFailures=[Object.defineProperty({},'code',{get:trap})]];
 for(const mutate of mutations){const f=fixture();mutate(f);
  assert.throws(()=>report(f.plan,f.actual,f.rejected,f.unresolved),e=>e instanceof TypeError&&!e.message.includes('sensitive-value'));
 }
 assert.equal(calls,0);
});
test('completion diagnostic regression file is discovered by unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(row=>path.normalize(row.file)===path.normalize('test/source-scene-completion-diagnostics.test.js')));
});
