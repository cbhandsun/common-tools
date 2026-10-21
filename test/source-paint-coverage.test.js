"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourcePaintCoverageVariation}=require("../packages/slideclone-core/source-paint-coverage");
const {createInkCoreConsensus}=require("../packages/slideclone-core/source-ink-core-consensus");
const {detectMixedColorTextSegments}=require("../packages/slideclone-core/ocr-source-deck");
const background={r:245,g:249,b:253},paint=[20,35,60];
function sample(coverage){
 const rgb=paint.map((value,c)=>Math.round(value+(Object.values(background)[c]-value)*coverage));
 return {r:rgb[0],g:rgb[1],b:rgb[2],contrast:Math.hypot(...rgb.map((v,c)=>v-Object.values(background)[c]))};
}
test("the same opaque ink with sparse coverage and compression variation cannot justify gray color splits",()=>{
 const core=createInkCoreConsensus(40),ranges=[{startIndex:0,endIndex:2},{startIndex:2,endIndex:4}];
 for(let x=0;x<40;x++)for(let y=0;y<8;y++){
  const s=sample(x<20?0:.12+(x-20)*.012);core.observe(x,s.r,s.g,s.b,255,s.contrast);
 }
 assert.equal(core.hasPaintTransition(ranges,4),null);
 assert.equal(core.hasPaintTransition(ranges,4,background),false);
});
test("an independently witnessed gray or colored transition keeps the original transition decision",()=>{
 for(const second of [[70,70,70],[30,70,190]]){
  const core=createInkCoreConsensus(40);
  for(let x=0;x<40;x++)for(let i=0;i<8;i++){
   const color=x<20?[20,20,20]:second;
   core.observe(x,...color,255,Math.hypot(...color.map((v,c)=>v-Object.values(background)[c])));
  }
  assert.equal(core.hasPaintTransition([{startIndex:0,endIndex:2},{startIndex:2,endIndex:4}],4,background),true);
 }
});
test("missing cores, incompatible chroma and an unstable darkest witness do not acquire a coverage veto",()=>{
 assert.equal(sourcePaintCoverageVariation({background,groups:[[],[]]}),false);
 const a=Array.from({length:80},()=>sample(0)),b=Array.from({length:80},()=>({r:30,g:70,b:190,contrast:280}));
 assert.equal(sourcePaintCoverageVariation({background,groups:[a,b]}),false);
 const unstable=Array.from({length:8},(_,i)=>i<4?{r:20,g:200,b:20,contrast:400}:{r:200,g:20,b:200,contrast:400});
 assert.equal(sourcePaintCoverageVariation({background,groups:[unstable,unstable]}),false);
});
test("retained source observations are read without mutation and remain bounded at the largest column frame",()=>{
 const group=Array.from({length:65536},()=>Object.freeze(sample(0))),input={background,groups:[group,group]};
 Object.freeze(group);Object.freeze(input.groups);Object.freeze(input);
 assert.equal(sourcePaintCoverageVariation(input),true);
 assert.equal(group.length,65536);
 assert.throws(()=>sourcePaintCoverageVariation({background,groups:[Array.from({length:65553},()=>sample(0)),Array.from({length:65553},()=>sample(0))]}),RangeError);
});
test("coverage controls reject sparse, inherited, accessor, proxy, invalid and excessive input safely",()=>{
 let calls=0;const hostile={get r(){calls++;throw Error("private-content");},g:0,b:0,contrast:0};
 const good=Array.from({length:8},()=>sample(0));
 for(const input of [null,{}, {background,groups:[]},{background:new Proxy(background,{}),groups:[good,good]},
  {background,groups:new Proxy([good,good],{})},{background,groups:[new Array(8),good]},
  {background,groups:[[hostile],good]},{background,groups:[[Object.create(sample(0))],good]},
  {background:{r:Infinity,g:0,b:0},groups:[good,good]},{background,groups:[[{r:0,g:-1,b:0,contrast:0}],good]},
  {background,groups:[[{r:0,g:0,b:0,contrast:Infinity}],good]},{background,groups:[new Array(131073),good]}]){
  assert.throws(()=>sourcePaintCoverageVariation(input),e=>/invalid|boundary/.test(e.message)&&!e.message.includes("private-content"));
 }
 assert.equal(calls,0);
});
test("opaque coverage variations preserve a complete editable line rather than fictitious gray intervals",()=>{
 const image={width:160,height:24,rgba:Buffer.alloc(160*24*4)},line={text:"ABCDEFGHIJKLMNOP",box:{x:0,y:0,w:160,h:24},confidence:.99};
 for(let n=0;n<160*24;n++)image.rgba.set([...Object.values(background),255],n*4);
 for(let character=0;character<16;character++)for(let x=character*10+1;x<character*10+9;x++)for(let y=4;y<18;y++){
  const coverage=character<8?(y<5?0:.4):character===12?0:.2+((character-8)*7+y*3+x)%8/80,s=sample(coverage);
  image.rgba.set([s.r,s.g,s.b,255],(y*160+x)*4);
 }
 assert.equal(detectMixedColorTextSegments(image,line),null);
});
