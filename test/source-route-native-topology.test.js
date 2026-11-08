'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertNativeRouteTopology:check}=require('../packages/slideclone-core/routing/source-route-native-topology');
const point=(x,y)=>({x,y});
function graph(vertices,edges){return {vertices:vertices.map(([id,x,y])=>({id,point:point(x,y)})),edges:edges.map(([from,to,...points])=>({from,to,points:points.map(([x,y])=>point(x,y))})),work:{checks:0}};}
test('a full cycle with shared junctions and separate arms preserves only declared contacts',()=>{
 const g=graph([['a',0,0],['b',50,0],['c',50,50],['d',0,50],['e',80,0]],[['a','b',[0,0],[50,0]],['b','c',[50,0],[50,50]],['c','d',[50,50],[0,50]],['d','a',[0,50],[0,0]],['b','e',[50,0],[80,0]]]);
 assert.equal(check(g),true);assert.ok(g.work.checks>0);
});
test('crossings, self intersections, overlapping incident arms, false contacts and unrelated vertices reject the whole graph',()=>{
 const cases=[
 graph([['a',0,0],['b',50,50],['c',0,50],['d',50,0]],[['a','b',[0,0],[50,50]],['c','d',[0,50],[50,0]]]),
 graph([['a',0,0],['b',20,0]],[['a','b',[0,0],[50,50],[0,50],[50,0],[20,0]]]),
 graph([['a',0,0],['b',50,0],['c',80,0]],[['a','b',[0,0],[50,0]],['a','c',[0,0],[80,0]]]),
 graph([['a',0,0],['b',50,0],['c',50,0],['d',50,50]],[['a','b',[0,0],[50,0]],['c','d',[50,0],[50,50]]]),
 graph([['a',0,0],['b',50,0],['c',25,0]],[['a','b',[0,0],[50,0]]])];
 for(const g of cases)assert.throws(()=>check(g),/topology/u);
});
test('empty, malformed, hostile and exhausted topology inputs never invoke caller code or return a prefix',()=>{
 let calls=0;const proxy=new Proxy([],{get(){calls++;throw Error('private');}}),getter=Object.defineProperty({},'x',{get(){calls++;throw Error('private');}});
 const good=()=>graph([['a',0,0],['b',50,0]],[['a','b',[0,0],[50,0]]]);
 for(const input of [null,{}, {...good(),vertices:[]},{...good(),edges:proxy},{...good(),vertices:[{id:'a',point:getter}]},
  {...good(),work:{checks:4000000}},{...good(),edges:[{from:'a',to:'b',points:[point(NaN,0),point(50,0)]}]}])
  assert.throws(()=>check(input),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);
});
