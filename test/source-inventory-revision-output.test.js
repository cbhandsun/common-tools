'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const crypto=require('node:crypto');
const {fixture}=require('./helpers/source-inventory-revision.cjs');
const {issueSceneInventoryRevision,withSceneInventoryRevision,effectiveSceneInventoryPlan}=require('../packages/slideclone-core/scene-plan/source-inventory-revision');
const {sealSceneInventoryRevisionDeck,verifySceneInventoryRevisionPage}=require('../packages/slideclone-core/scene-plan/source-inventory-revision-output');
const {buildSceneInventoryEvidence,auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {packSceneInventoryMembers,unpackSceneInventoryMembers}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
const {pendingSceneProgramObligations}=require('../packages/slideclone-core/scene-plan/source-scene-program-obligations');
const {currentSceneAdmissionRejections,validateCompiledRegionPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-region-program');
const {completeRegionPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
const {discoverTestFiles}=require('../scripts/test-sharded');
const {writeSceneInventoryArtifact}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-artifact');
const path=require('node:path');
function receipt(f){return issueSceneInventoryRevision({plan:f.plan,sourceFile:f.sourceFile,regionId:'region-owner',relations:f.relations,confirmationId:'user-complete-test'});}
function output(plan){
 const shapes=plan.relations.map((r,i)=>({id:'shape-'+r.id,type:'line',box:{x:30,y:10+i*20,w:40,h:10},style:{stroke:'#123456'},source:{sceneInventoryId:r.id}}));
 shapes.push({id:'endpoint-left',type:'rect',box:{x:0,y:0,w:30,h:50}},{id:'endpoint-right',type:'rect',box:{x:70,y:0,w:30,h:50}});
 const images=[{id:'image',assetPath:'source.png',box:{x:0,y:70,w:10,h:10}}];
 const textBoxes=[{id:'text',text:'Example',box:{x:40,y:60,w:30,h:10},font:{family:'Arial',sizePt:10}}];
 const inventory=buildSceneInventoryEvidence(plan,shapes,images,[],[]);
 const page={shapes,images,textBoxes,sourceImage:'source.png',tables:[],charts:[],icons:[],background:'#FFFFFF',
  source:{sourceScene:{version:1,sourceHash:plan.sourceHash,unresolved:[],observedInventory:packSceneInventoryMembers(inventory)}}};
 return {deck:{slideSize:{widthPt:100,heightPt:100},pages:[page]},inventory,page};
}
function unverified(deck){return auditNativeComponentQuality(deck).findings.some(f=>f.reason==='inventory-revision-unverified');}

test('normal trusted evidence keeps exact history, ledger debits and codec roundtrip; final output must be sealed',async t=>{
 const f=fixture(t),before=structuredClone(f.plan);
 let persisted;
 await withSceneInventoryRevision(receipt(f),async()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck,inventory,page}=output(plan);
  assert.equal(inventory.version,6);assert.equal(inventory.regions[0].observed.relations,2);
  assert.deepEqual(inventory.relationBatches[0],{id:'global',members:['relation-n201'],reserved:[],rejected:1});
  assert.deepEqual(inventory.inventoryRevision.historical.observedInventory,before.observedInventory);
  assert.deepEqual(inventory.inventoryRevision.historical.admission,before.admission);
  assert.deepEqual(inventory.inventoryRevision.historical.resolvedRegionPrograms,before.resolvedRegionPrograms);
  assert.deepEqual(unpackSceneInventoryMembers(packSceneInventoryMembers(inventory)),inventory);
  assert.ok(unverified(deck));
  sealSceneInventoryRevisionDeck(deck,f.root);
  assert.equal(verifySceneInventoryRevisionPage(page,deck.slideSize),true);
  assert.deepEqual(auditSceneInventory(inventory,page.shapes,page.images,plan.sourceHash,page.textBoxes),[]);
  assert.equal(auditNativeComponentQuality(deck).passed,true);
  persisted=JSON.parse(JSON.stringify(deck));
  assert.equal(auditNativeComponentQuality(persisted).passed,true);
  assert.throws(()=>sealSceneInventoryRevisionDeck(deck,f.root),/final output is unverified/);
 });
 assert.deepEqual(f.plan,before);
 assert.ok(unverified(persisted));
 assert.deepEqual(auditSceneInventory(unpackSceneInventoryMembers(persisted.pages[0].source.sourceScene.observedInventory),persisted.pages[0].shapes,persisted.pages[0].images,f.plan.sourceHash),[{reason:'inventory-revision-unverified'}]);
});

test('revision removes only superseded tasks and rejections, without claiming an old member was repaired',async t=>{
 const f=fixture(t);
 assert.equal(pendingSceneProgramObligations(f.plan).length,1);
 assert.equal(currentSceneAdmissionRejections(f.plan).length,3);
 await withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile);
  assert.deepEqual(pendingSceneProgramObligations(plan),[]);
  assert.deepEqual(currentSceneAdmissionRejections(plan),[{collection:'missingText',index:7,reason:'glyph-source-unit'}]);
  assert.deepEqual(plan.resolvedRegionPrograms,f.plan.resolvedRegionPrograms);
  assert.ok(plan.resolvedRegionPrograms[0].program.relations.includes('relation-n200'));
  assert.deepEqual(validateCompiledRegionPrograms(plan),plan.regionPrograms);
  const {deck}=output(plan);sealSceneInventoryRevisionDeck(deck,f.root);
 });
 assert.equal(pendingSceneProgramObligations(f.plan).length,1);
});

