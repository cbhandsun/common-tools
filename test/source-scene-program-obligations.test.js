'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {rebindRegionProgramMembers:rebind,retainRegionProgramObligation:retain,currentSceneAdmissionRejections:active}=require('../packages/slideclone-core/source-scene-region-program');
const {pendingSceneProgramObligations:pending,restoreRegionProgramObligations:restore}=require('../packages/slideclone-core/source-scene-program-obligations');
const {initializeSceneObjectBatches:initialize,recordSceneLocalObjectBatch:addObjects}=require('../packages/slideclone-core/source-scene-object-batches');
const {recordSceneLocalRelationBatch:addRelations}=require('../packages/slideclone-core/source-scene-relation-batches');
const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/source-scene-physical-inventory');
const ref='label-'+'1'.repeat(24),hash='a'.repeat(64),box={x:10,y:10,w:20,h:20};
function fixture(withAlias=false){
 const raw={coordinateSpace:'source-pixels',regions:['a','b'].map(id=>({id,parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}})),
  objects:[{id:'first',regionId:'a',kind:'container',box:{...box}},...(withAlias?[{id:'alias',regionId:'a',kind:'container',box:{...box}}]:[])],relations:[],
  programs:[{regionId:'a',objects:['first','lost',...(withAlias?['alias']:[])],relations:[],labels:[{refs:[0],family:'Arial'}]},
   {regionId:'b',objects:[],relations:[],labels:[]}]};
 return admitSourceScenePlan(raw,{sourceHash:hash,widthPx:100,heightPx:100,labelRefs:[ref]});
}
function introduced(p,regionId='region-a',extra=[]){
 const added=[{id:'object-lost',regionId,kind:'container',box:{x:40,y:10,w:20,h:20}},...extra];
 return addObjects(p,{...p,objects:[...p.objects,...added]},added.map(o=>o.id));
}
test('admission retains exact rejected dependencies and labels while independent programs survive',()=>{
 const p=fixture();assert.deepEqual(p.regionPrograms.map(p=>p.regionId),['region-b']);
 assert.equal(p.pendingRegionPrograms.length,1);assert.equal(p.pendingRegionPrograms[0].index,0);
 assert.deepEqual(p.pendingRegionPrograms[0].program,{regionId:'region-a',objects:['object-first','object-lost'],relations:[],labels:[{refs:[ref],family:'Arial'}]});
 assert.equal(p.admission.complete,false);assert.equal(p.admission.rejections[0].detailCode,'program-member');
 assert.equal(pending(p).length,1);assert.equal(rebind(p,p).pendingRegionPrograms.length,1);
});
test('strictly admitted original identities restore the program without clearing history or mutating controls',()=>{
 const p=fixture(),before=structuredClone(p),next=introduced(p),out=rebind(p,next);
 assert.deepEqual(out.regionPrograms.map(p=>p.regionId),['region-b','region-a']);assert.deepEqual(out.pendingRegionPrograms,[]);
 assert.deepEqual(out.regionPrograms[1],p.pendingRegionPrograms[0].program);
 assert.deepEqual(out.admission,p.admission);assert.equal(out.admission.complete,false);assert.deepEqual(p,before);
 assert.equal(next.pendingRegionPrograms.length,1);assert.equal(next.regionPrograms.length,1);
});

test('a pending program resolves charged physical aliases before strict restoration and keeps its original snapshot',()=>{
 const original=fixture(true),snapshot=structuredClone(original.pendingRegionPrograms[0]);
 const reduced=compact(original,[{id:'object-alias',canonicalId:'object-first'}]).plan;
 assert.deepEqual(reduced.pendingRegionPrograms,[snapshot]);
 const out=rebind(reduced,introduced(reduced));
 assert.deepEqual(out.pendingRegionPrograms,[]);
 assert.deepEqual(out.regionPrograms.find(p=>p.regionId==='region-a').objects,['object-first','object-lost']);
 assert.deepEqual(out.resolvedRegionPrograms[0].program,snapshot.program);
 assert.equal(out.objectBatches.batches[0].members.length,2,'both original identities still consume their global slots');
 assert.deepEqual(original.pendingRegionPrograms,[snapshot]);
});

