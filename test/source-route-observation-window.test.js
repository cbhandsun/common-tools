'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteObservationWindow}=require('../packages/slideclone-core/source-route-observation-window');
function fixture(){return {hint:{x:38,y:59,w:165,h:76},from:{x:20,y:20,w:50,h:40},to:{x:170,y:20,w:50,h:40},width:240,height:180,anchored:true,programmed:false};}
test('successful shaft observations retain exactly their original margin',()=>{
 const input=fixture(),snapshot=structuredClone(input);
 assert.deepEqual(sourceRouteObservationWindow(input),{x:36,y:57,w:169,h:80});assert.deepEqual(input,snapshot);
 const fractional={...input,hint:{x:38.1,y:59.1,w:164.8,h:75.8}};
 assert.deepEqual(sourceRouteObservationWindow(fractional),{x:36,y:57,w:169,h:80});
});
test('truncated hints observe the nearest node contacts without selecting an authoritative port',()=>{
 const input={...fixture(),hint:{x:38,y:80,w:165,h:55}};
 assert.deepEqual(sourceRouteObservationWindow(input),{x:26,y:48,w:189,h:99});
 assert.deepEqual(sourceRouteObservationWindow({...input,programmed:true}),{x:36,y:78,w:169,h:59});
 assert.deepEqual(sourceRouteObservationWindow({...input,anchored:false}),{x:26,y:68,w:189,h:79});
});
test('observation windows remain inside the source and reject malformed or executable controls',()=>{
 const input=fixture();assert.deepEqual(sourceRouteObservationWindow({...input,hint:{x:0,y:0,w:240,h:180}}),{x:0,y:0,w:240,h:180});
 let reads=0;const getter={};Object.defineProperty(getter,'hint',{get(){reads++;throw Error('executed');}});
 for(const invalid of [null,{},[],getter,new Proxy(input,{}),{...input,width:NaN},{...input,height:0},
  {...input,programmed:'yes'},{...input,hint:{x:0,y:0,w:241,h:180}},{...input,from:{x:0,y:0,w:Infinity,h:1}}])assert.throws(()=>sourceRouteObservationWindow(invalid),TypeError);
 assert.equal(reads,0);
});
