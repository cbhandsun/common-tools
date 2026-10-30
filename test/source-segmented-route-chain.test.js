'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {certifySegmentedRouteChain:certify}=require('../packages/slideclone-core/routing/source-segmented-route-chain');
function component(x,y=10){const cells=[];for(let xx=x;xx<x+7;xx++)for(let yy=y;yy<y+3;yy++)cells.push({x:xx,y:yy});return {box:{x,y,w:7,h:3},cells,boundary:false};}
test('all observed disconnected dashes form one unique chain without painting its gaps',()=>{
 const input={components:[component(10),component(34),component(22),component(46)],noisePixels:0},before=structuredClone(input),r=certify(input);
 assert.equal(r.failure,null);assert.deepEqual(r.order,[0,2,1,3]);assert.equal(r.authorityGranted,false);assert.deepEqual(input,before);
});
test('empty, clipped, noise, disconnected, dense branches and ambiguous cycles are not complete chains',()=>{
 for(const components of [[],[component(10)],[component(10),component(22),component(200)],
  [component(10),component(22),component(34),component(22,16)],
  [component(10),component(22),component(22,16),component(10,16)]])assert.notEqual(certify({components,noisePixels:0}).failure,null);
 const c=[component(10),component(22),component(34)];c[1].boundary=true;assert.notEqual(certify({components:c,noisePixels:0}).failure,null);
 assert.notEqual(certify({components:[component(10),component(22),component(34)],noisePixels:1}).failure,null);
});
test('unknown geometry, unsafe collections and excessive capacity reject without getters',()=>{
 let calls=0;const getter={};Object.defineProperty(getter,'components',{get(){calls++;throw Error('private');}});
 for(const input of [null,{},getter,new Proxy({components:[],noisePixels:0},{}),{components:new Array(1),noisePixels:0},
  {components:Array.from({length:33},()=>component(10)),noisePixels:0},
  {components:[{...component(10),cells:[{x:Infinity,y:10}]}],noisePixels:0},
  {components:[],noisePixels:NaN}])assert.throws(()=>certify(input),TypeError);
 assert.equal(calls,0);
});
