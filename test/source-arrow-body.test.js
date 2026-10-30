"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSourceArrowBody}=require("../packages/slideclone-core/routing/source-arrow-body");
const short=[3,4,3,4,4,4,4,9,13,11,10,8,7,5];
const forward=widths=>({widths,rightArrow:true,leftArrow:false});
test("a complete short head is separated from its stable contiguous body",()=>{
 const before=[...short],fit=measureSourceArrowBody(forward(short));
 assert.deepEqual(fit,{widthPx:4,firstBody:0,lastBody:6});assert.deepEqual(short,before);
 assert.deepEqual(measureSourceArrowBody({widths:[...short].reverse(),leftArrow:true,rightArrow:false}),
  {widthPx:4,firstBody:7,lastBody:13});
 const both=[3,5,7,9,11,13,9,4,4,4,4,4,4,4,4,4,4,9,13,11,9,7,5,3];
 assert.deepEqual(measureSourceArrowBody({widths:both,rightArrow:true,leftArrow:true}),
  {widthPx:4,firstBody:7,lastBody:16});
});
test("blank, plain, broken, wrong-direction, detached and thick profiles cannot create a body",()=>{
 for(const widths of [[],Array(14).fill(0),Array(14).fill(3),
  short.map((w,i)=>i===3?0:w),short.map((w,i)=>i<7?6:w),
  [3,4,3,4,4,4,4,9,13,11,10,8,7,5,0,0],
  [3,4,3,4,4,4,4,9,13,11,10,8,7,5,0,3]])
  assert.equal(measureSourceArrowBody(forward(widths)),null);
 assert.equal(measureSourceArrowBody({widths:short,rightArrow:false,leftArrow:true}),null);
 assert.equal(measureSourceArrowBody({widths:short,rightArrow:true,leftArrow:true}),null);
 assert.equal(measureSourceArrowBody({widths:short,rightArrow:false,leftArrow:false}),null);
});
test("profile boundaries reject malformed, sparse, extreme and hostile input without reading accessors",()=>{
 let calls=0;const hostile={get widths(){calls++;throw Error('PRIVATE');}};
 const array=[];Object.defineProperty(array,'0',{get(){calls++;throw Error('PRIVATE');}});array.length=1;
 for(const input of [null,{},hostile,new Proxy(forward(short),{}),forward(new Proxy(short,{})),forward(array),
  forward(new Array(12)),forward(Array(514).fill(3)),forward([1,NaN]),forward([1,26]),forward([1,-1]),forward([1,.5]),
  {...forward(short),rightArrow:'PRIVATE'}])
  assert.throws(()=>measureSourceArrowBody(input),e=>e instanceof TypeError&&!e.message.includes('PRIVATE'));
 assert.equal(calls,0);
});