test('relation-only region completion changes evidence only; missing endpoints or relation receipts still fail',async t=>{
 const f=fixture(t);
 const run=(plan,page,objects,relations)=>completeRegionPrograms({page,plan,slideSize:{widthPt:100,heightPt:100},preflight:false,
  objects,relations,interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:3,rejected:[]}});
 await withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck,page}=output(plan),before=structuredClone(page);
  const objects=new Map([['region-left',['endpoint-left']],['region-right',['endpoint-right']]]);
  const relations=new Map(plan.relations.map(r=>[r.id,['shape-'+r.id]]));
  const original=run(f.plan,page,objects,relations);
  assert.ok(original.evidence.rejected.some(r=>r.regionId==='region-owner'));
  const result=run(plan,page,objects,relations);
  assert.equal(result.evidence.completed,3);assert.deepEqual(result.evidence.surfaceLayers.promoted,[]);
  assert.deepEqual(result.page,before);
  for(const missing of ['relation','endpoint']){
   const nodes=new Map(objects),routes=new Map(relations);
   if(missing==='relation')routes.delete(plan.relations[0].id);else nodes.delete('region-left');
   assert.ok(run(plan,page,nodes,routes).evidence.rejected.some(r=>r.regionId==='region-owner'));
  }
  sealSceneInventoryRevisionDeck(deck,f.root);
 });
});

test('JSON markers, deleted evidence, legacy downgrade and changed history cannot reuse a trusted confirmation',async t=>{
 const f=fixture(t);
 await withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck}=output(plan);sealSceneInventoryRevisionDeck(deck,f.root);
  const mutations=[
   d=>{delete d.pages[0].source.sourceScene.observedInventory.evidence.inventoryRevision;},
   d=>{d.pages[0].source.sourceScene.observedInventory.evidence.version=5;delete d.pages[0].source.sourceScene.observedInventory.evidence.inventoryRevision;},
   d=>{delete d.pages[0].source.sourceScene.observedInventory;},
   d=>{delete d.pages[0].source.sourceScene;},
   d=>{delete d.pages[0].source;},
   d=>{d.pages[0].source.sourceScene.observedInventory.evidence.inventoryRevision.historical.observedInventory[0].relations=2;},
   d=>{d.pages[0].source.sourceScene.observedInventory.evidence.relationBatches[0].rejected=0;},
   d=>{d.pages[0].source.sourceScene.observedInventory.evidence.inventoryRevision.revisionId='a'.repeat(64);},
   d=>{d.pages[0].source.sourceScene.observedInventory.evidence.inventoryRevision.historical.resolvedRegionPrograms=[];},
  ];
  for(const change of mutations){const copy=structuredClone(deck);change(copy);assert.ok(unverified(copy));}
 });
});

