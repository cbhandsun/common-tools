'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers/source-inventory-revision.cjs');
const {issueSceneInventoryRevision:issue,withSceneInventoryRevision:withRevision,effectiveSceneInventoryPlan:effective,
 sceneInventoryRevisionForPlan:forPlan,currentSceneInventoryRevision:current,markSceneInventoryRevisionSealed:seal}=require('../packages/slideclone-core/scene-plan/source-inventory-revision');
const {inventoryRevisionSnapshot:snapshot}=require('../packages/slideclone-core/scene-plan/source-inventory-revision-snapshot');
const request=(f,plan=f.plan,relations=f.relations)=>({plan,sourceFile:f.sourceFile,regionId:'region-owner',relations,confirmationId:'user-complete-test'});

test('explicit host confirmation changes only the active census and retains immutable full history',async t=>{
 const f=fixture(t),before=structuredClone(f.plan),receipt=issue(request(f));
 assert.deepEqual(receipt,{});assert.ok(Object.isFrozen(receipt));assert.equal(current(),undefined);
 assert.equal(effective(f.plan),f.plan);assert.equal(forPlan(f.plan),undefined);
 const result=await withRevision(receipt,async()=>{
  const active=current();assert.ok(active);assert.ok(Object.isFrozen(active.runToken));assert.equal(forPlan(f.plan),undefined);
  const view=effective(f.plan,f.sourceFile),revision=forPlan(view);
  assert.ok(revision);assert.equal(view.observedInventory[0].relations,2);assert.equal(f.plan.observedInventory[0].relations,3);
  assert.equal(revision.parentPlanHash,snapshot(before));assert.equal(revision.sourceHash,f.plan.sourceHash);
  assert.equal(revision.supersededProgramIndex,0);assert.deepEqual(revision.supersededRelationRejection,before.admission.rejections[0]);
  for(const key of ['observedInventory','pendingRegionPrograms','resolvedRegionPrograms','admission','objectBatches','relationBatches']){
   assert.deepEqual(revision.historical[key],before[key]);
   if(key!=='observedInventory')assert.deepEqual(view[key],before[key]);
  }
  const expected=structuredClone(before);expected.observedInventory[0].relations=2;assert.deepEqual(view,expected);
  assert.ok(Object.isFrozen(view));assert.ok(Object.isFrozen(view.relations[0].shaftBox));assert.ok(Object.isFrozen(revision.historical.admission.rejections));
  assert.throws(()=>{view.relations[0].shaftBox.x=99;},TypeError);
  await Promise.resolve();assert.equal(current().runToken,active.runToken);
  assert.equal(forPlan(structuredClone(view)),revision);assert.equal(effective(view),view);seal();return 42;
 });
 assert.equal(result,42);assert.deepEqual(f.plan,before);assert.equal(current(),undefined);
 await assert.rejects(withRevision(receipt,()=>{}),/receipt is invalid/);
});

test('serialized, copied and invented receipts cannot activate a revision',async t=>{
 const f=fixture(t),receipt=issue(request(f));
 for(const invalid of [undefined,null,{},JSON.parse(JSON.stringify(receipt)),structuredClone(receipt),Object.create(receipt),new Proxy(receipt,{})])
  await assert.rejects(withRevision(invalid,()=>{}),/receipt is invalid/);
 await withRevision(receipt,()=>{effective(f.plan,f.sourceFile);seal();});
});

test('the declared relation manifest is a complete unordered set of exact current cores',async t=>{
 const f=fixture(t),receipt=issue(request(f,f.plan,[...f.relations].reverse()));
 await withRevision(receipt,()=>{const view=effective(f.plan,f.sourceFile);assert.deepEqual(forPlan(view).relations,f.relations);seal();});
 for(const relations of [[],[f.relations[0]],[f.relations[0],f.relations[0]],Array(49).fill(f.relations[0]),
  f.relations.map((row,index)=>index?row:{...row,id:'relation-renamed'}),
  f.relations.map((row,index)=>index?row:{...row,fromId:row.toId,toId:row.fromId}),
  f.relations.map((row,index)=>index?row:{...row,shaftBox:{...row.shaftBox,x:31}}),
  f.relations.map((row,index)=>index?row:{...row,visiblePath:[]} )])assert.throws(()=>issue(request(f,f.plan,relations)),TypeError);
});

