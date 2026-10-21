'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sceneRelationBatches:read,sceneLocalRelationCapacity:capacity,recordSceneLocalRelationBatch:merge,sceneInventoryRelationBatchesValid:valid}=require('../packages/slideclone-core/source-scene-relation-batches');
const base=n=>({version:1,sourceHash:'a'.repeat(64),widthPx:200,heightPx:100,regions:[],objects:[],relations:Array.from({length:n},(_,i)=>({id:'relation-e'+i,regionId:'root',fromId:'a',toId:'b',direction:'forward'}))});

test('rejected proposal counters cannot refresh the local allowance or execute hostile controls',()=>{
 const p=base(0),before=structuredClone(p),used=merge(p,p,[],[],23);
 assert.equal(capacity(used),1);assert.equal(read(used)[1].rejected,23);assert.deepEqual(p,before);
 const full=merge(used,used,[],[],1);assert.equal(capacity(full),0);
 assert.throws(()=>merge(full,full,[],[],1),/capacity/);
 assert.equal(capacity(merge(full,full,[],[])),0);
 const reset={...full};delete reset.relationBatches;
 assert.equal(capacity(merge(full,reset,[],[])),0,'a no-op phase preserves the existing rejection debit');
 for(const n of [-1,25,1.5,NaN,Infinity,'2',{},null])assert.throws(()=>merge(p,p,[],[],n),TypeError);
 const local=structuredClone(used);
 for(const n of [-1,25,1.5,NaN,Infinity,'2',{},null]){
  const q=structuredClone(local);q.relationBatches[1].rejected=n;assert.throws(()=>read(q),TypeError);
 }
 let calls=0;const getter=structuredClone(local);
 Object.defineProperty(getter.relationBatches[1],'rejected',{get(){calls++;throw Error('private');}});
 assert.throws(()=>read(getter),e=>e instanceof TypeError&&!e.message.includes('private'));assert.equal(calls,0);
 const inventory=[{id:'global',members:[],reserved:[]},{id:'local-consensus',members:[],reserved:[],reviewed:[],rejected:24}];
 assert.equal(valid(inventory,[]),true);
 for(const n of [-1,25,1.5,NaN,Infinity,'2',{},null])assert.equal(valid([{...inventory[0]},{...inventory[1],rejected:n}],[]),false);
 const over=structuredClone(inventory);over[1].members=['new'];assert.equal(valid(over,['new']),false);
});

test('global rejections without usable anchors reserve original proposal slots and survive native inventory audit',()=>{
 const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/source-scene-plan');
 const {sceneRelationSlotsUsed:used}=require('../packages/slideclone-core/source-scene-relation-batches');
 const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/source-scene-observed-inventory');
 const scene={format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[['root',null,'section',[0,0,1000,1000]]],inventory:[['root',0,0,2]],objects:[],
  relations:[['bad1','root','missing-a','missing-b','forward',[200,200,300,300]],
   ['bad2','root','missing-a','missing-b','forward',[400,200,500,300]]]};
 const p=admit(scene,{sourceHash:'a'.repeat(64),widthPx:200,heightPx:100});
 assert.equal(p.relations.length,0);assert.equal(used(p),2);assert.equal(read(p)[0].rejected,2);
 const both=merge(p,p,[],[],1);assert.equal(read(both)[0].rejected,2);
 const evidence=build(both,[],[]);assert.equal(evidence.relationBatches[0].rejected,2);
 assert.ok(audit(evidence,[],[],p.sourceHash).some(f=>f.reason==='relation-rejected-missing'&&f.count===2));
 const forged=structuredClone(both);forged.relationBatches[0].rejected=0;assert.throws(()=>read(forged),/binding/);
 const duplicate=structuredClone(p);duplicate.admission.rejections.push(duplicate.admission.rejections[0]);
 assert.throws(()=>read(duplicate),TypeError);
});

test('one global batch and one paired consensus batch account for every relation and reserve repair proposal slots',()=>{
 const original=base(24),before=structuredClone(original),added=[{...original.relations[0],id:'relation-new'}];
 const repaired=merge(original,original,[],['relation-e0','relation-e1']);assert.equal(capacity(repaired),22);
 const result=merge(repaired,{...repaired,relations:[...repaired.relations,...added]},['relation-new']);
 assert.deepEqual(read(result).map(b=>[b.id,b.members.length,b.reviewed?.length??0]),[['global',24,0],['local-consensus',1,2]]);
 assert.equal(result.relations.length,25);assert.equal(capacity(result),21);assert.deepEqual(original,before);
 const twice=merge(result,result,[],['relation-e0']);assert.equal(capacity(twice),21,'re-reading one existing proposal cannot invent another batch');
 const overflow=Array.from({length:22},(_,i)=>({...added[0],id:'extra-'+i}));
 assert.throws(()=>merge(result,{...result,relations:[...result.relations,...overflow]},overflow.map(r=>r.id)),/capacity/);
 const full=merge(original,{...original,relations:[...original.relations,...Array.from({length:24},(_,i)=>({...added[0],id:'extra-'+i}))]},Array.from({length:24},(_,i)=>'extra-'+i));
 assert.equal(full.relations.length,48);assert.equal(capacity(full),0);assert.equal(read(full).length,2);
 assert.throws(()=>read(base(25)),/identities/,'legacy inputs do not silently acquire an expanded whole-page budget');
});

