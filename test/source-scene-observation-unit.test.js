'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceScenePlan:parse,admitSourceScenePlan:admit}=require('../packages/slideclone-core/source-scene-plan');
const source={sourceHash:'a'.repeat(64),widthPx:1000,heightPx:1000,labelRefs:[]};
function proposals(){
 const normal={coordinateSpace:'source-pixels',regions:[{id:0,parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:1000}}],
  inventory:[[0,0,0,0]],objects:[],relations:[]};
 const result=[normal];
 for(let n=1;n<=8;n++){
  const corners=n>=2,program=n>=6;
  result.push({format:'compact-v'+n,coordinateSpace:'normalized-1000',...(corners?{boxFormat:'ymin-xmin-ymax-xmax'}:{}),
   regions:[[0,null,n===8?0:'section',[0,0,1000,1000]]],inventory:[[0,0,0,0]],objects:[],relations:[],
   ...(program?{programs:n===8?[[0,[]]]:[{regionId:0,objects:[],relations:[],labels:[]}]}:{})});
 }
 result.push({format:'packed-v1',regions:[[null,0,[0,0,1000,1000],[0,0,0]]],objects:[],relations:[],programs:[[]]});
 return result;
}
test('an explicit observation unit survives all existing plan transports and safe admission without rewriting legacy counts',()=>{
 for(const raw of proposals()){
  const legacy=parse(raw,source);assert.equal(legacy.relationObservationUnit,undefined);
  const value={...raw,relationObservationUnit:'logical-relations-v1'},before=JSON.stringify(value);
  const plan=parse(value,source),admitted=admit(value,source);
  assert.equal(plan.relationObservationUnit,'logical-relations-v1',raw.format);
  assert.equal(admitted.relationObservationUnit,'logical-relations-v1',raw.format);
  assert.deepEqual(plan.observedInventory,legacy.observedInventory);assert.equal(JSON.stringify(value),before);
 }
});
test('unknown observation units and a missing independent census fail without running provider coercion',()=>{
 let calls=0;const hostile={toString(){calls++;throw Error('private');}};
 for(const raw of proposals())for(const unit of [null,'physical','logical-relations-v2',1,{},hostile]){
  assert.throws(()=>parse({...raw,relationObservationUnit:unit},source),e=>e instanceof TypeError&&!e.message.includes('private'));
  assert.throws(()=>admit({...raw,relationObservationUnit:unit},source),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 const raw=proposals()[0];delete raw.inventory;
 assert.throws(()=>parse({...raw,relationObservationUnit:'logical-relations-v1'},source),/observation unit/u);assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});