test('unknown, unsafe and illegal relation data cannot acquire count authority',t=>{
 const f=fixture(t);
 for(const patch of [{direction:'unknown'},{direction:{toString(){throw Error('private-content');}}},{regionId:'region-other'},
  {fromId:'bad id'},{toId:f.relations[0].fromId},{shaftBox:null},{shaftBox:{x:0,y:0,w:0,h:1}},
  {shaftBox:{x:0,y:0,w:Infinity,h:1}},{shaftBox:{x:-1,y:0,w:1,h:1}},{shaftBox:{...f.relations[0].shaftBox,extra:1}}]){
  const relations=structuredClone(f.relations);Object.assign(relations[0],patch);
  assert.throws(()=>issue(request(f,f.plan,relations)),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 }
});

test('scope, census and original identities cannot be weakened before confirmation',t=>{
 const f=fixture(t);
 for(const change of [p=>{p.regions[0].kind='section';},p=>{p.observedInventory[0].relations=2;},p=>{p.observedInventory[0].relations=4;},
  p=>{p.observedInventory[0].relations=null;},p=>{p.observedInventory[0].containers=1;},p=>{p.observedInventory[0].icons=1;},
  p=>{p.observedInventory.push({...p.observedInventory[0]});},p=>{p.regionPrograms[0].objects=['absent'];},
  p=>{p.resolvedRegionPrograms[0].program.relations=['relation-n201'];},
  p=>{p.resolvedRegionPrograms[0].program.relations=['relation-unknown','relation-n201'];},
  p=>{p.resolvedRegionPrograms[0].program.relations=['relation-n200','relation-absent','relation-n201'];},
  p=>{p.resolvedRegionPrograms[0].program.regionId='region-left';},p=>{p.resolvedRegionPrograms=[];},
  p=>{p.pendingRegionPrograms=[{index:0,program:p.resolvedRegionPrograms[0].program}];}]){
  const plan=structuredClone(f.plan);change(plan);assert.throws(()=>issue(request(f,plan)),TypeError);
 }
});

test('exact remaining rejection and all reserved or consumed slots stay binding',t=>{
 const f=fixture(t);
 for(const change of [p=>{p.admission.rejections[0].detailCode='relation-anchor-scope';},p=>{p.admission.rejections[0].index=1;},
  p=>{p.admission.rejections[1].detailCode='program-inventory-incomplete';},p=>{p.admission.rejections[1].index=1;},
  p=>{p.admission.rejections.shift();},p=>{p.admission.rejections.push({...p.admission.rejections[0]});},
  p=>{p.relationBatches[0].rejected=0;},p=>{p.relationBatches[0].members.push('relation-n200');},
  p=>{p.relationBatches[1].reviewed=Array(24).fill('relation-n201');},p=>{p.objectBatches.batches[0].rejected=1;}]){
  const plan=structuredClone(f.plan);change(plan);assert.throws(()=>issue(request(f,plan)),TypeError);
 }
});

test('the parent and view fingerprints include unrelated history, budgets and every drawable control',async t=>{
 const f=fixture(t),receipt=issue(request(f));
 await withRevision(receipt,()=>{
  const view=effective(f.plan,f.sourceFile);
  for(const change of [p=>{p.admission.rejections.pop();},p=>{p.admission.rejections[2].index++;},
   p=>{p.relationBatches[1].reviewed=[];},p=>{p.objectBatches.aliases.push({id:'a',canonicalId:'b'});},
   p=>{p.resolvedRegionPrograms=[];},p=>{delete p.pendingRegionPrograms;},p=>{p.relations[0].shaftBox.x++;},
   p=>{p.regions[1].box.x++;},p=>{p.widthPx++;},p=>{p.extra=true;},p=>{p.observedInventory[1].relations=1;}]){
   const bad=structuredClone(view);change(bad);assert.throws(()=>forPlan(bad),/plan binding is invalid/);
   assert.throws(()=>effective(bad),/plan binding is invalid/);
  }
  seal();
 });
});

test('only the exact no-alias compiler membership ordering is an additional read-only view',async t=>{
 const f=fixture(t,{extraRelation:true}),ids=f.plan.regionPrograms[0].relations;
 ids.unshift(ids.pop()); // Original program starts with the later regional proposal.
 const before=structuredClone(f.plan),receipt=issue(request(f));
 await withRevision(receipt,()=>{
  const view=effective(f.plan,f.sourceFile),revision=forPlan(view);
  const compiled={...view,regionPrograms:view.regionPrograms.map(program=>({...program,
   objects:view.objects.filter(row=>row.regionId===program.regionId).map(row=>row.id),
   relations:view.relations.filter(row=>row.regionId===program.regionId).map(row=>row.id)}))};
  assert.notEqual(snapshot(compiled),snapshot(view));assert.equal(forPlan(compiled),revision);
  assert.deepEqual(compiled.observedInventory,view.observedInventory);
  assert.deepEqual(compiled.admission,view.admission);assert.deepEqual(compiled.resolvedRegionPrograms,view.resolvedRegionPrograms);
  assert.throws(()=>effective(compiled,f.sourceFile),/plan binding is invalid/,'derived output cannot reenter the compiler');
  for(const change of [p=>{p.regionPrograms[0].relations=['relation-n202','relation-n201','relation-regional-0-0'];},
   p=>{p.regionPrograms[0].relations.pop();},p=>{p.regionPrograms[0].objects=['object-invented'];},
   p=>{p.regionPrograms[0].labels=[{refs:['label-'+'a'.repeat(24)],weight:'bold'}];},
   p=>{p.regionPrograms.reverse();},p=>{p.objectBatches.aliases.push({id:'object-old',canonicalId:'object-new'});},
   p=>{p.admission.rejections.pop();}]){
   const bad=structuredClone(compiled);change(bad);assert.throws(()=>forPlan(bad),/plan binding is invalid/);
  }
  seal();
 });
 assert.deepEqual(f.plan,before);
});

test('real source bytes are checked at issuance and each source-bound compile entry',async t=>{
 const f=fixture(t),receipt=issue(request(f));
 assert.throws(()=>issue({...request(f),sourceFile:path.join(f.root,'absent.png')}),e=>e instanceof TypeError&&!e.message.includes(f.root));
 fs.writeFileSync(f.sourceFile,Buffer.from('replacement source'));
 assert.throws(()=>issue(request(f)),/source is invalid/);
 await assert.rejects(withRevision(receipt,()=>effective(f.plan,f.sourceFile)),/source is invalid/);
 assert.equal(current(),undefined);
});

test('issuer decodes the same hashed source bytes and rejects non-PNG or incorrect dimensions',t=>{
 const dimensions=fixture(t);dimensions.plan.widthPx=101;dimensions.plan.objectBatches.widthPx=101;
 dimensions.plan.resolvedRegionPrograms[0].widthPx=101;
 assert.throws(()=>issue(request(dimensions)),/source is invalid/);
 const invalid=fixture(t);fs.writeFileSync(invalid.sourceFile,Buffer.from('private-content-invalid-png'));
 const hash=crypto.createHash('sha256').update(fs.readFileSync(invalid.sourceFile)).digest('hex');
 invalid.plan.sourceHash=hash;invalid.plan.objectBatches.sourceHash=hash;invalid.plan.resolvedRegionPrograms[0].sourceHash=hash;
 assert.throws(()=>issue(request(invalid)),e=>e instanceof TypeError&&e.message==='Scene inventory revision source is invalid');
});

test('confirmation controls reject empty, foreign, hostile and extreme inputs without invoking accessors',t=>{
 const f=fixture(t);let traps=0;const trap=()=>{traps++;throw Error('private-content');};
 const hostile=Object.defineProperty({},'plan',{get:trap,enumerable:true});
 for(const value of [undefined,null,{},hostile,new Proxy(request(f),{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  {...request(f),confirmationId:''},{...request(f),confirmationId:'user content with spaces'},
  {...request(f),confirmationId:'x'.repeat(129)},{...request(f),extra:true},
  {...request(f),relations:new Array(2)}, {...request(f),sourceFile:{toString:trap}}])
  assert.throws(()=>issue(value),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 assert.equal(traps,0);
});

test('a run cannot succeed without effective consumption and the trusted final seal',async t=>{
 const f=fixture(t);
 await assert.rejects(withRevision(issue(request(f)),()=>{}),/run is incomplete/);
 await assert.rejects(withRevision(issue(request(f)),()=>effective(f.plan,f.sourceFile)),/run is incomplete/);
 await assert.rejects(withRevision(issue(request(f)),()=>seal()),/seal is unavailable/);
 assert.throws(()=>seal(),/seal is unavailable/);
});

test('a self-constructed view cannot activate supersession before effective consumption',async t=>{
 const f=fixture(t),view=structuredClone(f.plan);view.observedInventory[0].relations=2;
 await withRevision(issue(request(f)),()=>{
  assert.throws(()=>forPlan(view),/plan binding is invalid/);assert.equal(forPlan(f.plan),undefined);
  effective(f.plan,f.sourceFile);assert.ok(forPlan(view));seal();
 });
});

test('callback failures are preserved and cannot leave a reusable or live capability',async t=>{
 const f=fixture(t),receipt=issue(request(f)),failure=new Error('callback sentinel');
 await assert.rejects(withRevision(receipt,()=>{effective(f.plan,f.sourceFile);throw failure;}),error=>error===failure);
 await assert.rejects(withRevision(receipt,()=>{}),/receipt is invalid/);assert.equal(current(),undefined);
});

test('nested contexts and host reissuance are forbidden without corrupting the outer run',async t=>{
 const f=fixture(t),first=issue(request(f)),second=issue(request(f));
 await withRevision(first,async()=>{
  const token=current().runToken;await assert.rejects(withRevision(second,()=>{}),/cannot nest/);
  assert.throws(()=>issue(request(f)),/cannot nest/);assert.equal(current().runToken,token);
  effective(f.plan,f.sourceFile);seal();
 });
 await withRevision(second,()=>{effective(f.plan,f.sourceFile);seal();});
});

test('independent asynchronous runs have distinct tokens and do not share active plans',async t=>{
 const first=fixture(t),second=fixture(t),a=issue(request(first)),b=issue(request(second));
 const tokens=await Promise.all([[a,first],[b,second]].map(async([receipt,f])=>withRevision(receipt,async()=>{
  const token=current().runToken;effective(f.plan,f.sourceFile);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(current().runToken,token);seal();return token;
 })));
 assert.notEqual(tokens[0],tokens[1]);assert.equal(current(),undefined);
});

test('detached asynchronous work cannot reuse a closed run context',async t=>{
 const f=fixture(t);let release,later;
 await withRevision(issue(request(f)),()=>{
  const gate=new Promise(resolve=>{release=resolve;});later=gate.then(()=>current());
  effective(f.plan,f.sourceFile);seal();
 });
 release();await assert.rejects(later,/context is unavailable/);
});

test('expired confirmation receipts fail before callback execution',async t=>{
 const f=fixture(t),receipt=issue(request(f)),now=Date.now();let calls=0;
 t.mock.method(Date,'now',()=>now+31*60*1000);
 await assert.rejects(withRevision(receipt,()=>{calls++;}),/receipt is invalid/);assert.equal(calls,0);
});

test('revision regressions are included in the unified unit suite',()=>{
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});
