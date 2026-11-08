'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectRegionalInventoryTargets:select,applyRegionalInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {sceneAdmissionHistory:history,recordSceneCensusDiscoveries:record}=require('../packages/slideclone-core/scene-plan/source-scene-admission-history');
const {sceneProgramRelationObservation:observed}=require('../packages/slideclone-core/scene-plan/source-scene-program-obligations');
const {readSceneCensusDiscoveries:read,allocatedSceneRelationObservation:allocate}=require('../packages/slideclone-core/scene-plan/source-scene-census-discovery-history');
const {buildSceneInventoryEvidence:inventory,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
function fixture(count=1){return {version:1,sourceHash:'a'.repeat(64),widthPx:300,heightPx:200,
 regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:200}},
  {id:'overlay',parentId:'root',kind:'diagram',box:{x:10,y:10,w:280,h:170}}],
 objects:[{id:'left',regionId:'root',kind:'container',pictorialContent:'absent',box:{x:30,y:60,w:30,h:25}},
  {id:'right',regionId:'root',kind:'container',pictorialContent:'absent',box:{x:210,y:60,w:30,h:25}}],relations:[],
 observedInventory:[{regionId:'root',containers:2,icons:0,relations:0},{regionId:'overlay',containers:0,icons:0,relations:count}]};}
function discover(plan=fixture()){
 const target={...select(plan,32,0).find(t=>t.scopeDiscovery),index:9};
 const rows=[{index:9,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox:{x:60,y:65,w:150,h:15}}]}];
 return apply(plan,[target],[rows,structuredClone(rows)]).plan;
}
test('new identities retain a separate persisted provenance ledger and allocate an unchanged census exactly once',()=>{
 const plan=fixture(),before=structuredClone(plan),out=discover(plan),h=history(out);
 assert.deepEqual(h.relations,[],'no original tuple repair is fabricated');assert.equal(h.scopeDiscoveries[0].relations.length,1);
 assert.deepEqual(out.observedInventory,plan.observedInventory);assert.deepEqual(plan,before);
 assert.equal(observed(out,'overlay'),0);assert.equal(observed(out,'root'),1);
 assert.equal(select(out,32,0).some(t=>t.scopeDiscovery),false);
 const saved=JSON.parse(JSON.stringify(out));assert.equal(observed(saved,'root'),1);assert.deepEqual(history(saved),h);
 const partial=discover(fixture(2));assert.equal(observed(partial,'overlay'),1);assert.equal(observed(partial,'root'),1);
});
test('independent serialized inventory validates original counts, exact local members and every emitted output',()=>{
 const plan=discover(),shapes=[...plan.objects,...plan.relations].map((row,index)=>({id:'native-'+index,source:{sceneInventoryId:row.id}}));
 const evidence=inventory(plan,shapes,[]);assert.deepEqual(audit(evidence,shapes,[],plan.sourceHash),[]);
 assert.notDeepEqual(audit(evidence,shapes.slice(0,2),[],plan.sourceHash),[]);
 for(const mutate of [e=>e.regions.find(r=>r.regionId==='root').observed.relations=0,
  e=>e.regions.find(r=>r.regionId==='overlay').observed.relations=1,e=>e.admissionHistory.scopeRelationObservations[1].relations=0,
  e=>e.admissionHistory.scopeDiscoveries[0].relations[0].id='missing',e=>e.admissionHistory.scopeDiscoveries.push(structuredClone(e.admissionHistory.scopeDiscoveries[0])),
  e=>delete e.admissionHistory.scopeRelationObservations]){
  const invalid=structuredClone(evidence);mutate(invalid);assert.notDeepEqual(audit(invalid,shapes,[],plan.sourceHash),[]);
 }
});
test('new discoveries and original owner repairs share one conserved allocation without applying the old repair twice',()=>{
 const current=[{regionId:'root'},{regionId:'root'},{regionId:'root'}],repairs=[{regionId:'root',previousRegionId:'overlay'}];
 const d=history(discover()).scopeDiscoveries[0],discoveries=[{control:d.control,relations:[d.relations[0],{...d.relations[0],id:'second'}]}];
 for(const original of [[{regionId:'root',relations:1},{regionId:'overlay',relations:2}],
  [{regionId:'root',relations:0},{regionId:'overlay',relations:3}]]){
  assert.equal(allocate(original,current,repairs,discoveries,'root'),3);
  assert.equal(allocate(original,current,repairs,discoveries,'overlay'),0);
 }
 const unknown=[{regionId:'root',relations:null},{regionId:'overlay',relations:3}];
 assert.equal(allocate(unknown,current,repairs,discoveries,'root'),null);assert.equal(allocate(unknown,current,repairs,discoveries,'overlay'),null);
 assert.throws(()=>allocate([{regionId:'root',relations:0},{regionId:'overlay',relations:1}],current,repairs,discoveries,'root'),/census transfer/);
});
test('source, counts, hierarchy, endpoints, local attempt identities and shaft changes revoke the persisted discovery',()=>{
 const out=discover();
 for(const mutate of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx++,p=>p.objects[0].box.x++,p=>p.regions[1].parentId='overlay',
  p=>p.observedInventory[1].relations=2,p=>p.relations[0].fromId='right',p=>p.relations[0].shaftBox.x++,p=>p.relations=[],
  p=>p.relationBatches.find(b=>b.id==='local-consensus').members=[],p=>p.admission.history.scopeDiscoveries[0].relations.push({...p.admission.history.scopeDiscoveries[0].relations[0],id:'extra'})]){
  const invalid=structuredClone(out);mutate(invalid);assert.throws(()=>history(invalid),TypeError);
 }
 const existing=structuredClone(out),entry=history(existing).scopeDiscoveries[0];
 assert.throws(()=>record(existing,existing,[{control:entry.control,ids:[entry.relations[0].id]}]),/new identity/);
});
test('empty, malformed, excessive and hostile discovery inputs never execute accessors or expose their content',()=>{
 const out=discover(),h=history(out);assert.deepEqual(read(undefined,out.sourceHash,300,200),[]);
 let invoked=0;const marker='private-scope-content',trap=()=>{invoked++;throw new Error(marker);};
 for(const value of [null,{},Array(25).fill(null),new Proxy(h.scopeDiscoveries,{get:trap,ownKeys:trap}),
  [{get control(){return trap();},relations:[]}], [{control:{get sourceHash(){return trap();}},relations:[{}]}]]){
  assert.throws(()=>read(value,out.sourceHash,300,200),e=>e instanceof TypeError&&!e.message.includes(marker));
 }
 const hostileNext={get relations(){return trap();}};assert.throws(()=>record(fixture(),hostileNext,[]),TypeError);assert.equal(invoked,0);
});
test('the discovery ledger ships and all its regression cases enter unified CI',()=>{
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-census-discovery-history.js'));
});
