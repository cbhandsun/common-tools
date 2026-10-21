"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {hasCompleteSourceArrowHead:head}=require('../packages/slideclone-core/source-complete-arrow-head');
function profile(length=14,shaft=4,peak=17){
 const taper=Array.from({length},(_,i)=>Math.round(1+(peak-1)*i/(length-1)));
 return [...Array(60).fill(shaft),...taper.reverse()];
}
test('complete source taper and stable body prove longer heads in either direction without changing input',()=>{
 for(const length of [11,14,20])for(const shaft of [2,3,4,5]){
  const widths=profile(length,shaft),before=[...widths];
  assert.equal(head({widths,shaft,right:true}),true);
  assert.equal(head({widths:[...widths].reverse(),shaft,right:false}),true);
  assert.equal(head({widths,shaft,right:false}),false);assert.deepEqual(widths,before);
 }
});
test('blank, plain, broken, detached, blunt, nonlinear, plateau and unstable-body profiles prove no head',()=>{
 const normal=profile(),reverse=[...normal].reverse();
 const nonlinear=[...reverse];nonlinear[5]+=4;
 const plateau=[...reverse.slice(0,14),17,17,17,...Array(50).fill(4)];
 for(const widths of [[],Array(70).fill(0),Array(70).fill(4),normal.map((w,i)=>i===20?0:w),
  [...normal,0,0,0,0,0,0,0,0,0,0], [...Array(60).fill(4),...Array(14).fill(17)],
  nonlinear.reverse(),plateau.reverse(),[...Array(60).fill(7),...reverse.slice(0,14).reverse()]]){
  assert.equal(head({widths,shaft:4,right:true}),false);
 }
});
test('profile admission rejects sparse, extreme, invalid and accessor/proxy inputs without executing code',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'widths',{get(){calls++;throw Error('PRIVATE');}});
 const accessor=[];Object.defineProperty(accessor,'0',{get(){calls++;throw Error('PRIVATE');}});accessor.length=1;
 for(const input of [null,{},hostile,new Proxy({},{}),
  {widths:accessor,shaft:4,right:true},{widths:new Array(12),shaft:4,right:true},
  {widths:new Proxy(profile(),{}),shaft:4,right:true},
  ...[Array(514).fill(4),[1,NaN],[1,-1],[1,26],[1,.5]].map(widths=>({widths,shaft:4,right:true})),
  {widths:profile(),shaft:6,right:true},{widths:profile(),shaft:4,right:'PRIVATE'}])
  assert.throws(()=>head(input),e=>e instanceof TypeError&&!e.message.includes('PRIVATE'));
 assert.equal(calls,0);
});