test('a restored program survives later physical compaction without rewriting its dependency history',()=>{
 const original=fixture(true),restored=rebind(original,introduced(original));
 const snapshot=structuredClone(restored.resolvedRegionPrograms),before=structuredClone(restored);
 const out=compact(restored,[{id:'object-alias',canonicalId:'object-first'}]).plan;
 assert.deepEqual(out.resolvedRegionPrograms,snapshot);
 assert.deepEqual(out.regionPrograms.find(p=>p.regionId==='region-a').objects,['object-first','object-lost']);
 assert.deepEqual(out.admission,restored.admission);assert.deepEqual(restored,before);
 assert.deepEqual(active(JSON.parse(JSON.stringify(out))),[]);
});

test('restored aliases cannot use an absent ledger, missing member, changed owner or hostile binding',()=>{
 const original=fixture(true),restored=rebind(original,introduced(original));
 const out=compact(restored,[{id:'object-alias',canonicalId:'object-first'}]).plan;
 let traps=0;const trap=()=>{traps++;throw Error('private-alias');};
 for(const change of [p=>delete p.objectBatches,p=>p.objectBatches.aliases=[],
  p=>p.objects=p.objects.filter(o=>o.id!=='object-first'),p=>p.objectBatches.aliases[0].canonicalId='object-missing',
  p=>p.objects.find(o=>o.id==='object-first').regionId='region-b',p=>p.objectBatches.sourceHash='b'.repeat(64),
  p=>p.objectBatches.aliases=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.objectBatches.aliases[0]=Object.defineProperty({},'canonicalId',{get:trap})]){
  const bad=structuredClone(out);change(bad);
  assert.throws(()=>active(bad),error=>error instanceof TypeError&&!error.message.includes('private-alias'));
 }
 assert.equal(traps,0);
});
test('foreign owners, new identities and omitted current members cannot silently satisfy a dependency',()=>{
 const p=fixture(),foreign=rebind(p,introduced(p,'region-b'));assert.equal(foreign.pendingRegionPrograms.length,1);
 const different=addObjects(p,{...p,objects:[...p.objects,{id:'object-new',regionId:'region-a',kind:'container',box}]},['object-new']);
 assert.equal(rebind(p,different).pendingRegionPrograms.length,1);
 const extra={id:'object-extra',regionId:'region-a',kind:'container',box:{x:70,y:10,w:10,h:10}};
 assert.equal(rebind(p,introduced(p,'region-a',[extra])).pendingRegionPrograms.length,1);
});
test('missing admitted-program arrays do not bypass pending restoration and legacy plans acquire no tasks',()=>{
 const p=fixture();delete p.regionPrograms;const next=introduced(p);
 const out=rebind(p,next);assert.equal(out.regionPrograms.length,1);assert.equal(out.pendingRegionPrograms.length,0);
 const legacy=fixture();delete legacy.pendingRegionPrograms;delete legacy.regionPrograms;
 assert.equal(rebind(legacy,legacy),legacy);
 assert.throws(()=>rebind(legacy,{...legacy,pendingRegionPrograms:[]}),TypeError);
 const original=fixture();assert.throws(()=>rebind(original,{...original,pendingRegionPrograms:structuredClone(original.pendingRegionPrograms)}),TypeError);
});
test('ambiguous pending owner or label claims never pick a first successful winner',()=>{
 for(const conflict of ['owner','label']){
  const p=fixture();p.regionPrograms=[];
  const other=structuredClone(p.pendingRegionPrograms[0]);other.index=1;
  if(conflict==='label'){other.program.regionId='region-b';other.program.objects=[];}
  p.pendingRegionPrograms.push(other);p.admission.rejections.push({...p.admission.rejections[0],index:1});
  const out=rebind(p,introduced(p));assert.equal(out.regionPrograms.length,0);assert.equal(out.pendingRegionPrograms.length,2);
 }
});
test('invalid labels and dependencies are not retained and unexpected internal failures propagate',()=>{
 const p=fixture(),raw={regionId:'region-a',objects:['missing'],relations:[],labels:[{refs:[0]}]},identity=v=>v;
 for(const mutate of [r=>r.objects=['bad id'],r=>r.objects=['missing','missing'],r=>r.objects=Array.from({length:97},(_,i)=>'o'+i),
  r=>r.relations=Array.from({length:49},(_,i)=>'e'+i),r=>r.labels[0].refs=[512],r=>r.labels[0].family='private-value',
  r=>r.labels[0].sizePt=Infinity,r=>r.extra='private-value']){
  const bad=structuredClone(raw);mutate(bad);assert.equal(retain(bad,p,[ref],identity),undefined);
 }
 const failure=new Error('internal-failure');
 assert.throws(()=>restore({...p,objects:[...p.objects,{id:'object-lost',regionId:'region-a'}],objectBatches:undefined},()=>{throw failure;}),e=>e===failure);
});
test('expanded program dependencies use validated existing batches rather than a new allowance',()=>{
 const object=i=>({id:'o'+i,regionId:'root',kind:'container',box}),edge=i=>({id:'e'+i,regionId:'root',fromId:'o0',toId:'o1',direction:'forward'});
 let p=initialize({version:1,sourceHash:hash,widthPx:100,heightPx:100,regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:Array.from({length:64},(_,i)=>object(i)),relations:Array.from({length:24},(_,i)=>edge(i)),regionPrograms:[]});
 const additions=Array.from({length:32},(_,i)=>object(i+64));p=addObjects(p,{...p,objects:[...p.objects,...additions]},additions.map(o=>o.id));
 const relations=Array.from({length:24},(_,i)=>edge(i+24));p=addRelations(p,{...p,relations:[...p.relations,...relations]},relations.map(r=>r.id));
 const raw={regionId:'root',objects:p.objects.map(o=>o.id),relations:p.relations.map(r=>r.id),labels:[]};
 const retained=retain(raw,p,[],v=>v);assert.equal(retained.objects.length,96);assert.equal(retained.relations.length,48);
 p={...p,pendingRegionPrograms:[{index:0,program:retained}],admission:{complete:false,rejections:[{collection:'program',index:0,reason:'program-contract',detailCode:'program-member'}]}};
 assert.equal(rebind(p,p).regionPrograms[0].objects.length,96);
 const legacy={...p};delete legacy.objectBatches;assert.equal(retain(raw,legacy,[],v=>v),undefined);
});
test('malformed, extreme, unbound and hostile pending controls fail without executing getters or traps',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-value');};
 for(const change of [p=>p.pendingRegionPrograms=Array(25).fill(p.pendingRegionPrograms[0]),p=>p.pendingRegionPrograms[0].index=24,
  p=>p.pendingRegionPrograms.push(p.pendingRegionPrograms[0]),p=>p.admission.rejections=[],
  p=>p.pendingRegionPrograms[0].program.objects=['bad id'],p=>p.pendingRegionPrograms[0].program.labels=new Array(1),
  p=>p.pendingRegionPrograms=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.pendingRegionPrograms[0]=Object.defineProperty({},'program',{get:trap}),
  p=>p.pendingRegionPrograms[0].program.labels=[Object.defineProperty({},'refs',{get:trap})],
  p=>p.pendingRegionPrograms[0].program.objects=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap})]){
  const p=fixture();change(p);assert.throws(()=>pending(p),e=>e instanceof TypeError&&!e.message.includes('private-value'));
 }
 const p=fixture();for(const bad of [new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap}),Object.defineProperty({},'labels',{get:trap})])
  assert.equal(retain(bad,p,[],v=>v),undefined);
 assert.equal(calls,0);
});
test('program obligation regressions are discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),path=require('node:path');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(f=>path.normalize(f.file)===path.normalize('test/source-scene-program-obligations.test.js')));
});