test('ledger rejects missing, duplicate, foreign, oversized, third and forged batches without invoking accessors',()=>{
 const p=base(2);p.relationBatches=[{id:'global',members:p.relations.map(r=>r.id)}];
 for(const change of [q=>q.relationBatches=[],q=>q.relationBatches[0].members.pop(),q=>q.relationBatches[0].members.push('foreign'),
  q=>q.relationBatches[0].members.push(q.relations[0].id),q=>q.relationBatches[0].reviewed=[],
  q=>q.relationBatches.push({id:'global',members:[]}),q=>q.relationBatches.push({id:'third',members:[]}),
  q=>q.relationBatches.push({id:'local-consensus',members:[],reviewed:['foreign']}),q=>q.relationBatches[0].members=new Array(2)]){
  const q=structuredClone(p);change(q);assert.throws(()=>read(q),TypeError);
 }
 let calls=0;const q=structuredClone(p);Object.defineProperty(q.relationBatches[0],'members',{get(){calls++;throw Error('private');}});
 assert.throws(()=>read(q),e=>e instanceof TypeError&&!e.message.includes('private'));assert.equal(calls,0);
 assert.throws(()=>read({...p,relationBatches:new Proxy(p.relationBatches,{})}),TypeError);
 for(const value of [null,new Proxy(p,{get(){calls++;throw Error('private');}}),{get relations(){calls++;throw Error('private');}}])
  assert.throws(()=>read(value),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);
 assert.equal(capacity(undefined,24),0);for(const n of [-1,25,NaN,Infinity,'2'])assert.throws(()=>capacity(p,n),RangeError);
});

test('native inventory cannot hide real relations, reserved failures or extra allowances behind a serialized ledger',()=>{
 const ids=Array.from({length:26},(_,i)=>'relation-'+i),ledger=[{id:'global',members:ids.slice(0,24),reserved:[]},
  {id:'local-consensus',members:ids.slice(24),reserved:[],reviewed:[]}];
 assert.equal(valid(ledger,ids),true);
 for(const change of [q=>q[0].members.pop(),q=>q[1].members.push(ids[0]),q=>q.push({id:'third',members:[],reserved:[]}),
  q=>q[1].reviewed=ids.slice(0,23),q=>q[1].reserved=['secret'],q=>q[0].reserved=[ids[25]],q=>q[1].members.push('foreign')]){
  const q=structuredClone(ledger);change(q);assert.equal(valid(q,ids),false);
 }
 const held=structuredClone(ledger);held[0].members.pop();held[0].reserved=[ids[23]];
 assert.equal(valid(held,ids.filter(id=>id!==ids[23])),true,'reserved controls remain declared and will fail materialization audit');
 let calls=0;const q={get members(){calls++;throw Error('private');}};assert.equal(valid([q],[]),false);assert.equal(calls,0);
});

test('26 source arrows pass from the original three planner phases into 26 actual native connections without new scans or object slots',async t=>{
 const {writePng}=require('../packages/slideclone-core/png'),{createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler'),{auditSceneInventory}=require('../packages/slideclone-core/source-scene-observed-inventory');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-26-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {image,scene}=require('./helpers/scene-arrow-chain.cjs').sourceArrowChain();
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.regionRelationCapacity,24);assert.equal(request.localTargets.regionObjectCapacity,0);
  assert.equal(request.localTargets.regionInventories.length,1);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:(request.localTargets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   inventories:(request.localTargets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   regionInventories:request.localTargets.regionInventories.map(index=>({index,units:[],relations:[
    {from:'object-n24',to:'object-n25',direction:'forward'},{from:'object-n25',to:'object-n26',direction:'forward'}]}))};
 }} )({root,sourceFile,dimensions:{widthPx:1640,heightPx:100},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.plan.objects.length,27);assert.equal(result.plan.relations.length,26);
 assert.deepEqual(read(result.plan).map(b=>b.members.length),[24,2]);assert.equal(result.plan.observedInventory[0].relations,26);
 const compiled=compileSourceScene({root,sourceFile,plan:result.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:1640,heightPt:100}});
 assert.equal(compiled.evidence.resolvedRelations,26,JSON.stringify(compiled.evidence.unresolved));assert.equal(compiled.evidence.containers,27);
 assert.equal(compiled.page.images.length,0);assert.ok(compiled.evidence.sourceScanPixels<=4000000);assert.ok(compiled.evidence.glyphOwnedPixels<=100000);
 assert.equal(compiled.evidence.observedInventory.version,4);
 assert.deepEqual(auditSceneInventory(compiled.evidence.observedInventory,compiled.page.shapes,compiled.page.images,result.plan.sourceHash),[]);
 const arrows=compiled.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');assert.equal(arrows.length,26);
 const nodeIds=new Set(compiled.page.shapes.filter(s=>s.source?.detector==='source-scene-container'||s.source?.detector==='source-scene-outline').map(s=>s.id));
 assert.ok(arrows.every(s=>s.source.editable&&nodeIds.has(s.style.startAnchor?.elementId)&&nodeIds.has(s.style.endAnchor?.elementId)));
 const missing=compiled.page.shapes.filter(s=>s!==arrows[25]);assert.ok(auditSceneInventory(compiled.evidence.observedInventory,missing,[],result.plan.sourceHash).some(f=>f.reason==='compile-missing'));
 const counterfeit=structuredClone(compiled.evidence.observedInventory);delete counterfeit.relationBatches;
 assert.equal(auditSceneInventory(counterfeit,compiled.page.shapes,[],result.plan.sourceHash)[0].reason,'evidence-invalid');
});

