"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {isolateClosedSourceRing:isolate,hasClosedRingTopology:topology}=require("../packages/slideclone-core/source-closed-ring");
const {traceNativeMaskContours:trace}=require("../packages/slideclone-core/native-mask-contours");
const {ringTouchesUnobservedCore:censored}=require("../packages/slideclone-core/source-closed-ring");

test("retained cells beside a skipped core remain censored, while observed perimeter cells and empty cores are complete",()=>{
 const window={x0:10,y0:20,x1:100,y1:100,margin:8};
 for(const p of [{x:25,y:50},{x:84,y:50},{x:50,y:35},{x:50,y:84}])assert.equal(censored({window,points:[p]}),true);
 for(const p of [{x:10,y:20},{x:24,y:50},{x:50,y:34},{x:25,y:35}])assert.equal(censored({window,points:[p]}),false);
 assert.equal(censored({window,points:[]}),false);
 assert.equal(censored({window:{x0:10,y0:20,x1:30,y1:40,margin:8},points:[{x:25,y:35}]}),false);
});

test("observation frames reject invalid, excessive and hostile controls without invoking accessors",()=>{
 const valid={window:{x0:10,y0:20,x1:100,y1:100,margin:8},points:[{x:25,y:50}]};
 let calls=0;const hostile={};Object.defineProperty(hostile,"window",{get(){calls++;throw Error("private-source");}});
 for(const input of [null,{},hostile,new Proxy(valid,{}),{...valid,points:new Array(1)},
  {...valid,points:new Proxy([],{})},{...valid,points:Array(262145).fill({x:25,y:50})},
  {...valid,points:[{x:9,y:50}]},{...valid,points:[{x:25,y:50.5}]},
  ...[0,29,Infinity].map(margin=>({...valid,window:{...valid.window,margin}}))])assert.throws(()=>censored(input),TypeError);
 assert.equal(calls,0);
});
function fixture(x=300,y=400){
 const points=[];for(let cy=y;cy<y+60;cy++)for(let cx=x;cx<x+80;cx++)if(cx<x+3||cx>=x+77||cy<y+3||cy>=y+57)points.push({x:cx,y:cy});
 for(let cx=x+80;cx<x+100;cx++)for(let cy=y+28;cy<y+31;cy++)points.push({x:cx,y:cy});
 return {points,bounds:{x,y,w:100,h:60},hint:{x,y,w:80,h:60}};
}
test("a shifted closed source ring retains original point identities and removes the attached connector branch",()=>{
 for(const [x,y] of [[0,0],[300,400],[700,900]]){
  const f=fixture(x,y),result=isolate(f);assert.ok(result);assert.ok(result.points.every(p=>f.points.includes(p)));
  assert.equal(result.box.x,x);assert.equal(result.box.y,y);assert.ok(result.box.w<100);assert.ok(result.box.w>=80);
  assert.ok(topology(trace(result.points,result.box,{tolerancePx:1.5})));
  assert.equal(JSON.stringify(f),JSON.stringify(fixture(x,y)));
 }
});
test("open source rings and competing large holes have no unique closed perimeter",()=>{
 const f=fixture();f.points=f.points.filter(p=>!(p.y<403&&p.x>330&&p.x<340));assert.equal(isolate(f),null);
 const g=fixture();const second=fixture(410,400);g.points.push(...second.points);g.bounds.w=210;assert.equal(isolate(g),null);
 assert.equal(isolate({...fixture(),points:[]}),null);assert.equal(isolate({...fixture(),bounds:{x:0,y:0,w:600,h:600}}),null);
});
test("unexplained small holes are retained in the path and do not replace its large interior",()=>{
 const f=fixture();f.points=f.points.filter(p=>!(p.x===320&&p.y===401));
 const segments=trace(f.points,f.bounds,{tolerancePx:1.5});
 assert.ok(topology(segments));assert.equal(segments.filter(s=>s.type==="moveTo").length,3);assert.ok(segments.length<=120);
 assert.equal(topology(trace([{x:1,y:1}],{x:1,y:1,w:1,h:1})),false);assert.equal(topology(null),false);
});
test("invalid source frames, duplicate pixels and hostile controls fail without invoking accessors",()=>{
 let calls=0;const getter={};Object.defineProperty(getter,"points",{get(){calls++;throw Error("secret");}});
 const f=fixture(),list=[];Object.defineProperty(list,"0",{get(){calls++;throw Error("secret");}});list.length=1;
 for(const value of [null,{},getter,new Proxy(f,{}),{...f,points:new Array(1)},{...f,points:list},
  {...f,points:[f.points[0],f.points[0]]},{...f,points:[{x:-1,y:400}]},{...f,hint:{x:Infinity,y:0,w:1,h:1}},
  {...f,bounds:{x:300,y:400,w:Infinity,h:60}}])assert.throws(()=>isolate(value),TypeError);
 assert.equal(calls,0);
});

test('bounded source-hole distance is exact in every direction, including empty and extreme aspect frames',()=>{
 const {sourceRingDistance}=require('../packages/slideclone-core/source-ring-distance');
 for(const [w,h,hole]of [[1,1,[]],[1,1,[0]],[1,31,[2,28]],[31,1,[2,28]],[23,19,[24,194,356]]]){
  const dist=sourceRingDistance(w,h,hole);
  for(let n=0;n<w*h;n++)assert.equal(dist[n],Math.min(...hole.map(p=>(n%w-p%w)**2+(Math.floor(n/w)-Math.floor(p/w))**2)));
 }
 const dist=sourceRingDistance(512,512,[0]);assert.equal(dist.at(-1),2*511**2);
});

test('a diagonal closed ring retains its actual oblique corners at the observed physical stroke width',()=>{
 const points=[],original=new Set(),size=81;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const radius=Math.abs(x-40)+Math.abs(y-40);
  if(radius>=31&&radius<=34){points.push({x,y});original.add(y*size+x);}
 }
 // A source-connected branch forces isolation of the unique large hole.
 for(let x=75;x<81;x++){points.push({x,y:40});original.add(40*size+x);}
 const result=isolate({points,bounds:{x:0,y:0,w:size,h:size},hint:{x:6,y:6,w:69,h:69}});assert.ok(result);
 assert.ok(result.points.every(p=>original.has(p.y*size+p.x)));
 for(const p of points.filter(p=>Math.abs(p.x-40)+Math.abs(p.y-40)===34&&p.x!==40&&p.y!==40))
  assert.ok(result.points.includes(p),'the actual diagonal source boundary is retained');
 assert.ok(!result.points.some(p=>p.x===80));
});
