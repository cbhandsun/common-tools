"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceBox2D}=require("../packages/slideclone-core/source-scene-coordinate-frame");
test("model corner boxes use normalized Y-X order with an explicit source transform",()=>{
 const box={x:80,y:120,w:160,h:180},dimensions={width:800,height:600};
 assert.deepEqual(sourceBox2D(box,dimensions),[200,100,500,300]);
 assert.deepEqual(box,{x:80,y:120,w:160,h:180});
 for(const d of [{width:1,height:1},{width:16384,height:1},{width:4000,height:10000}])
  assert.deepEqual(sourceBox2D({x:0,y:0,w:d.width,h:d.height},d),[0,0,1000,1000]);
});
test("outward rounding preserves fractional OCR and sheet candidate envelopes",()=>{
 const d={width:1312,height:1199},b={x:237.4,y:184.2,w:43.1,h:35.2},n=sourceBox2D(b,d);
 assert.ok(n.every(Number.isSafeInteger));assert.ok(n[0]*d.height/1000<=b.y);assert.ok(n[1]*d.width/1000<=b.x);
 assert.ok(n[2]*d.height/1000>=b.y+b.h);assert.ok(n[3]*d.width/1000>=b.x+b.w);
 assert.deepEqual(sourceBox2D({x:1311,y:1198,w:1,h:1},d),[999,999,1000,1000]);
});
test("empty, invalid, out of page and excessive source frames fail without clipping",()=>{
 const b={x:1,y:2,w:3,h:4},d={width:100,height:80};
 for(const bad of [null,{}, {...b,x:-1},{...b,w:0},{...b,h:Infinity},{...b,x:99},{...b,y:79},{...b,w:"3"}])assert.throws(()=>sourceBox2D(bad,d),/Scene coordinate/);
 for(const bad of [null,{}, {width:1.5,height:1},{width:16385,height:1},{width:4001,height:10000}])assert.throws(()=>sourceBox2D(b,bad),/Scene coordinate/);
});
test("hostile coordinate records cannot execute accessors, proxies or coercion hooks",()=>{
 let calls=0;const hostile={get x(){calls++;throw Error("private-token");}},b={x:1,y:2,w:3,h:4},d={width:100,height:80};
 for(const value of [hostile,new Proxy(b,{}),{...b,w:{valueOf(){calls++;return 3;}}}])assert.throws(()=>sourceBox2D(value,d),/Scene coordinate/);
 assert.throws(()=>sourceBox2D(b,new Proxy(d,{})),/Scene coordinate/);assert.equal(calls,0);
});
