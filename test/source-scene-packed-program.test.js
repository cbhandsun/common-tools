'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
const dimensions={widthPx:1000,heightPx:1000},boxes=[{x:20,y:20,w:20,h:20}],source={sourceHash:'a'.repeat(64),...dimensions,labelBoxes:boxes,
 labelRefs:boxes.map(b=>sourceLabelIdentity(b,dimensions))};
function packed(){return {format:'packed-v1',regions:[[null,0,[0,0,1000,1000],[0,0,0]],[0,1,[100,100,900,900],[2,0,1]]],
 objects:[[1,0,[200,200,300,300]],[1,0,[200,700,300,800]]],relations:[[1,100,101,[230,300,270,700]]],programs:[[[[0],1,'KaiTi',18]],[]]};}
function compact(){return {format:'compact-v8',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[[0,null,0,[0,0,1000,1000]],[1,0,1,[100,100,900,900]]],inventory:[[0,0,0,0],[1,2,0,1]],
 objects:[[100,1,0,[200,200,300,300],0],[101,1,0,[200,700,300,800],0]],relations:[[200,1,100,101,0,[230,300,270,700]]],
 programs:[[0,[[[0],'KaiTi',1,18]]],[1,[]]]};}
test('packed transport is lossless for geometry, census, labels, styles, native IDs and proposal billing',()=>{
 const wire=packed(),copy=structuredClone(wire);assert.deepEqual(parseSourceScenePlan(wire,source),parseSourceScenePlan(compact(),source));
 assert.deepEqual(admitSourceScenePlan(wire,source),admitSourceScenePlan(compact(),source));assert.deepEqual(wire,copy);
 assert.ok(JSON.stringify(wire).length<JSON.stringify(compact()).length);
});
test('packed directions, full paths, all unit codes and optional styles retain their ordinary admission',()=>{
 for(let kind=0;kind<3;kind++)for(let content=0;content<3;content++){
  const a=packed(),b=compact();a.objects[0][1]=kind*3+content;b.objects[0][2]=kind;b.objects[0][4]=content;
  assert.deepEqual(admitSourceScenePlan(a,source),admitSourceScenePlan(b,source));
 }
 for(const direction of [0,1,2,3,4]){
  const a=packed(),b=compact(),route=[[300,250],[700,250]];a.relations[0].push(direction,route);b.relations[0][4]=direction;b.relations[0].push(route);
  assert.deepEqual(parseSourceScenePlan(a,source),parseSourceScenePlan(b,source));
 }
 const a=packed(),b=compact();a.programs[0]=[[[0]]];b.programs[0][1]=[[[0]]];
 assert.deepEqual(parseSourceScenePlan(a,source),parseSourceScenePlan(b,source));
 const unknown=packed();unknown.regions[0][3]=[null,null,null];assert.deepEqual(parseSourceScenePlan(unknown,source).observedInventory[0],
  {regionId:'region-n0',containers:null,icons:null,relations:null});
});
test('rejected packed children remain dependencies and keep the same object and relation charges',()=>{
 const a=packed(),b=compact();a.objects[0][2]=[300,200,200,300];b.objects[0][3]=[300,200,200,300];
 assert.deepEqual(admitSourceScenePlan(a,source),admitSourceScenePlan(b,source));
 const admitted=admitSourceScenePlan(a,source);assert.equal(admitted.admission.complete,false);
 assert.equal(admitted.objectBatches.batches[0].rejected,1);assert.ok(admitted.admission.rejections.some(r=>r.collection==='program'&&r.index===1));
 const nested=packed();nested.objects[0][1]=1;nested.objects[0][2]=[150,150,500,500];nested.objects.push([100,5,[200,200,250,250]]);
 nested.regions[1][3]=[2,1,1];const parsed=admitSourceScenePlan(nested,source);assert.equal(parsed.admission.complete,true);
 assert.equal(parsed.objects[2].parentObjectId,'object-n100');assert.deepEqual(parsed.regionPrograms[1].objects,['object-n100','object-n101','object-n102']);
});
test('packed empty input and maximum inventories fit only the unchanged global limits',()=>{
 assert.deepEqual(parseSourceScenePlan({format:'packed-v1',regions:[],objects:[],relations:[],programs:[]},{...source,labelRefs:[],labelBoxes:[]}).regions,[]);
 const maximum=packed();maximum.objects=Array.from({length:64},()=>[1,0,[200,200,300,300]]);
 maximum.relations=Array.from({length:24},()=>[1,100,101,[230,300,270,700]]);maximum.regions[1][3]=[64,0,24];
 assert.equal(parseSourceScenePlan(maximum,source).objects.length,64);assert.equal(parseSourceScenePlan(maximum,source).relations.length,24);
 for(const mutate of [r=>r.objects=Array(65).fill(r.objects[0]),r=>r.relations=Array(25).fill(r.relations[0]),r=>r.regions=Array(25).fill(r.regions[0]),
  r=>r.programs=[],r=>r.inventory=[],r=>r.coordinateSpace='source-pixels',r=>r.objects[0][1]=9,r=>r.relations[0].push(5),
  r=>r.regions[0][3]=[0,0],r=>r.regions[0][3]=[0,0,-1],r=>r.regions[0][2]=[0,0,1001,1000]]){
  const input=packed();mutate(input);assert.throws(()=>parseSourceScenePlan(input,source),TypeError);
 }
});
test('packed malformed independent rows cannot disappear or execute untrusted fields',()=>{
 const short=packed();short.objects[0].pop();const admitted=admitSourceScenePlan(short,source);
 assert.equal(admitted.admission.complete,false);assert.equal(admitted.objectBatches.batches[0].rejected,1);
 assert.ok(admitted.admission.rejections.some(r=>r.collection==='program'&&r.index===1));
 let reads=0;const trap=()=>{reads++;throw Error('private-token');},hostile=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const mutate of [r=>r.objects[0]=hostile,r=>r.programs[0]=hostile,r=>r.regions[0][3]=hostile,
  r=>Object.defineProperty(r,'programs',{get:trap}),r=>Object.defineProperty(r.objects[0],0,{get:trap}),r=>r.objects[0][1]={valueOf:trap}]){
  const input=packed();mutate(input);assert.throws(()=>parseSourceScenePlan(input,source),e=>!e.message.includes('private-token'));
 }assert.equal(reads,0);
});
test('packed protocol and regression enter the same CI and runtime package surfaces',()=>{
 const runtime=require('../scripts/verify-runtime-package'),suites=require('../scripts/test-suites');
 for(const name of ['source-scene-packed-program.js','source-scene-packed-program-prompt.js'])
  assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/'+name));
 assert.equal(suites.includesSuite(__filename,'all'),true);assert.equal(suites.includesSuite(__filename,'unit'),true);
});

