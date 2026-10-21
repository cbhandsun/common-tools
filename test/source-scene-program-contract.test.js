'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSceneProgramBindings,readSceneProgram,sceneProgramSchema}=require('../packages/slideclone-core/source-scene-program-contract');
const {parseLocalTargets,localResponseFormat,decodeLocalResponse,sceneRegionalOutputPrompt}=require('../packages/slideclone-core/source-scene-local-response');
const binding=()=>({objects:['object-a','object-b'],relations:['relation-a'],labels:[0,2],allowNewMembers:false});
const style=refs=>({refs,family:'Arial',weight:'regular',sizePt:null,role:null});
const response=()=>({objects:['object-a','object-b'],relations:['relation-a'],labels:[style([0,2])]});
const targets=()=>({reviews:[],missing:[],regionInventories:[5],regionObjectCapacity:0,regionRelationCapacity:0,regionProgramBindings:{5:binding()}});

test('a program-only observation occupies a normal target while reserving no new inventory',()=>{
 const admitted=parseLocalTargets(targets()),schema=localResponseFormat(admitted).json_schema.schema.properties.regionInventoriesByIndex.properties[5];
 assert.deepEqual(schema.required,['units','relations','program']);assert.equal(schema.properties.units.maxItems,0);assert.equal(schema.properties.relations.maxItems,0);
 const raw={reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{5:{units:[],relations:[],program:response()}}};
 const decoded=decodeLocalResponse(raw,admitted);assert.deepEqual(readSceneProgram(decoded.regionInventories[0].program,binding(),0,0),{objects:['object-a','object-b'],relations:['relation-a'],labels:[{refs:[0,2],family:'Arial',weight:'regular'}]});
 assert.match(sceneRegionalOutputPrompt(admitted),/program/);assert.match(sceneRegionalOutputPrompt(admitted),/EMPTY units/);
 const over=targets();over.reviews=Array.from({length:32},(_,i)=>i+10);assert.throws(()=>parseLocalTargets(over),/capacity/);
});

test('new inventory indices are permitted only for an explicit bounded new-member task',()=>{
 const allowed={...binding(),allowNewMembers:true},raw=response();raw.objects.push(1);raw.relations.push(0);
 assert.deepEqual(readSceneProgram(raw,allowed,2,1).objects,['object-a','object-b',1]);
 assert.throws(()=>readSceneProgram(raw,binding(),2,1));
 assert.equal(readSceneProgram(null,binding(),0,0),null);
 const schema=sceneProgramSchema(binding(),0,0).anyOf[1];assert.deepEqual(schema.properties.objects.items,{type:'string',enum:binding().objects});
});

test('missing members labels extra fields and wrong references cannot form a complete program',()=>{
 for(const mutate of [r=>r.objects.pop(),r=>r.relations=[],r=>r.objects.push('object-foreign'),r=>r.labels=[],r=>r.labels[0].refs=[0],r=>r.labels.push(style([0])),r=>r.objects.push('object-a'),r=>r.labels[0].family='untrusted-font',r=>r.labels[0].sizePt=Infinity,r=>r.labels[0].role='untrusted-role',r=>r.extra=true,r=>delete r.labels[0].weight]){
  const raw=response();mutate(raw);assert.throws(()=>readSceneProgram(raw,binding(),0,0),TypeError);
 }
});

test('bound programs are required only on their requested indices and never accepted unsolicited',()=>{
 const raw={reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{5:{units:[],relations:[]}}};
 assert.throws(()=>decodeLocalResponse(raw,targets()),/regional/);
 raw.regionInventoriesByIndex[5].program=null;assert.equal(decodeLocalResponse(raw,targets()).regionInventories[0].program,null);
 const legacy={reviews:[],missing:[],regionInventories:[5],regionObjectCapacity:1,regionRelationCapacity:0};assert.throws(()=>decodeLocalResponse(raw,legacy),/regional/);
});

test('hostile and extreme binding input is rejected without invoking accessors',()=>{
 let called=0;const getter={get objects(){called++;return [];},relations:[],labels:[],allowNewMembers:false};
 for(const value of [null,[],{6:binding()},{5:getter},{5:new Proxy(binding(),{})},{5:{...binding(),objects:new Array(2)}},{5:{...binding(),labels:[512]}},{5:{...binding(),labels:[0,0]}},{5:{...binding(),objects:Array.from({length:65},(_,i)=>'object-'+i)}},{5:{...binding(),allowNewMembers:'false'}}])assert.throws(()=>parseSceneProgramBindings(value,[5]),TypeError);
 assert.equal(called,0);assert.deepEqual(parseSceneProgramBindings({},[]),{});
 const bad=response();Object.defineProperty(bad,'labels',{get(){called++;return [];},enumerable:true});assert.throws(()=>readSceneProgram(bad,binding(),0,0),TypeError);assert.equal(called,0);
});

test('program references share the original endpoint and object capacity',()=>{
 const raw=targets();raw.regionObjectCapacity=63;assert.throws(()=>parseLocalTargets(raw),/capacities/);
 raw.regionObjectCapacity=62;assert.equal(parseLocalTargets(raw).regionObjectCapacity,62);
 raw.regionEndpointIds={5:['object-a','object-b']};assert.equal(parseLocalTargets(raw).regionObjectCapacity,62,'the same immutable references are charged once');
});
