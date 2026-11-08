"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {withSceneFillRasterCache:withCache,readSceneFillRaster:read,sceneFillRasterReadCost:cost}=require("../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache");
function fixture(){return {image:{width:40,height:30,rgba:Buffer.from(Array.from({length:4800},(_,i)=>i%256))},budget:{used:0},window:{x:3,y:4,w:10,h:12}};}

test('read cost is observational and agrees with charged pixels across overlaps, tile seams and scope bindings',()=>{
 const image={width:700,height:700,rgba:Buffer.alloc(700*700*4,255)},budget={used:0};
 const windows=[{x:60,y:60,w:512,h:512},{x:100,y:100,w:512,h:512},{x:60,y:60,w:1,h:1}];
 withCache(image,budget,()=>{
  for(const window of windows){
   const before=budget.used,expected=cost(image,window,budget);
   assert.equal(cost(image,window,budget),expected);assert.equal(budget.used,before);
   read(image,window,budget);assert.equal(budget.used-before,expected);
   assert.equal(cost(image,window,budget),0);
  }
  const window=windows[2];
  assert.equal(cost({...image,rgba:Buffer.from(image.rgba)},window,budget),1);
  assert.equal(cost(image,window,{used:budget.used}),1);
  withCache({...image,rgba:Buffer.from(image.rgba)},budget,()=>assert.equal(cost(image,window,budget),1));
  assert.equal(cost(image,window,budget),0);
 });
 assert.equal(cost(image,windows[2],budget),1);
});

test('an estimate never reserves allowance and the actual read still rejects exhaustion atomically',()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  read(f.image,f.window,f.budget);
  const expanded={...f.window,w:11};assert.equal(cost(f.image,expanded,f.budget),12);
  f.budget.used=3999999;
  assert.throws(()=>read(f.image,expanded,f.budget),RangeError);
  assert.equal(f.budget.used,3999999);assert.equal(cost(f.image,expanded,f.budget),12);
  assert.equal(cost(f.image,f.window,f.budget),0);
 });
});

test('cost estimation retains window limits and rejects hostile inputs without executing getters',()=>{
 const f=fixture();let calls=0;
 const getter={};Object.defineProperty(getter,'x',{get(){calls++;throw Error('sensitive-test-content');}});
 for(const window of [null,{},getter,new Proxy(f.window,{}),{...f.window,w:0},{...f.window,x:NaN},
  {...f.window,x:-1},{...f.window,x:39},{...f.window,w:0.5}])assert.throws(()=>cost(f.image,window,f.budget),TypeError);
 for(const image of [null,{},new Proxy(f.image,{}),{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(4800))}])
  assert.throws(()=>cost(image,f.window,f.budget),TypeError);
 for(const budget of [null,{},new Proxy(f.budget,{}),{used:-1},{used:Infinity}])assert.throws(()=>cost(f.image,f.window,budget),TypeError);
 const image={width:1024,height:1024,rgba:Buffer.alloc(1024*1024*4)};
 assert.equal(cost(image,{x:0,y:0,w:512,h:512},f.budget),262144);
 assert.throws(()=>cost(image,{x:0,y:0,w:512,h:513},f.budget),TypeError);
 assert.equal(f.budget.used,0);assert.equal(calls,0);
});
test('tile seams and evicted window copies preserve exact private snapshots and original cell accounting',()=>{
 const image={width:700,height:700,rgba:Buffer.from(Array.from({length:700*700*4},(_,i)=>i%251))},budget={used:0};
 withCache(image,budget,()=>{
  const first=read(image,{x:60,y:60,w:512,h:512},budget),expected=first.rgba[0];first.rgba[0]^=255;
  read(image,{x:100,y:100,w:512,h:512},budget);assert.equal(budget.used,301504);
  const crop=read(image,{x:60,y:60,w:1,h:1},budget);assert.equal(crop.rgba[0],expected);assert.equal(budget.used,301504);
 });
});
test("different color predicates and overlapping windows reuse owned source bytes only inside one synchronous measurement",()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  const a=read(f.image,f.window,f.budget),b=read(f.image,{...f.window},f.budget);assert.equal(a,b);assert.equal(f.budget.used,120);
  for(let y=0;y<12;y++)for(let x=0;x<10;x++)for(let c=0;c<4;c++)assert.equal(a.rgba[(y*10+x)*4+c],f.image.rgba[((y+4)*40+x+3)*4+c]);
  const extended=read(f.image,{...f.window,w:11},f.budget);assert.equal(f.budget.used,132);
  for(let y=0;y<12;y++)for(let c=0;c<4;c++)assert.equal(extended.rgba[(y*11+10)*4+c],f.image.rgba[((y+4)*40+13)*4+c]);
  read({...f.image,width:20,height:60},f.window,f.budget);assert.equal(f.budget.used,252);
 });
 read(f.image,f.window,f.budget);assert.equal(f.budget.used,372);
});

