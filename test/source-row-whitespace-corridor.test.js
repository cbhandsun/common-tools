"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {findSourceRowWhitespaceCorridor:find}=require('../packages/slideclone-core/scene-plan/source-row-whitespace-corridor');
function fixture(){const width=12,height=12,ink=new Uint8Array(width*height);
 for(let x=1;x<width-1;x++){ink[2*width+x]=1;ink[9*width+x]=1;}
 return {width,height,ink,upperCenter:2,lowerCenter:9,preferredRow:5};}
test('a continuous clear corridor is deterministic and leaves its observation unchanged',()=>{
 const input=fixture(),before=input.ink.slice();assert.deepEqual(find(input),Array(12).fill(5));assert.deepEqual(input.ink,before);
 input.ink[5*12+5]=1;const seam=find(input);assert.ok(seam);
 for(let x=0;x<12;x++){assert.equal(input.ink[seam[x]*12+x],0);assert.equal(input.ink[(seam[x]+1)*12+x],0);
  if(x){assert.ok(Math.abs(seam[x]-seam[x-1])<=1);
   for(let y=Math.min(seam[x],seam[x-1]);y<=Math.max(seam[x],seam[x-1])+1;y++){
    assert.equal(input.ink[y*12+x],0);assert.equal(input.ink[y*12+x-1],0);
   }
  }
 }
 assert.deepEqual(find(input),seam);
});
test('empty, one-sided, blocked and diagonally connected observations grant no corridor',()=>{
 const empty=fixture();empty.ink.fill(0);assert.equal(find(empty),null);
 empty.ink[2*12+5]=1;assert.equal(find(empty),null);
 const blocked=fixture();for(let y=2;y<=9;y++)blocked.ink[y*12+6]=1;assert.equal(find(blocked),null);
 const diagonal=fixture();for(let y=2;y<=9;y++)diagonal.ink[y*12+y]=1;assert.equal(find(diagonal),null);
 const thin=fixture();thin.ink.fill(1);for(let x=0;x<12;x++)thin.ink[5*12+x]=0;assert.equal(find(thin),null);
});
test('hostile and invalid external data fail before invoking getters or proxy traps',()=>{
 let calls=0;const input=fixture(),getter={...input};Object.defineProperty(getter,'width',{get(){calls++;throw Error('private');}});
 const proxy=new Proxy(input,{get(){calls++;throw Error('private');}});
 for(const bad of [null,{},getter,proxy,{...input,ink:new Proxy(input.ink,{})},{...input,ink:new Uint8Array(new SharedArrayBuffer(144))},
  {...input,width:0},{...input,width:16385},{...input,width:513,height:512},{...input,upperCenter:NaN},
  {...input,lowerCenter:Infinity},{...input,preferredRow:-1},{...input,upperCenter:9},{...input,lowerCenter:12},
  {...input,ink:new Uint8Array(143)}])assert.throws(()=>find(bad),TypeError);
 input.ink[0]=2;assert.throws(()=>find(input),TypeError);assert.equal(calls,0);
});
test('the maximum admitted source window stays bounded and unified CI discovers the test',()=>{
 const width=512,height=512,ink=new Uint8Array(width*height);ink[width+1]=1;ink[(height-2)*width+1]=1;
 assert.deepEqual(find({width,height,ink,upperCenter:1,lowerCenter:510,preferredRow:255}),Array(width).fill(255));
 const {classifyTestFile}=require('../scripts/test-suites');
 assert.equal(classifyTestFile(__filename),'unit');
});
