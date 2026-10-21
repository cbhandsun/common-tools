"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceWordRetryFrame}=require("../packages/slideclone-core/source-word-retry-frame");
function fixture(){return {width:300,height:300,hint:{x:80,y:60,w:100,h:160},margin:40,
 sides:{left:false,right:true,top:false,bottom:true},neighbors:[]};}
test("retry grows only independently censored sides and preserves the first observed window",()=>{
 const input=fixture(),before=structuredClone(input);
 assert.deepEqual(sourceWordRetryFrame(input),{x:78,y:58,w:142,h:202});assert.deepEqual(input,before);
 assert.deepEqual(sourceWordRetryFrame({...input,sides:{left:false,right:false,top:false,bottom:false}}),{x:78,y:58,w:104,h:164});
});
test("neighbor seeds restrict a search without clipping its original observation or borrowing their pixels",()=>{
 const input=fixture();input.neighbors=[{x:190,y:65,w:30,h:80},{x:90,y:240,w:80,h:20}];
 assert.deepEqual(sourceWordRetryFrame(input),{x:78,y:58,w:112,h:182});
 // An overlapping or touching seed cannot cut already observed text; source
 // closure and the separate frame-owner veto still decide its eligibility.
 assert.deepEqual(sourceWordRetryFrame({...input,neighbors:[{x:180,y:65,w:30,h:80}]}),{x:78,y:58,w:104,h:202});
 assert.deepEqual(sourceWordRetryFrame({...input,neighbors:[{x:250,y:0,w:20,h:20}]}),{x:78,y:58,w:142,h:202});
});
test("opposite sides, fractional seeds and physical page edges remain bounded",()=>{
 const input={...fixture(),hint:{x:5.5,y:5.5,w:50,h:50},sides:{left:true,right:false,top:true,bottom:false},neighbors:[]};
 assert.deepEqual(sourceWordRetryFrame(input),{x:0,y:0,w:58,h:58});
 const edge={...fixture(),hint:{x:240,y:240,w:60,h:60},sides:{left:false,right:true,top:false,bottom:true}};
 assert.deepEqual(sourceWordRetryFrame(edge),{x:238,y:238,w:62,h:62});
});
test("all neighbor orders retain the same bounded frame",()=>{
 const input=fixture(),neighbors=[{x:195,y:65,w:30,h:80},{x:190,y:65,w:30,h:80},{x:90,y:240,w:80,h:20}];
 assert.deepEqual(sourceWordRetryFrame({...input,neighbors}),sourceWordRetryFrame({...input,neighbors:[...neighbors].reverse()}));
});

test('half-open windows observe adjacent blank cells but never enter fractional neighbors',()=>{
 const input=fixture();
 const neighbors=[{x:190.5,y:65,w:30,h:80},{x:90,y:240.5,w:80,h:20}];
 const result=sourceWordRetryFrame({...input,neighbors});
 assert.equal(result.x+result.w,190);assert.equal(result.y+result.h,240);
 const upperLeft=sourceWordRetryFrame({...input,sides:{left:true,right:false,top:true,bottom:false},
  neighbors:[{x:35.5,y:65,w:30,h:80},{x:90,y:15.5,w:80,h:30}]});
 assert.equal(upperLeft.x,66);assert.equal(upperLeft.y,46);
});
test("illegal, extreme, sparse and hostile controls fail without invoking user code",()=>{
 const input=fixture();let calls=0;const accessor=Object.defineProperty({},"width",{get(){calls++;throw Error('PRIVATE')}});
 const badArray=[];Object.defineProperty(badArray,'0',{get(){calls++;throw Error('PRIVATE')}});badArray.length=1;
 for(const value of [null,{},accessor,new Proxy(input,{}),{...input,width:0},{...input,width:16385},{...input,height:Infinity},
  {...input,margin:65},{...input,margin:1},{...input,hint:{...input.hint,x:-1}},
  {...input,sides:{...input.sides,left:1}},{...input,sides:{...input.sides,extra:true}},
  {...input,neighbors:null},{...input,neighbors:new Array(1)},{...input,neighbors:badArray},
  {...input,neighbors:new Proxy([], {})},{...input,neighbors:[{x:299,y:0,w:2,h:1}]},
  {...input,neighbors:Array(10001).fill({x:0,y:0,w:1,h:1})}])
  assert.throws(()=>sourceWordRetryFrame(value),error=>error instanceof TypeError&&!error.message.includes('PRIVATE'));
 assert.equal(calls,0);
});
test("the search-frame regressions participate in unified unit CI",()=>{
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