test('explicit logical observation survives both transports without rewriting legacy or executing untrusted versions',()=>{
 for(const factory of [packed,compact]){
  const legacy=factory();assert.equal(parseSourceScenePlan(legacy,source).relationObservationUnit,undefined);
  const logical=factory();logical.relationObservationUnit='logical-relations-v1';
  assert.equal(parseSourceScenePlan(logical,source).relationObservationUnit,'logical-relations-v1');
  assert.deepEqual(parseSourceScenePlan(logical,source).observedInventory,parseSourceScenePlan(legacy,source).observedInventory);
  for(const value of ['',null,{},['logical-relations-v1'],'logical-relations-v2','physical-relations-v1']){
   const bad=factory();bad.relationObservationUnit=value;assert.throws(()=>parseSourceScenePlan(bad,source),TypeError);
  }
  let reads=0;const bad=factory();Object.defineProperty(bad,'relationObservationUnit',{get(){reads++;throw Error('private');}});
  assert.throws(()=>parseSourceScenePlan(bad,source),TypeError);assert.equal(reads,0);
 }
 const empty={format:'packed-v1',relationObservationUnit:'logical-relations-v1',regions:[],objects:[],relations:[],programs:[]};
 assert.equal(parseSourceScenePlan(empty,{...source,labelRefs:[],labelBoxes:[]}).relationObservationUnit,'logical-relations-v1');
});