test('new batch and rejection regressions are discovered by the unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])for(const name of ['source-scene-relation-batches.test.js','source-scene-rejected-relations.test.js'])
  assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/'+name)));
});

test('batch context binds scheduling and complete regional programs to the same real relation inventory',()=>{
 const {orderSourceSceneProposals}=require('../packages/slideclone-core/source-scene-proposal-order');
 const {prepareRegionProgramLabels}=require('../packages/slideclone-core/source-scene-region-program');
 const original=base(24),added=Array.from({length:2},(_,i)=>({...original.relations[0],id:'relation-extra-'+i}));
 const p=merge(original,{...original,relations:[...original.relations,...added]},added.map(r=>r.id));
 p.regions=[{id:'root',kind:'section',parentId:null,box:{x:0,y:0,w:200,h:100}}];
 p.regionPrograms=[{regionId:'root',objects:[],relations:p.relations.map(r=>r.id),labels:[]}];
 assert.deepEqual(orderSourceSceneProposals([],[],p.relations,p),[]);
 assert.throws(()=>orderSourceSceneProposals([],[],structuredClone(p.relations),p),/binding/);
 assert.equal(prepareRegionProgramLabels({textBoxes:[]},p,{widthPt:200,heightPt:100}).evidence.prepared,1);
 const incomplete=structuredClone(p);incomplete.regionPrograms[0].relations.pop();
 assert.throws(()=>prepareRegionProgramLabels({textBoxes:[]},incomplete,{widthPt:200,heightPt:100}),/incomplete/);
 const legacy=structuredClone(p);delete legacy.relationBatches;
 assert.throws(()=>prepareRegionProgramLabels({textBoxes:[]},legacy,{widthPt:200,heightPt:100}),/identities/);
});

test('overlapping missing text cannot erase quarantined source controls or their original global slots',async t=>{
 const {writePng}=require('../packages/slideclone-core/png'),{createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const {sceneRejectedRelationCandidates}=require('../packages/slideclone-core/source-scene-rejected-relations');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-controls-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:200,height:100,rgba:Buffer.alloc(200*100*4,255)});let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:95,h:100}},{id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:100,h:100}}],
  objects:[{id:'a',regionId:'left',kind:'container',pictorialContent:'absent',box:{x:10,y:20,w:60,h:60}},
   {id:'b',regionId:'right',kind:'container',pictorialContent:'absent',box:{x:120,y:20,w:60,h:60}}],
  relations:[{id:'edge',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:72,y:32,w:46,h:6}}]};
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[{box_2d:[200,50,400,150],text:'visible',confidence:.99}]};
  const q=request.localTargets;assert.equal(q.relations.length,1);
  return {reviews:[],recoveredText:q.missing.map(index=>({index,text:null,confidence:0})),
   relations:q.relations.map(index=>({index,fromId:null,toId:null,direction:'unknown',confidence:0})),
   structures:(q.structures??[]).map(index=>({index,kind:'unknown',regionId:null,box_2d:null,confidence:0})),
   inventories:(q.inventories??[]).map(index=>({index,kind:'unknown',regionId:null,box_2d:null,confidence:0}))};
 }} )({root,sourceFile,dimensions:{widthPx:200,heightPx:100},ocr:{lines:[{text:'visible',confidence:.99,box:{x:10,y:20,w:20,h:20}}]},isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(sceneRejectedRelationCandidates(result.plan).length,1);
 assert.ok(result.plan.admission.rejections.some(r=>r.collection==='missingText'));
 assert.ok(result.plan.admission.rejections.some(r=>r.detailCode==='relation-anchor-scope'));
 assert.deepEqual(read(result.plan).map(b=>[b.id,b.members.length,b.reviewed?.length??0]),[['global',1,0],['local-consensus',0,1]]);
});
