"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {classifySourceRowComponents:classify}=require('../packages/slideclone-core/source-row-component-ownership');
function fixture(){const width=20,height=20,ink=new Uint8Array(400);
 for(let y=3;y<7;y++)for(let x=4;x<14;x++)ink[y*width+x]=1;
 for(let y=13;y<17;y++)for(let x=4;x<14;x++)ink[y*width+x]=1;
 return {width,height,ink,rows:[{x:3,y:2,w:12,h:6},{x:3,y:12,w:12,h:6}]};}
test('complete rows keep entire strokes and never change source data',()=>{
 const input=fixture(),before=input.ink.slice(),result=classify(input);assert.ok(result);
 assert.deepEqual(result.knownPixels,[40,40]);assert.equal(result.unknownPixels,0);assert.equal(result.components,2);
 assert.equal(result.owners[4*20+5],1);assert.equal(result.owners[14*20+5],2);assert.deepEqual(input.ink,before);
 // Overlapping recognition envelopes do not split the physical components.
 input.rows[0].h=13;input.rows[1].y=6;input.rows[1].h=12;
 const overlap=classify(input);assert.ok(overlap);assert.deepEqual(overlap.knownPixels,[40,40]);
});
test('detached and clipped unknown ink is preserved explicitly regardless of size',()=>{
 const input=fixture();input.ink[3*20+18]=1;input.ink[2*20]=1;
 const result=classify(input);assert.ok(result);assert.equal(result.unknownPixels,2);
 assert.equal(result.owners[3*20+18],255);assert.equal(result.owners[2*20],255);assert.deepEqual(result.knownPixels,[40,40]);
 // A whole connected stroke becomes unresolved if it leaves the observation.
 for(let x=0;x<4;x++)input.ink[4*20+x]=1;
 assert.equal(classify(input),null);
});
test('empty, single-row and connected cross-row evidence cannot prove two rows',()=>{
 const empty=fixture();empty.ink.fill(0);assert.equal(classify(empty),null);
 const one=fixture();one.ink.fill(0,10*20);assert.equal(classify(one),null);
 const crossing=fixture();for(let y=6;y<=13;y++)crossing.ink[y*20+9]=1;assert.equal(classify(crossing),null);
});
test('invalid, extreme and hostile inputs fail without executing input code',()=>{
 let calls=0;const input=fixture(),row={get x(){calls++;throw Error('private');},y:0,w:1,h:1};
 for(const bad of [null,{},new Proxy(input,{get(){calls++;throw Error('private');}}),{...input,width:0},
  {...input,width:513,height:512},{...input,rows:[row,input.rows[1]]},{...input,rows:[...input.rows].reverse()},
  {...input,rows:new Array(2)},{...input,rows:new Proxy(input.rows,{})},{...input,rows:[{x:0,y:NaN,w:1,h:1},input.rows[1]]},
  {...input,rows:Array(5).fill(input.rows[0])},{...input,ink:new Proxy(input.ink,{})},
  {...input,ink:new Uint8Array(new SharedArrayBuffer(400))},{...input,ink:new Uint8Array(399)}])assert.throws(()=>classify(bad),TypeError);
 input.ink[0]=2;assert.throws(()=>classify(input),TypeError);assert.equal(calls,0);
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});
