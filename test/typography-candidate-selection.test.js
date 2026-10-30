"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {selectTypographyCandidate:select}=require('../packages/slideclone-core/typography/typography-candidate-selection');
const hash=c=>c.repeat(64),ink=(h=20)=>({x:10,y:10,w:80,h});
function request(){return {geometryUncertaintyPt:.5,source:[{id:'a',ink:ink()}],
 baseline:{id:'base',pdr:.2,mad:20,texts:[{id:'a',content:hash('a'),revision:hash('b'),ink:ink(16)}]},
 candidates:[{id:'fit',pdr:.18,mad:18,texts:[{id:'a',content:hash('a'),revision:hash('c'),ink:ink(20)}]}]};}
test('chooses complete region improvements with measured geometry without changing input',()=>{
 const input=request(),before=structuredClone(input),result=select(input);
 assert.equal(result.selectedId,'fit');assert.equal(result.changed,true);assert.deepEqual(input,before);
 assert.deepEqual(select({...input,source:[],baseline:{...input.baseline,texts:[]},candidates:[]}),{selectedId:'base',changed:false,decisions:[]});
});
test('pixel gains cannot reward shrinkage, shifts, missing geometry or changed wording',()=>{
 for(const [patch,reason] of [[{ink:ink(8)},'geometry-regressed'],[{ink:{...ink(),x:30}},'geometry-regressed'],
  [{ink:null},'geometry-unavailable'],[{content:hash('d')},'content-changed']]){
  const r=request();Object.assign(r.candidates[0].texts[0],patch);const result=select(r);
  assert.equal(result.selectedId,'base');assert.equal(result.decisions[0].reason,reason);
 }
 const r=request();r.source[0].ink=null;assert.equal(select(r).decisions[0].reason,'geometry-unavailable');
});
test('one regressed member rejects the entire overlapping group and unchanged unknown ink is retained',()=>{
 const r=request(),b={id:'b',content:hash('e'),revision:hash('f'),ink:ink(20)};
 r.source.push({id:'b',ink:ink()});r.baseline.texts.push(b);r.candidates[0].texts.push({...b,revision:hash('c'),ink:ink(9)});
 assert.equal(select(r).selectedId,'base');
 r.candidates[0].texts[1]={...b,ink:null};r.baseline.texts[1].ink=null;r.source[1].ink=null;
 assert.equal(select(r).selectedId,'fit');
});
test('requires Pareto improvement of both region scores and preserves baseline ties',()=>{
 for(const patch of [{pdr:.2},{mad:20},{pdr:.21},{mad:21}]){
  const r=request();Object.assign(r.candidates[0],patch);assert.equal(select(r).selectedId,'base');
 }
 const r=request();r.candidates.push({...structuredClone(r.candidates[0]),id:'tradeoff',pdr:.17,mad:19});
 assert.equal(select(r).selectedId,'fit');
 r.candidates.push({...structuredClone(r.candidates[0]),id:'better',pdr:.16,mad:17});
 assert.equal(select(r).selectedId,'better');
});
test('rejects incomplete, duplicated and excessive inventories and invalid measurements',()=>{
 for(const change of [r=>r.candidates[0].texts.pop(),r=>r.source.pop(),r=>r.source.push(r.source[0]),
  r=>r.candidates.push(r.candidates[0]),r=>r.baseline.texts.push(r.baseline.texts[0]),
  r=>r.candidates=new Array(65).fill(r.candidates[0]),r=>r.candidates[0].texts[0].revision='private-content',
  r=>r.source[0].ink.w=0,r=>r.source[0].ink.x=100000,r=>r.baseline.pdr=Infinity,r=>r.baseline.mad=-1,
  r=>r.geometryUncertaintyPt=NaN,r=>r.geometryUncertaintyPt=2.01]){
  const r=request();change(r);assert.throws(()=>select(r),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 }
});
test('never executes hostile accessors or proxies including arrays and nested bounds',()=>{
 let calls=0;const hostile={get pdr(){calls++;throw Error('secret');}},proxy=new Proxy({}, {get(){calls++;throw Error('secret');},ownKeys(){calls++;throw Error('secret');}});
 for(const value of [null,[],proxy,hostile])assert.throws(()=>select(value),TypeError);
 for(const change of [r=>r.candidates=[proxy],r=>r.candidates=new Proxy([],{}),r=>r.source=new Array(1),
  r=>r.source[0].ink=hostile,r=>r.candidates[0].texts[0]=proxy,
  r=>Object.defineProperty(r.candidates,'0',{get(){calls++;throw Error('secret');}})]){
  const r=request();change(r);assert.throws(()=>select(r),TypeError);
 }
 assert.equal(calls,0);
});
