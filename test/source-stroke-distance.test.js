"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {squaredSourceStrokeDistances}=require('../packages/slideclone-core/routing/source-stroke-distance');
test('exact squared distances agree with an exhaustive geometric oracle including diagonal strokes',()=>{
 for(let w=1;w<=12;w++)for(let h=1;h<=12;h++){
  const mask=Uint8Array.from({length:w*h},(_,i)=>(i*17+w*3+h)%7?1:0),before=mask.slice();
  const result=squaredSourceStrokeDistances({width:w,height:h,mask});
  for(let i=0;i<mask.length;i++){
   let expected=w*w+h*h+1;
   for(let j=0;j<mask.length;j++)if(!mask[j])expected=Math.min(expected,(i%w-j%w)**2+(Math.floor(i/w)-Math.floor(j/w))**2);
   assert.equal(result[i],expected);
  }
  assert.deepEqual(mask,before);
 }
});
test('empty ink and solid masks do not invent an exterior or mutate their source',()=>{
 assert.deepEqual([...squaredSourceStrokeDistances({width:2,height:2,mask:new Uint8Array(4)})],[0,0,0,0]);
 assert.deepEqual([...squaredSourceStrokeDistances({width:2,height:2,mask:new Uint8Array(4).fill(1)})],[9,9,9,9]);
 const backing=new Uint8Array([99,0,1,1,99]);
 assert.deepEqual([...squaredSourceStrokeDistances({width:3,height:1,mask:backing.subarray(1,4)})],[0,1,4]);
});
test('invalid and hostile windows fail without invoking provider code or exposing content',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'mask',{get(){calls++;throw Error('private-token');}});
 const base={width:2,height:2,mask:new Uint8Array(4)};
 for(const value of [null,[],hostile,new Proxy(base,{}),{...base,width:0},{...base,height:NaN},{...base,width:16385},
  {...base,width:1024,height:1024},{...base,mask:new Uint8Array(3)},{...base,mask:new Uint8Array(4).fill(2)},
  {...base,mask:new Proxy(new Uint8Array(4),{})},{...base,mask:new Uint8Array(new SharedArrayBuffer(4))}]){
  assert.throws(()=>squaredSourceStrokeDistances(value),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 }
 assert.equal(calls,0);
});
test('maximum admitted window stays finite under the original unit ceiling',()=>{
 const mask=new Uint8Array(262144).fill(1);mask[0]=0;
 const result=squaredSourceStrokeDistances({width:512,height:512,mask});
 assert.equal(result[262143],2*511*511);
 assert.ok(result.every(Number.isFinite));
});
