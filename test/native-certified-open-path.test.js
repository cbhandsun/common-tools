'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitCertifiedOpenPath:fit}=require('../packages/slideclone-core/routing/native-contour-certified-curves');
function source(){return Array.from({length:81},(_,i)=>({x:10+i,y:15+Math.round(40*(1-Math.cos(i/80*Math.PI/2)))}));}
function dist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function flattened(path){const points=[];let last;for(const s of path){if(s.type!=='cubicBezTo'){last=s.points[0];points.push(last);continue;}const [b,c,d]=s.points,a=last;for(let i=1;i<=256;i++){const t=i/256,u=1-t;points.push({x:a.x*u**3+3*b.x*u*u*t+3*c.x*u*t*t+d.x*t**3,y:a.y*u**3+3*b.y*u*u*t+3*c.y*u*t*t+d.y*t**3});}last=d;}return points;}
test('complete open source curves preserve endpoint identity and continuous .75px source correspondence',()=>{
 for(const reverse of [false,true]){const points=source();if(reverse)points.reverse();const before=JSON.stringify(points),work={checks:0,exhausted:false},path=fit(points,.75,work,{x:0,y:0,w:100,h:80});
  assert.ok(path);assert.deepEqual(path[0],{type:'moveTo',points:[points[0]]});assert.deepEqual(path.at(-1).points.at(-1),points.at(-1));assert.equal(path.some(s=>s.type==='close'),false);assert.ok(path.some(s=>s.type==='cubicBezTo'));assert.equal(JSON.stringify(points),before);
  const actual=flattened(path),pairs=actual.slice(1).map((p,i)=>[actual[i],p]),original=points.slice(1).map((p,i)=>[points[i],p]);
  for(const p of actual)assert.ok(Math.min(...original.map(([a,b])=>dist(p,a,b)))<=.75001);
  for(const [a,b]of original)for(const t of [0,.5,1]){const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};assert.ok(Math.min(...pairs.map(([c,d])=>dist(p,c,d)))<=.751);}
  assert.ok(work.checks>0&&work.checks<=4000000);assert.equal(work.exhausted,false);
 }
});
test('no partial curve escapes empty, degenerate, excessive-capacity or exhausted source fitting',()=>{
 const box={x:0,y:0,w:100,h:80};for(const p of [[],[{x:1,y:1}],[{x:1,y:1},{x:1,y:1}]])assert.equal(fit(p,.75,{checks:0,exhausted:false},box),null);
 const state={checks:3999999,exhausted:false};assert.equal(fit(source(),.75,state,box),null);assert.equal(state.checks,4000001);assert.equal(state.exhausted,true);
 const spent={checks:4000001,exhausted:true};assert.equal(fit(source(),.75,spent,box),null);assert.equal(spent.checks,4000001);
 const corners=[{x:10,y:10},{x:90,y:10},{x:90,y:70},{x:20,y:70}];
 assert.equal(fit(corners,.75,{checks:0,exhausted:false},box,2),null);assert.equal(fit(source(),0,{checks:0,exhausted:false},box),null);
});
test('open source curve boundaries reject unsafe or invalid input and retain the original tolerance ceiling',()=>{
 const box={x:0,y:0,w:100,h:80};let calls=0;const bad={get x(){calls++;throw Error('private-pixels');}};
 for(const points of [null,new Array(1),[bad],Array(513).fill({x:1,y:1}),[{x:NaN,y:1}],new Proxy([],{get(){calls++;throw Error('private-pixels');}})])assert.throws(()=>fit(points,.75,{checks:0,exhausted:false},box),TypeError);
 for(const e of [.75001,NaN,Infinity,'0.75',-1])assert.throws(()=>fit(source(),e,{checks:0,exhausted:false},box),TypeError);
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