test("overlap is counted once across multiple strips and nested scopes retain byte snapshots",()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  const top={x:3,y:4,w:10,h:3},left={x:3,y:4,w:3,h:12};
  read(f.image,top,f.budget);read(f.image,left,f.budget);assert.equal(f.budget.used,57);
  withCache(f.image,f.budget,()=>{
   const full=read(f.image,f.window,f.budget);assert.equal(f.budget.used,120);
   for(let y=0;y<12;y++)for(let x=0;x<10;x++)for(let c=0;c<4;c++)assert.equal(full.rgba[(y*10+x)*4+c],f.image.rgba[((y+4)*40+x+3)*4+c]);
  });
  read(f.image,f.window,f.budget);assert.equal(f.budget.used,120);
 });
 read(f.image,f.window,f.budget);assert.equal(f.budget.used,240);
});

test("unread cells retain the 4M cap and failed overlap reads do not consume partial budget",()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  read(f.image,f.window,f.budget);f.budget.used=3999999;
  assert.throws(()=>read(f.image,{...f.window,w:11},f.budget),RangeError);assert.equal(f.budget.used,3999999);
  const one={x:12,y:15,w:2,h:1};read(f.image,one,f.budget);assert.equal(f.budget.used,4000000);
  assert.throws(()=>read(f.image,{x:20,y:20,w:1,h:1},f.budget),RangeError);
  read(f.image,f.window,f.budget);assert.equal(f.budget.used,4000000);
 });
});
test("a new measurement does not reuse stale source pixels and misses retain the 4M cap",()=>{
 const f=fixture();let initial;
 withCache(f.image,f.budget,()=>{initial=read(f.image,f.window,f.budget).rgba[0];});
 const offset=(4*40+3)*4;f.image.rgba[offset]^=255;
 withCache(f.image,f.budget,()=>assert.notEqual(read(f.image,f.window,f.budget).rgba[0],initial));assert.equal(f.budget.used,240);
 f.budget.used=4000000;assert.throws(()=>withCache(f.image,f.budget,()=>read(f.image,f.window,f.budget)),RangeError);assert.equal(f.budget.used,4000000);
});
test("failure restores the scope, and source stores cannot inject subarray or constructor accessors",()=>{
 const f=fixture();let calls=0;Object.defineProperty(f.image.rgba,"subarray",{get(){calls++;throw Error("secret");}});
 Object.defineProperty(f.image.rgba,"constructor",{get(){calls++;throw Error("secret");}});
 assert.throws(()=>withCache(f.image,f.budget,()=>{read(f.image,f.window,f.budget);throw Error("measurement failed");}),/measurement failed/u);
 read(f.image,f.window,f.budget);assert.equal(f.budget.used,240);assert.equal(calls,0);
});
test("invalid and hostile scopes or oversized windows fail without invoking controls",()=>{
 const f=fixture();let calls=0;const getter={};Object.defineProperty(getter,"width",{get(){calls++;throw Error("secret");}});
 for(const image of [null,{},getter,new Proxy(f.image,{}),{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(4800))}])
  assert.throws(()=>withCache(image,f.budget,()=>{}),TypeError);
 for(const window of [{...f.window,x:-1},{...f.window,w:Infinity},{...f.window,w:1000}])assert.throws(()=>read(f.image,window,f.budget),TypeError);
 assert.equal(calls,0);assert.equal(f.budget.used,0);
 const windowGetter={};Object.defineProperty(windowGetter,"x",{get(){calls++;throw Error("secret");}});
 for(const window of [windowGetter,new Proxy(f.window,{}),null])assert.throws(()=>read(f.image,window,f.budget),TypeError);
 for(const budget of [{used:-1},{used:Infinity},new Proxy({used:0},{})])assert.throws(()=>read(f.image,f.window,budget),TypeError);
 assert.throws(()=>read({...f.image,rgba:new Uint8Array(new SharedArrayBuffer(4800))},f.window,f.budget),TypeError);
 assert.equal(calls,0);assert.equal(f.budget.used,0);
});
