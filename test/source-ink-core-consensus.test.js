"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createInkCoreConsensus}=require("../packages/slideclone-core/source-ink-core-consensus");
const {detectMixedColorTextSegments}=require("../packages/slideclone-core/ocr-source-deck");

test('paint interval measurement is bounded, source-only and rejects unsafe controls',()=>{
 const core=createInkCoreConsensus(20);assert.equal(core.proposePaintForColumns(0,20),null);
 for(let x=0;x<20;x++)for(let i=0;i<8;i++)core.observe(x,x<10?17:180,x<10?17:40,x<10?17:15,255,400);
 assert.deepEqual(core.proposePaintForColumns(0,10),{r:17,g:17,b:17});
 assert.deepEqual(core.proposePaintForColumns(10,20),{r:180,g:40,b:15});
 let calls=0;const unsafe={valueOf(){calls++;throw Error('unsafe');}};
 for(const args of [[unsafe,20],[0,21],[-1,1],[0,0],[NaN,1],[.5,2],[0,Infinity]])assert.throws(()=>core.proposePaintForColumns(...args),TypeError);
 assert.equal(calls,0);
});

test('median paint proposals resist isolated compression extrema without changing consensus authority',()=>{
 const core=createInkCoreConsensus(10);
 for(let x=0;x<10;x++)for(let i=0;i<8;i++)core.observe(x,180,43,5,255,300);
 core.observe(0,100,0,0,255,420);
 assert.deepEqual(core.proposePaintForColumns(0,10),{r:180,g:43,b:5});
 // A proposal does not bypass the original strict source-consensus verdict.
 assert.equal(core.isUniform(1),false);
 const transparent=createInkCoreConsensus(10);
 for(let x=0;x<10;x++)transparent.observe(x,180,43,5,180,300);
 assert.equal(transparent.proposePaintForColumns(0,10),null);
});

function fixture(second=[20,20,20],transparent=false) {
  const image={width:160,height:24,rgba:Buffer.alloc(160*24*4,255)};
  for(let char=0;char<16;char++) for(let x=char*10+1;x<char*10+9;x++) for(let y=4;y<18;y++) {
    const core=char<8?y<7:y<14;
    const rgb=core?(char<8?[20,20,20]:second):[180,180,180];
    image.rgba.set([...rgb,transparent?180:255],(y*160+x)*4);
  }
  return {image,line:{text:"ABCDEFGHIJKLMNOP",box:{x:0,y:0,w:160,h:24},confidence:.99}};
}

test("antialias coverage cannot split a single opaque paint into false gray text segments",()=>{
  const f=fixture();assert.equal(detectMixedColorTextSegments(f.image,f.line),null);
});
test("real gray and colored paint transitions retain their editable segments",()=>{
  for(const color of [[70,70,70],[30,70,190]]) {
    const f=fixture(color),segments=detectMixedColorTextSegments(f.image,f.line);
    assert.ok(segments);assert.equal(segments.map(s=>s.text).join(""),f.line.text);
    assert.ok(segments.length>=2);
  }
});
test("empty, missing and nonopaque cores cannot veto a split",()=>{
  const empty=createInkCoreConsensus(20);assert.equal(empty.isUniform(2),false);
  for(let col=0;col<10;col++)for(let i=0;i<8;i++)empty.observe(col,20,20,20,255,400);
  assert.equal(empty.isUniform(2),false);
  const transparent=createInkCoreConsensus(20);
  for(let col=0;col<20;col++)for(let i=0;i<16;i++)transparent.observe(col,20,20,20,180,400);
  assert.equal(transparent.isUniform(2),false);
  const f=fixture([20,20,20],true);assert.ok(detectMixedColorTextSegments(f.image,f.line));
});
test("invalid and hostile controls reject without evaluating user properties or leaking content",()=>{
  let calls=0;const hostile={get count(){calls++;throw Error("private-content");}};
  for(const width of [0,-1,16385,Infinity,"20",hostile,new Proxy({}, {})])
    assert.throws(()=>createInkCoreConsensus(width),e=>/invalid/.test(e.message)&&!e.message.includes("private-content"));
  const core=createInkCoreConsensus(20);
  for(const count of [0,513,Infinity,"2",hostile])assert.throws(()=>core.isUniform(count),/invalid/);
  for(const args of [[20,0,0,0,255,400],[0,-1,0,0,255,400],[0,0,0,0,256,400],[0,0,0,0,255,Infinity]])
    assert.throws(()=>core.observe(...args),/invalid/);
  assert.equal(calls,0);assert.equal(core.isUniform(2),false);
});
test("retained column evidence stays bounded under extreme repeated observations",()=>{
  const core=createInkCoreConsensus(16384);
  for(let i=0;i<10000;i++)core.observe(0,20,20,20,255,400);
  assert.equal(core.isUniform(512),false);
});

test("a narrow character cannot turn antialias coverage into a new paint run",()=>{
  const f=fixture();
  for(let y=0;y<24;y++)for(let x=20;x<30;x++)f.image.rgba.set([255,255,255,255],(y*160+x)*4);
  for(let y=4;y<18;y++)f.image.rgba.set(y<7?[20,20,20,255]:[180,180,180,255],(y*160+24)*4);
  assert.equal(detectMixedColorTextSegments(f.image,f.line),null);
  const gray=fixture([70,70,70]);
  for(let y=0;y<24;y++)for(let x=20;x<30;x++)gray.image.rgba.set([255,255,255,255],(y*160+x)*4);
  for(let y=4;y<18;y++)gray.image.rgba.set(y<7?[20,20,20,255]:[180,180,180,255],(y*160+24)*4);
  assert.ok(detectMixedColorTextSegments(gray.image,gray.line));
});

test("paint-run corroboration keeps missing and competing evidence unknown",()=>{
  const ranges=[{startIndex:0,endIndex:1},{startIndex:1,endIndex:2}],core=createInkCoreConsensus(20);
  assert.equal(core.hasPaintTransition(ranges,2),null);
  for(let x=0;x<20;x++)for(let i=0;i<8;i++)core.observe(x,20,20,20,255,400);
  assert.equal(core.hasPaintTransition(ranges,2),false);
  const mixed=createInkCoreConsensus(20);
  for(let x=0;x<20;x++)for(let i=0;i<8;i++)mixed.observe(x,x<10?20:70,x<10?20:70,x<10?20:70,255,x<10?400:300);
  assert.equal(mixed.hasPaintTransition(ranges,2),true);
  const competing=createInkCoreConsensus(40);
  for(let x=0;x<40;x++)for(let i=0;i<8;i++){
    const color=x<20||x===20?20:70;competing.observe(x,color,color,color,255,color===20?400:300);
  }
  assert.equal(competing.hasPaintTransition([{startIndex:0,endIndex:2},{startIndex:2,endIndex:4}],4),null);
});

test("paint-run controls validate fully without invoking unsafe properties",()=>{
  const core=createInkCoreConsensus(20);let calls=0;
  const bad={get startIndex(){calls++;throw Error("private-content");},endIndex:1};
  for(const ranges of [new Array(2),new Proxy([],{}),[bad,{startIndex:1,endIndex:2}],
    [{startIndex:0,endIndex:1},{startIndex:2,endIndex:3}],
    [{startIndex:0,endIndex:1},{startIndex:1,endIndex:Infinity}]]){
    assert.throws(()=>core.hasPaintTransition(ranges,2),e=>/invalid/.test(e.message)&&!e.message.includes("private-content"));
  }
  assert.equal(calls,0);
});
