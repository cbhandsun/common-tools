"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {traceNativeMaskContours}=require("../packages/slideclone-core/scene-plan/native-mask-contours");
const {shortestContourLoop,shortestCurvedContourLoop}=require("../packages/slideclone-core/routing/native-contour-shortest-path");
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function flatten(segments,box){
 const rows=[];let last;
 const point=p=>({x:box.x+p.x*box.w,y:box.y+p.y*box.h});
 for(const s of segments){
  if(s.type==="close")continue;
  if(s.type!=="cubicBezTo"){last=point(s.points[0]);rows.push(last);continue;}
  const a=last,b=point(s.points[0]),c=point(s.points[1]),d=point(s.points[2]);
  for(let n=1;n<=32;n++){const t=n/32,u=1-t;rows.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});}
  last=d;
 }
 return rows;
}
test("short exact source corners fit the original path cap without relaxing .75px in either direction",()=>{
 const box={x:0,y:0,w:80,h:24},points=[];
 for(let x=0;x<80;x++)for(let y=2+(Math.floor(x/2)%2)*2;y<22;y++)points.push({x,y});
 const straight=traceNativeMaskContours(points,box,{maxSegments:64,outerOnly:true});assert.equal(straight,null);
 const curved=traceNativeMaskContours(points,box,{maxSegments:64,outerOnly:true,curveFallback:true});assert.ok(curved);
 assert.ok(curved.length<=64);assert.ok(curved.some(s=>s.type==="cubicBezTo"));
 const cells=new Set(points.map(p=>`${p.x},${p.y}`)),edges=[];
 for(const {x,y}of points){
  if(!cells.has(`${x},${y-1}`))edges.push([{x,y},{x:x+1,y}]);
  if(!cells.has(`${x+1},${y}`))edges.push([{x:x+1,y},{x:x+1,y:y+1}]);
  if(!cells.has(`${x},${y+1}`))edges.push([{x:x+1,y:y+1},{x,y:y+1}]);
  if(!cells.has(`${x-1},${y}`))edges.push([{x,y:y+1},{x,y}]);
 }
 const native=flatten(curved,box),nativeEdges=native.map((p,i)=>[p,native[(i+1)%native.length]]);
 for(const p of native)assert.ok(Math.min(...edges.map(([a,b])=>distance(p,a,b)))<=.75+1e-8);
 for(const [a,b]of edges)for(const t of [0,.5,1]){
  const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  assert.ok(Math.min(...nativeEdges.map(([c,d])=>distance(p,c,d)))<=.751);
 }
});
test("budget exhaustion cannot return a partly proved contour and zero error remains exact",()=>{
 const loop=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}],state={checks:3999999,exhausted:false};
 assert.equal(shortestContourLoop(loop,.75,state),null);assert.equal(state.exhausted,true);
 assert.equal(shortestCurvedContourLoop(loop,0,{checks:0,exhausted:false}),null);
 const points=[];for(let y=0;y<20;y++)for(let x=0;x<20;x++)points.push({x,y});
 const exact=traceNativeMaskContours(points,{x:0,y:0,w:20,h:20},{tolerancePx:0,curveFallback:true});assert.equal(exact.length,5);
 assert.ok(exact.every(s=>s.type!=="cubicBezTo"));
});
test("a curved fallback preserves a hollow source instead of filling its hole",()=>{
 const points=[];for(let y=0;y<24;y++)for(let x=0;x<24;x++)if(x<3||x>=21||y<3||y>=21)points.push({x,y});
 const path=traceNativeMaskContours(points,{x:0,y:0,w:24,h:24},{curveFallback:true});
 assert.equal(path.filter(s=>s.type==="moveTo").length,2);
 assert.equal(path.filter(s=>s.type==="close").length,2);
});
test("bounded shortest paths preserve measured vertices across different closed-curve seeds",()=>{
 const input=[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:4,y:2},{x:4,y:4},{x:8,y:4},{x:8,y:10},{x:0,y:10}];
 for(let offset=0;offset<input.length;offset++){
  const rotated=[...input.slice(offset),...input.slice(0,offset)],state={checks:0,exhausted:false},out=shortestContourLoop(rotated,.75,state);
  assert.ok(out);assert.ok(state.checks<=4000000);
  for(const p of input)assert.ok(Math.min(...out.map((a,i)=>distance(p,a,out[(i+1)%out.length])))<=.75+1e-8);
 }
});
test("curve fallback rejects invalid controls and is discovered in unified CI",()=>{
 assert.throws(()=>traceNativeMaskContours([{x:0,y:0}],{x:0,y:0,w:1,h:1},{curveFallback:"yes"}),TypeError);
 const {includesSuite}=require("../scripts/test-suites");assert.equal(includesSuite(__filename,"unit"),true);
});

test("closed-ring anchor search reuses pair metrics without changing geometry or proof charges",()=>{
 const points=Array.from({length:64},(_,i)=>({x:100+Math.round(60*Math.cos(2*Math.PI*i/64)),y:100+Math.round(60*Math.sin(2*Math.PI*i/64))}));
 const original=Math.hypot;let calls=0,result;
 const state={checks:0,exhausted:false};
 try{Math.hypot=(...args)=>{calls++;return original(...args);};result=shortestContourLoop(points,1.5,state);}
 finally{Math.hypot=original;}
 assert.ok(result);assert.equal(result.length,16);
 assert.deepEqual(result,[[160,106],[150,133],[133,150],[112,159],[94,160],[67,150],[50,133],[41,112],
  [40,94],[50,67],[67,50],[88,41],[106,40],[133,50],[150,67],[159,88]].map(([x,y])=>({x,y})));
 assert.deepEqual(state,{checks:16038,exhausted:false});
 for(const p of points)assert.ok(Math.min(...result.map((a,i)=>distance(p,a,result[(i+1)%result.length])))<=1.5);
 // Repeating anchor searches must not repeat costly metrics for every anchor.
 // This deterministic operation bound avoids flaky wall-clock assertions.
 assert.ok(calls<=points.length*64,`repeated distance computations: ${calls}`);
});

test("pair metrics remain local to the loop and tolerance, including exhausted and large loops",()=>{
 const points=Array.from({length:64},(_,i)=>({x:100+Math.round(60*Math.cos(2*Math.PI*i/64)),y:100+Math.round(60*Math.sin(2*Math.PI*i/64))}));
 for(const [tolerance,length,checks]of [[.5,32,10614],[1.5,16,16038],[.75,24,12514],[1,17,13342]]){
  const state={checks:0,exhausted:false},result=shortestContourLoop(points,tolerance,state);
  assert.equal(result.length,length);assert.deepEqual(state,{checks,exhausted:false});
  const shifted=shortestContourLoop(points.map(p=>({x:p.x+17,y:p.y+29})),tolerance,{checks:0,exhausted:false});
  assert.deepEqual(shifted,result.map(p=>({x:p.x+17,y:p.y+29})));
 }
 for(const solve of [shortestContourLoop,shortestCurvedContourLoop]){
  const exhausted={checks:3999900,exhausted:false};assert.equal(solve(points,1.5,exhausted),null);
  assert.deepEqual(exhausted,{checks:4000001,exhausted:true});
  assert.equal(solve([],1.5,{checks:0,exhausted:false}),null);
  const large=Array.from({length:4097},(_,i)=>({x:100+60*Math.cos(2*Math.PI*i/4097),y:100+60*Math.sin(2*Math.PI*i/4097)}));
  const limited={checks:3991750,exhausted:false};assert.equal(solve(large,1.5,limited),null);
  assert.deepEqual(limited,{checks:4000001,exhausted:true});
 }
});
