'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {sourceLabelIdentity}=require('../packages/slideclone-core/scene-plan/source-label-identity');
const {sceneInventoryCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-capacity');
const source={sourceHash:'a'.repeat(64),widthPx:800,heightPx:600,labelRefs:[sourceLabelIdentity({x:30,y:30,w:40,h:20},{widthPx:800,heightPx:600})]};
function compact(){return {format:'compact-v8',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[[0,null,0,[0,0,1000,1000]],[1,0,1,[100,100,900,900]]],inventory:[[0,0,0,0],[1,2,0,1]],
 objects:[[2,1,0,[200,200,300,300],0],[3,1,0,[200,700,300,800],0]],
 relations:[[4,1,2,3,0,[230,300,270,700],[[300,250],[700,250]]]],
 programs:[[0,[[[0],'KaiTi',1,18]]],[1,[]]]};}
function expanded(){return {format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[[0,null,'section',[0,0,1000,1000]],[1,0,'card',[100,100,900,900]]],inventory:[[0,0,0,0],[1,2,0,1]],
 objects:[[2,1,'container',[200,200,300,300],'absent'],[3,1,'container',[200,700,300,800],'absent']],
 relations:[[4,1,2,3,'forward',[230,300,270,700],[[300,250],[700,250]]]],
 programs:[{regionId:0,objects:[],relations:[],labels:[{refs:[0],family:'KaiTi',weight:'bold',sizePt:18}]},
 {regionId:1,objects:[2,3],relations:[4],labels:[]}]};}

test('undirected has explicit numeric code four and never replaces unknown',()=>{
 const raw=compact(),ordinary=expanded();raw.relations[0][4]=4;ordinary.relations[0][4]='undirected';
 assert.deepEqual(parseSourceScenePlan(raw,source),parseSourceScenePlan(ordinary,source));
 raw.relations[0][4]=3;assert.equal(parseSourceScenePlan(raw,source).relations[0].direction,'unknown');
 for(const value of [5,-1,4.5,'undirected',null,{}]){
  raw.relations[0][4]=value;assert.throws(()=>parseSourceScenePlan(raw,source),TypeError);
 }
 const {sceneRelationsConflict}=require('../packages/slideclone-core/scene-plan/source-scene-relation-identity');
 const a={fromId:'a',toId:'b',direction:'undirected'};
 assert.equal(sceneRelationsConflict(a,{...a,fromId:'b',toId:'a'}),true);
 assert.equal(sceneRelationsConflict(a,{...a,direction:'both'}),false);
 assert.equal(sceneRelationsConflict(a,{...a,shaftBox:{x:30,y:30,w:5,h:5}}),true);
 assert.equal(sceneRelationsConflict({...a,shaftBox:{x:0,y:0,w:5,h:5}},{...a,shaftBox:{x:30,y:30,w:5,h:5}}),false);
});
test('compact programs expand explicit owners without changing source identity, inventories, routes or label binding',()=>{
 const raw=compact(),before=structuredClone(raw),parsed=parseSourceScenePlan(raw,source);
 assert.deepEqual(parsed,parseSourceScenePlan(expanded(),source));assert.deepEqual(raw,before);
 assert.deepEqual(parsed.regionPrograms[1].objects,['object-n2','object-n3']);
 assert.deepEqual(parsed.regionPrograms[1].relations,['relation-n4']);
 assert.deepEqual(parsed.regionPrograms[0].labels[0].refs,source.labelRefs);
 assert.ok(JSON.stringify(raw).length<JSON.stringify(expanded()).length);
 const alias=compact();alias.objects[0][1]='1';alias.programs[1][0]='1';
 assert.deepEqual(parseSourceScenePlan(alias,source),parsed);
});
test('empty programs and optional ordinary styles work; unsupported routes remain absent without guessed geometry',()=>{
 const empty={...compact(),regions:[],inventory:[],objects:[],relations:[],programs:[]};
 assert.deepEqual(parseSourceScenePlan(empty,{...source,labelRefs:[]}).regionPrograms,[]);
 const raw=compact();raw.relations[0].pop();raw.programs[0][1]=[[[0]]];
 const parsed=parseSourceScenePlan(raw,source);assert.equal(parsed.relations[0].visiblePath,undefined);
 assert.deepEqual(parsed.regionPrograms[0].labels,[{refs:source.labelRefs}]);
 const explicit=compact();explicit.relations[0][6]=null;explicit.programs[0][1]=[[[0],null,null,null]];
 assert.deepEqual(parseSourceScenePlan(explicit,source),parsed);
});
test('members are projected before rejection, so invalid units cannot vanish from a compact region program',()=>{
 for(const mutate of [r=>r.objects[0][3]=[300,200,200,300],r=>r.objects[0][2]=99,r=>r.relations[0][4]=99,
  r=>r.objects.push(structuredClone(r.objects[0])),r=>r.relations.push(structuredClone(r.relations[0]))]){
  const raw=compact();mutate(raw);assert.throws(()=>parseSourceScenePlan(raw,source),/Scene/);
  const admitted=admitSourceScenePlan(raw,source);assert.equal(admitted.admission.complete,false);
  assert.ok(admitted.admission.rejections.some(r=>r.collection==='program'&&r.index===1));
  assert.equal(admitted.regionPrograms.length,1);assert.equal(admitted.regionPrograms[0].regionId,'region-n0');
 }
 const excess=compact();excess.inventory[1][1]=65;
 assert.equal(sceneInventoryCapacity(parseSourceScenePlan(excess,source)).feasible,false);
});
test('malformed independent tuples and styles retain bounded admission failures without destroying other regions',()=>{
 for(const mutate of [r=>r.objects[0].pop(),r=>r.relations[0].push('surplus'),r=>r.programs[1].push([]),
  r=>r.programs[1][1]=[[[],null,0]],r=>r.programs[1][1]=new Proxy([],{get(){throw Error('private-token');}})]){
  const raw=compact();mutate(raw);assert.throws(()=>parseSourceScenePlan(raw,source),e=>!e.message.includes('private-token'));
  const admitted=admitSourceScenePlan(raw,source);assert.equal(admitted.admission.complete,false);
  assert.ok(admitted.admission.rejections.some(r=>r.collection==='program'&&r.index===1));
  assert.equal(admitted.regionPrograms.length,1);assert.equal(admitted.regionPrograms[0].regionId,'region-n0');
 }
});
test('the same bounds reject excess regions, objects, relations, labels and paths; unknown fields grant no members',()=>{
 for(const mutate of [r=>r.regions=Array(25).fill(r.regions[0]),r=>r.objects=Array(65).fill(r.objects[0]),
  r=>r.relations=Array(25).fill(r.relations[0]),r=>r.programs=Array(25).fill(r.programs[0]),r=>delete r.inventory,
  r=>r.regions[0][2]=6,r=>r.programs[0].push([2]),r=>r.programs[0][1]=Array(33).fill([[0]]),
  r=>r.programs[0][1][0][0]=Array(513).fill(0),r=>r.programs[0][1][0][0]=[],r=>r.programs[0][1][0][1]='generated-font',
  r=>r.programs[0][1][0][2]=2,r=>r.programs[0][1][0][3]=Infinity,r=>r.relations[0][6]=Array(17).fill([1,1]),
  r=>r.objects[0][4]=3,r=>r.objects[0][3][0]=NaN,r=>r.hiddenObjects=[]]){
  const raw=compact();mutate(raw);assert.throws(()=>parseSourceScenePlan(raw,source),TypeError);
 }
});
test('hostile nested compact tuples never execute getters, proxies or coercion hooks and errors omit payloads',()=>{
 let reads=0;const trap=()=>{reads++;throw Error('private-token');},traps={get:trap,getPrototypeOf:trap,ownKeys:trap};
 const hostile=[];Object.defineProperty(hostile,0,{get:trap,enumerable:true});hostile.length=4;
 for(const mutate of [r=>r.objects[0]=hostile,r=>r.programs[0]=new Proxy([0,[]],traps),
  r=>r.programs[0][1][0][0]=new Proxy([],traps),r=>r.objects[0][1]={valueOf:trap},
  r=>r.regions[0][2]={valueOf:trap},r=>Object.defineProperty(r,'programs',{get:trap})]){
  const raw=compact();mutate(raw);assert.throws(()=>parseSourceScenePlan(raw,source),e=>!e.message.includes('private-token'));
 }
 assert.throws(()=>admitSourceScenePlan(new Proxy(compact(),traps),source),e=>!e.message.includes('private-token'));
 assert.equal(reads,0);
});
test('the compact decoder is required by the unified runtime package release contract',()=>{
 const {IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-compact-program.js'));
});

function nestedCompact(){
 const raw=compact();raw.objects[0][3]=[150,150,500,500];raw.objects[0][4]=1;
 raw.objects.push([5,2,1,[200,200,250,250],2]);raw.inventory[1][2]=1;return raw;
}

test('compact region programs retain explicitly nested children before source admission',()=>{
 const raw=nestedCompact(),before=structuredClone(raw),admitted=admitSourceScenePlan(raw,source);
 assert.equal(admitted.admission.complete,true,JSON.stringify(admitted.admission));
 assert.deepEqual(admitted.regionPrograms[1].objects,['object-n2','object-n3','object-n5']);
 assert.equal(admitted.objects[2].parentObjectId,'object-n2');assert.equal(admitted.objects[2].regionId,'region-n1');
 assert.deepEqual(raw,before);
 const deeper=nestedCompact();deeper.objects[2]=[5,2,0,[200,200,300,300],1];
 deeper.objects.push([6,5,1,[210,210,240,240],2]);deeper.inventory[1][1]=3;
 const parsed=admitSourceScenePlan(deeper,source);assert.equal(parsed.admission.complete,true);
 assert.deepEqual(parsed.regionPrograms[1].objects,['object-n2','object-n3','object-n5','object-n6']);
 assert.equal(parsed.objects[3].parentObjectId,'object-n5');
});

test('invalid nested children remain rejected dependencies rather than disappearing from compact programs',()=>{
 for(const mutate of [r=>r.objects[2][3]=[200,200,700,700],r=>r.objects[2][2]=99,
  r=>r.objects.push(structuredClone(r.objects[2]))]){
  const raw=nestedCompact();mutate(raw);const result=admitSourceScenePlan(raw,source);
  assert.equal(result.admission.complete,false);assert.ok(result.admission.rejections.some(r=>r.collection==='program'&&r.index===1));
  assert.equal(result.regionPrograms.some(p=>p.regionId==='region-n1'),false);
 }
});

test('compact explicit nesting keeps missing, cyclic, ambiguous and hostile owner failures bounded',()=>{
 for(const mutate of [r=>r.objects[2][1]=99,r=>r.objects[0][1]=5,r=>r.objects[0][2]=1,
  r=>r.objects.push(structuredClone(r.objects[0]))]){
  const raw=nestedCompact();mutate(raw);const result=admitSourceScenePlan(raw,source);
  assert.equal(result.admission.complete,false);assert.equal(result.objects.some(o=>o.id==='object-n5'),false);
 }
 let calls=0;const trap=()=>{calls++;throw Error('private-token');};
 for(const mutate of [r=>Object.defineProperty(r.objects[2],1,{get:trap}),
  r=>r.objects[0]=new Proxy(r.objects[0],{get:trap,ownKeys:trap}),r=>r.objects[2][1]={valueOf:trap}]){
  const raw=nestedCompact();mutate(raw);const result=admitSourceScenePlan(raw,source);
  assert.equal(result.admission.complete,false);assert.equal(JSON.stringify(result).includes('private-token'),false);
 }
 assert.equal(calls,0);
});

test('production compact prompt binds embedded units to explicit parent objects without hiding their inventory',()=>{
 const {SCENE_PROGRAM_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 assert.match(SCENE_PROGRAM_PROMPT,/Object tuple: \[id,ownerId,kind,box,pictorialContent\]/u);
 assert.match(SCENE_PROGRAM_PROMPT,/enclosing container OBJECT ID/u);
 assert.match(SCENE_PROGRAM_PROMPT,/object nesting never hides its slot or removes it from the census/u);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-compact-program.test.js','unit'),true);
});

test('production prompt schedules existing bounded interior recovery without demanding duplicate explicit proposals',()=>{
 const {SCENE_PROGRAM_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-program-prompt');
 assert.match(SCENE_PROGRAM_PROMPT,/Inventory ALL independent pictorial units, INCLUDING icons INSIDE/u);
 assert.match(SCENE_PROGRAM_PROMPT,/Explicit icons plus interior recovery targets share 32/u);
 assert.match(SCENE_PROGRAM_PROMPT,/Omit an embedded icon proposal only/u);
 assert.match(SCENE_PROGRAM_PROMPT,/Never omit a real unit from the census/u);
 assert.doesNotMatch(SCENE_PROGRAM_PROMPT,/Include FULL source boundaries and each independent pictorial icon/u);
 assert.match(SCENE_PROGRAM_PROMPT,/64 object proposals and 24 relation proposals in THIS global batch/u);
 assert.match(SCENE_PROGRAM_PROMPT,/at most 32 object proposals and 24 relation proposals/u);
});