test('final seal binds every drawing field and order, scene state, dimensions and actual image bytes',async t=>{
 const f=fixture(t);
 await withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck}=output(plan);sealSceneInventoryRevisionDeck(deck,f.root);
  const mutations=[
   d=>{d.pages[0].shapes[0].box.w++;},d=>{d.pages[0].shapes[0].path=[{x:0,y:0}];},
   d=>{d.pages[0].shapes.reverse();},d=>{d.pages[0].shapes[0].source.sceneInventoryId='relation-other';},
   d=>{d.pages[0].textBoxes[0].font.sizePt++;},d=>{d.pages[0].textBoxes[0].text='Changed';},
   d=>{d.pages[0].images[0].box.x++;},d=>{d.pages[0].background='#000000';},
   d=>{d.slideSize.widthPt++;},d=>{d.pages[0].source.sourceScene.unresolved.push({id:'new',reason:'failure'});},
   d=>{d.pages[0].tables.push({id:'table'});},d=>{d.pages[0].charts.push({id:'chart'});},
   d=>{d.pages[0].icons.push({id:'icon'});},
   d=>{d.pages[0].outputEditGroups=[{id:'node',members:['endpoint-left','text']}];},
  ];
  for(const change of mutations){const copy=structuredClone(deck);change(copy);assert.ok(unverified(copy));}
  const bytes=fs.readFileSync(f.sourceFile);fs.writeFileSync(f.sourceFile,Buffer.from('different-image-bytes'));
  assert.ok(unverified(deck));fs.writeFileSync(f.sourceFile,bytes);
  assert.equal(auditNativeComponentQuality(deck).passed,true);
 });
});

test('failed asset and hostile output paths are sanitized and never grant a final seal',async t=>{
 const f=fixture(t);let calls=0;
 const changes=[d=>{d.pages[0].images[0].assetPath='../outside.png';},
  d=>{d.pages[0].images[0].assetPath='missing-private-key.png';},
  d=>{Object.defineProperty(d.pages[0].images[0],'assetPath',{get(){calls++;throw Error('secret-key');}});},
  d=>{d.pages[0].textBoxes=new Proxy([],{get(){calls++;throw Error('secret-key');}});},
  d=>{const rows=new Array(1);rows[Symbol.iterator]=function*(){calls++;throw Error('secret-key');};d.pages[0].images=rows;},
 ];
 for(const change of changes){
  await assert.rejects(withSceneInventoryRevision(receipt(f),()=>{
   const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck}=output(plan);change(deck);
   sealSceneInventoryRevisionDeck(deck,f.root);
  }),error=>error instanceof TypeError&&error.message==='Scene inventory revision final output is unverified');
 }
 assert.equal(calls,0);
});

test('external inventory evidence bytes and the complete delivery manifest remain bound after sealing',async t=>{
 const f=fixture(t);
 await withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck,inventory}=output(plan);
  const manifest=writeSceneInventoryArtifact(f.root,inventory);
  deck.meta={sourceSceneCompilation:{observedInventory:manifest,details:'pages[0].source.sourceScene'}};
  sealSceneInventoryRevisionDeck(deck,f.root);assert.equal(auditNativeComponentQuality(deck).passed,true);
  const clone=structuredClone(deck);clone.meta.sourceSceneCompilation.observedInventory.sha256='a'.repeat(64);
  assert.ok(unverified(clone));
  const missing=structuredClone(deck);delete missing.meta.sourceSceneCompilation;assert.ok(unverified(missing));
  const file=path.join(f.root,manifest.assetPath),bytes=fs.readFileSync(file);
  fs.writeFileSync(file,Buffer.from('changed-inventory-evidence'));assert.ok(unverified(deck));
  fs.writeFileSync(file,bytes);assert.equal(auditNativeComponentQuality(deck).passed,true);
 });
});

test('a self-consistent external asset hash cannot substitute different inventory evidence before the seal',async t=>{
 const f=fixture(t);
 await assert.rejects(withSceneInventoryRevision(receipt(f),()=>{
  const plan=effectiveSceneInventoryPlan(f.plan,f.sourceFile),{deck,inventory}=output(plan);
  const altered=structuredClone(inventory);altered.regions[0].observed.relations++;
  const manifest=writeSceneInventoryArtifact(f.root,altered);
  const bytes=fs.readFileSync(path.join(f.root,manifest.assetPath));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  deck.meta={sourceSceneCompilation:{observedInventory:manifest}};
  sealSceneInventoryRevisionDeck(deck,f.root);
 }),/final output is unverified/);
});

test('revision suites are discoverable by the unified unit and all CI entries',()=>{
 const root=path.resolve(__dirname,'..');
 for(const suite of ['unit','all']){
  const files=discoverTestFiles(root,suite).map(row=>row.file.replaceAll('\\','/'));
  for(const name of ['source-inventory-revision.test.js','source-inventory-revision-output.test.js','source-inventory-revision-snapshot.test.js'])
   assert.ok(files.includes('test/'+name));
 }
});
