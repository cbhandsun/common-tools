"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSceneCompileFeedback:feedback}=require('../packages/slideclone-core/source-scene-compile-feedback');
const {selectStructuralReviewTargets:select}=require('../packages/slideclone-core/source-scene-structural-review');
test('safe source-icon and explicit-program failures reach their actual source units instead of disappearing from local review',()=>{
 const plan={objects:[{id:'object-a'},{id:'object-b'}],relations:[{id:'relation-ab',fromId:'object-a',toId:'object-b'}]};
 const result=feedback(plan,{unresolved:[{id:'object-a',reason:'icon-isolation',detailCode:'icon-source-text'},
  {id:'relation-ab',reason:'relation-source-evidence',detailCode:'visible-path-program'},
  {id:'object-b',reason:'icon-isolation',detailCode:'private-token user contents'}]});
 assert.deepEqual(result.get('object-a'),['icon-isolation:icon-source-text','relation-source-evidence:visible-path-program']);
 assert.deepEqual(result.get('object-b'),['relation-source-evidence:visible-path-program']);
 assert.ok(!JSON.stringify([...result]).includes('private-token'));
});
test('failure feedback reports observed shaft, direction and port stages without converting failure into success',()=>{
 const {deeperSourceRelationFailure:deeper}=require('../packages/slideclone-core/source-scene-relation-recovery');
 assert.equal(deeper('shaft-window-boundary','shaft-width'),'shaft-width');
 assert.equal(deeper('shaft-width','arrow-direction'),'arrow-direction');
 assert.equal(deeper('arrow-direction','node-axis-alignment'),'node-axis-alignment');
 for(const value of [null,'source-scan-budget','source-window-ownership','unrecognized'])assert.equal(deeper('shaft-width',value),'shaft-width');
 assert.equal(deeper('node-axis-alignment','shaft-width'),'node-axis-alignment');assert.equal(deeper(null,null),null);
});
function plan(){return {version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
 objects:['a','b','c'].map((id,i)=>({id,regionId:'root',kind:'container',box:{x:5+i*30,y:10,w:20,h:30}})),
 relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]};}
test('deep source failures schedule the original bounded structural review with fixed codes and unchanged IDs',()=>{
 const p=plan(),evidence={unresolved:[{id:'ab',reason:'relation-source-evidence',detailCode:'shaft-width'},{id:'c',reason:'icon-isolation'}]},before=JSON.stringify(p);
 assert.deepEqual([...feedback(p,evidence)],[['a',['relation-source-evidence:shaft-width']],['b',['relation-source-evidence:shaft-width']],['c',['icon-isolation']]]);
 assert.deepEqual(select(p,32,evidence).map(t=>t.objectId),['a','b','c']);assert.equal(select(p,1,evidence).length,1);
 assert.deepEqual(select(p,0,evidence),[]);assert.equal(JSON.stringify(p),before);assert.deepEqual(select(p,32,{unresolved:[]}),[]);
 p.objects[2].regionId='wrong';assert.equal(select(p,1,evidence)[0].objectId,'c');
 assert.equal(select(p,1,evidence)[0].compileProbe,false);assert.equal(select(p,32,evidence).find(t=>t.objectId==='a').compileProbe,true);
});

test('native program failures remain visible to bounded structural review without granting geometry or ownership',()=>{
 const p=plan(),before=JSON.stringify(p);
 const codes=['primitive-source-budget','primitive-exterior','primitive-source-geometry','primitive-missing-face',
  'primitive-stroke-paint','primitive-stroke-width','primitive-source-exterior','primitive-face-paint','primitive-source-evidence'];
 for(const detailCode of codes){
  const evidence={unresolved:[{id:'c',reason:'native-program-source-evidence',detailCode}]},original=JSON.stringify(evidence);
  assert.deepEqual([...feedback(p,evidence)],[['c',[`native-program-source-evidence:${detailCode}`]]]);
  const targets=select(p,1,evidence);
  assert.equal(targets.length,1);assert.equal(targets[0].objectId,'c');assert.equal(targets[0].compileProbe,true);
  assert.deepEqual(targets[0].compileFailures,[`native-program-source-evidence:${detailCode}`]);
  assert.deepEqual(select(p,0,evidence),[]);assert.equal(JSON.stringify(evidence),original);
 }
 assert.equal(JSON.stringify(p),before);
 assert.deepEqual([...feedback(p,{unresolved:[]})],[]);
});

test('native program feedback rejects provider content, foreign owners and unsupported stages',()=>{
 const p=plan(),evidence={unresolved:[
  {id:'a',reason:'native-program-source-evidence',detailCode:'primitive-source-geometry secret-key'},
  {id:'b',reason:'native-program-source-evidence',detailCode:'primitive-provider-message'},
  {id:'foreign',reason:'native-program-source-evidence',detailCode:'primitive-source-geometry'},
  {id:'c',reason:'native-program-source-evidence',detailCode:'primitive-source-geometry'},
  {id:'c',reason:'native-program-source-evidence',detailCode:'primitive-source-geometry'}]};
 assert.deepEqual([...feedback(p,evidence)],[['c',['native-program-source-evidence:primitive-source-geometry']]]);
 assert.deepEqual(select(p,32,evidence).map(t=>t.objectId),['c']);
 assert.ok(!JSON.stringify([...feedback(p,evidence)]).includes('secret-key'));
});
test('unknown text, unrelated identities and duplicate rows never enter prompts or remove gate failures',()=>{
 const p=plan(),input={unresolved:[{id:'a',reason:'private model text'},{id:'a',reason:'container-perimeter',detailCode:'secret-key'},
  {id:'foreign',reason:'icon-isolation'},{id:'c',reason:'icon-isolation'},{id:'c',reason:'icon-isolation'}]},before=JSON.stringify(input);
 assert.deepEqual([...feedback(p,input)],[['c',['icon-isolation']]]);assert.equal(JSON.stringify(input),before);
});
test('hostile, sparse, inherited, oversized and invalid feedback fails before getters execute',()=>{
 const p=plan();let calls=0;const getter={};Object.defineProperty(getter,'id',{get(){calls++;throw Error('private');}});
 for(const value of [null,{},new Proxy({unresolved:[]},{}),{unresolved:new Proxy([],{})},{unresolved:new Array(1)},
  {unresolved:Array.from({length:257},()=>({id:'a',reason:'icon-isolation'}))},{unresolved:[getter]},
  {unresolved:[Object.create({id:'a',reason:'icon-isolation'})]},{unresolved:[{id:1,reason:'icon-isolation'}]},
  {unresolved:[{id:'a',reason:'icon-isolation',detailCode:[]}]}])assert.throws(()=>feedback(p,value),TypeError);
 assert.equal(calls,0);
});
