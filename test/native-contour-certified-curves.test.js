"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fitCertifiedContourLoop:fit}=require('../packages/slideclone-core/native-contour-certified-curves');
function fixture(dx=0,dy=0){
 const points=[];
 for(let i=0;i<720;i++){
  const angle=i*2*Math.PI/720,p={x:dx+Math.round(110+90*Math.cos(angle)),y:dy+Math.round(75+55*Math.sin(angle))};
  if(!points.length||p.x!==points.at(-1).x||p.y!==points.at(-1).y)points.push(p);
 }
 if(points.at(-1).x===points[0].x&&points.at(-1).y===points[0].y)points.pop();
 return {points,box:{x:dx,y:dy,w:220,h:150}};
}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function flatten(path){
 const points=[];let last;
 for(const segment of path){
  if(segment.type==='close')continue;
  if(segment.type!=='cubicBezTo'){last=segment.points[0];points.push(last);continue;}
  const [b,c,d]=segment.points,a=last;
  for(let i=1;i<=128;i++){const t=i/128,u=1-t;points.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});}
  last=d;
 }
 return points;
}
test('direct source cubics preserve the original .75px error in both directions and source frame',()=>{
 for(const [x,y]of [[0,0],[300,500]]){
  const f=fixture(x,y),before=JSON.stringify(f),state={checks:0,exhausted:false},path=fit(f.points,.75,state,f.box,120);
  assert.ok(path);assert.ok(path.length<=120);assert.ok(path.some(s=>s.type==='cubicBezTo'));
  assert.equal(state.exhausted,false);assert.ok(state.checks<=4000000);assert.equal(JSON.stringify(f),before);
  assert.equal(path[0].type,'moveTo');assert.equal(path.at(-1).type,'close');
  for(const s of path)for(const p of s.points)assert.ok(p.x>=f.box.x&&p.x<=f.box.x+f.box.w&&p.y>=f.box.y&&p.y<=f.box.y+f.box.h);
  const curve=flatten(path),sourceEdges=f.points.map((p,i)=>[p,f.points[(i+1)%f.points.length]]),curveEdges=curve.map((p,i)=>[p,curve[(i+1)%curve.length]]);
  for(const p of curve)assert.ok(Math.min(...sourceEdges.map(([a,b])=>distance(p,a,b)))<=.75+1e-8);
  for(const [a,b]of sourceEdges)for(const t of [0,.5,1]){
   const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};assert.ok(Math.min(...curveEdges.map(([c,d])=>distance(p,c,d)))<=.751);
  }
 }
});
test('empty, zero error, exhausted work and insufficient path capacity never return partial geometry',()=>{
 const f=fixture();assert.equal(fit([],.75,{checks:0,exhausted:false},f.box),null);
 assert.equal(fit(f.points,0,{checks:0,exhausted:false},f.box),null);
 assert.equal(fit(f.points,.75,{checks:4000001,exhausted:true},f.box),null);
 const state={checks:3999999,exhausted:false};assert.equal(fit(f.points,.75,state,f.box),null);assert.equal(state.exhausted,true);assert.equal(state.checks,4000001);
 assert.equal(fit(f.points,.75,{checks:0,exhausted:false},f.box,4),null);
});
test('unknown boundaries reject proxies, accessors, sparse input and impossible frames before mutating work',()=>{
 const f=fixture();let calls=0;const badPoint={get x(){calls++;throw Error('private-source');}},badState={get checks(){calls++;throw Error('private-source');}},badList=[];
 Object.defineProperty(badList,'0',{get(){calls++;throw Error('private-source');}});badList.length=1;
 for(const p of [null,new Proxy(f.points,{}),new Array(1),badList,[badPoint],[{x:NaN,y:1}],[{x:-1,y:1}],Array(262145).fill({x:1,y:1})]){
  const state={checks:0,exhausted:false};assert.throws(()=>fit(p,.75,state,f.box),e=>e instanceof TypeError&&!e.message.includes('private-source'));assert.equal(state.checks,0);
 }
 for(const state of [badState,new Proxy({checks:0,exhausted:false},{}),Object.freeze({checks:0,exhausted:false}),{checks:-1,exhausted:false},{checks:4000001,exhausted:false}])assert.throws(()=>fit(f.points,.75,state,f.box),TypeError);
 for(const error of [NaN,Infinity,-1,2.1,'0.75'])assert.throws(()=>fit(f.points,error,{checks:0,exhausted:false},f.box),TypeError);
 for(const limit of [0,121,Infinity,'120'])assert.throws(()=>fit(f.points,.75,{checks:0,exhausted:false},f.box,limit),TypeError);
 assert.throws(()=>fit(f.points,.75,{checks:0,exhausted:false},{x:0,y:0,w:16385,h:150}),TypeError);
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
