"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {isolateSourceWordInk}=require("../packages/slideclone-core/typography/source-word-ink-components");
function fixture(){const width=20,height=16,ink=new Uint8Array(width*height);
 for(let y=5;y<11;y++)for(let x=6;x<14;x++)ink[y*width+x]=1;
 return {width,height,ink,seed:{x:3,y:3,w:14,h:10}};}
test('a complete independent neighboring component cannot censor this text, but shared ink stays protected',()=>{
 const input=fixture();input.ink[8]=1;
 assert.equal(isolateSourceWordInk(input).censored,true);
 const neighborBoxes=[{x:6,y:0,w:5,h:2}],before=input.ink.slice();
 const result=isolateSourceWordInk({...input,neighborBoxes});
 assert.equal(result.censored,false);assert.equal(result.ink[8],0);assert.equal(result.ink.reduce((a,b)=>a+b,0),48);
 assert.deepEqual(input.ink,before);
 assert.equal(isolateSourceWordInk({...input,neighborBoxes:[]}).censored,true);
 assert.equal(isolateSourceWordInk({...input,neighborBoxes:[{x:9,y:0,w:2,h:2}]}).censored,true);
 for(let y=1;y<5;y++)input.ink[y*20+8]=1;
 assert.equal(isolateSourceWordInk({...input,neighborBoxes:[{x:6,y:0,w:5,h:8}]}).censored,true);
});
test('neighbor input is bounded and hostile geometry is rejected before access',()=>{
 let calls=0;const accessor={get x(){calls++;return 0;},y:0,w:2,h:2};
 for(const neighborBoxes of [null,{},new Array(1),new Proxy([],{}),[accessor],[new Proxy({x:0,y:0,w:2,h:2},{})],
  [{x:-1,y:0,w:2,h:2}],[{x:0,y:0,w:Infinity,h:2}],[{x:19,y:0,w:2,h:2}],Array(10001).fill({x:0,y:0,w:1,h:1})])
  assert.throws(()=>isolateSourceWordInk({...fixture(),neighborBoxes}),TypeError);
 assert.equal(calls,0);
 const input=fixture();input.ink[8]=1;
 const unrelated=Array(400).fill({x:0,y:0,w:1,h:1});
 // A late ownership claim must not evade the bounded-comparison fallback.
 assert.equal(isolateSourceWordInk({...input,neighborBoxes:[...unrelated,{x:6,y:0,w:5,h:2}]}).censored,true);
});
test("only independent context components are excluded, without changing the input",()=>{
 const input=fixture();for(let y=0;y<input.height;y++)input.ink[y*input.width]=1;
 const before=input.ink.slice(),result=isolateSourceWordInk(input);
 assert.equal(result.censored,false);assert.equal(result.unseededComponents,1);
 assert.equal(result.ink.reduce((sum,v)=>sum+v,0),48);assert.equal(result.columns[6],6);
 assert.deepEqual(input.ink,before);
 assert.deepEqual(result.censoredSides,{left:false,right:false,top:false,bottom:false});
});
test("retry directions come only from retained observed boundary ink, including detached accents",()=>{
 const top=fixture();top.ink[8]=1;
 assert.deepEqual(isolateSourceWordInk(top).censoredSides,{left:false,right:false,top:true,bottom:false});
 const right=fixture();for(let x=14;x<20;x++)right.ink[8*20+x]=1;
 assert.deepEqual(isolateSourceWordInk(right).censoredSides,{left:false,right:true,top:false,bottom:false});
 const all=fixture();all.ink.fill(1);
 assert.deepEqual(isolateSourceWordInk(all).censoredSides,{left:true,right:true,top:true,bottom:true});
});
test("connected clipped strokes and nearby detached accents remain censored",()=>{
 for(const connected of [false,true]){const input=fixture();input.ink[8]=1;
  if(connected)for(let y=1;y<5;y++)input.ink[y*input.width+8]=1;
  const result=isolateSourceWordInk(input);assert.equal(result.censored,true);assert.equal(result.unseededComponents,0);
  assert.equal(result.ink[8],1);
 }
 const diagonal=fixture();for(let y=0;y<6;y++)diagonal.ink[y*20+6+y]=1;
 assert.equal(isolateSourceWordInk(diagonal).censored,true);
});
test("no glyph seed and an empty mask grant no source geometry",()=>{
 const empty=fixture();empty.ink.fill(0);const result=isolateSourceWordInk(empty);
 assert.equal(result.ink.some(Boolean),false);assert.equal(result.censored,false);
 empty.ink[0]=1;const foreign=isolateSourceWordInk(empty);
 assert.equal(foreign.ink.some(Boolean),false);assert.equal(foreign.unseededComponents,1);
});
test("invalid, extreme, shared and hostile snapshots fail without invoking user code",()=>{
 let calls=0;const accessor={};Object.defineProperty(accessor,"ink",{get(){calls++;throw Error('private-content');}});
 const source=fixture(),shared=new Uint8Array(new SharedArrayBuffer(source.ink.length));
 for(const input of [null,{},accessor,new Proxy(source,{}),{...source,width:0},{...source,width:16385},{...source,width:1000,height:1000},
  {...source,ink:shared},{...source,ink:new Proxy(source.ink,{})},{...source,ink:new Uint8Array(1)},
  {...source,seed:{...source.seed,x:NaN}},{...source,seed:{...source.seed,w:Infinity}},{...source,seed:{...source.seed,x:-1}},
  {...source,seed:{...source.seed,x:19}},{...source,seed:new Proxy(source.seed,{})}]){
  assert.throws(()=>isolateSourceWordInk(input),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 }
 const invalid=fixture();invalid.ink[0]=2;assert.throws(()=>isolateSourceWordInk(invalid),TypeError);
 assert.equal(calls,0);
});
test("extreme admitted snapshots stay bounded and are found by unified unit CI",()=>{
 const input={width:512,height:512,ink:new Uint8Array(262144).fill(1),seed:{x:1,y:1,w:510,h:510}};
 const result=isolateSourceWordInk(input);assert.equal(result.censored,true);assert.equal(result.ink.length,262144);
 assert.equal(result.ink.reduce((sum,v)=>sum+v,0),262144);
 const {classifyTestFile}=require("../scripts/test-suites");assert.equal(classifyTestFile(__filename),"unit");
});
