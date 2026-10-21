'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {minimumSourceRoutePolyline:minimum}=require('../packages/slideclone-core/source-route-minimum-polyline');
const {simplifySourceRoute:greedy}=require('../packages/slideclone-core/source-route-centerline');
const curve=length=>Array.from({length},(_,x)=>({x,y:20+Math.round(Math.sin(x/2))}));
function represents(points,vertices){
 let low=0;
 for(let i=1;i<vertices.length;i++){
  const a=vertices[i-1],b=vertices[i],hi=points.findIndex((p,n)=>n>low&&p.x===b.x&&p.y===b.y);if(hi<0)return false;
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  for(let j=low;j<=hi;j++){
   const p=points[j],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
   if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)>.75+1e-12)return false;
  }
  low=hi;
 }
 return low===points.length-1;
}
test('minimum source polylines reduce native controls without increasing the existing source error',()=>{
 const points=curve(33),before=structuredClone(points),work={checks:0},result=minimum({points,work});assert.ok(result);
 assert.equal(greedy(points,{checks:0}).length,11);assert.equal(result.length,7);assert.ok(represents(points,result));
 assert.deepEqual(result[0],points[0]);assert.deepEqual(result.at(-1),points.at(-1));assert.deepEqual(points,before);
 assert.ok(work.checks>0&&work.checks<=4000000);
 for(const transpose of [false,true])for(const reverse of [false,true]){
  const transform=p=>transpose?{x:p.y,y:reverse?-p.x:p.x}:{x:reverse?-p.x:p.x,y:p.y};
  const transformed=points.map(transform),fitted=minimum({points:transformed,work:{checks:0}});
  assert.equal(fitted.length,result.length);assert.ok(represents(transformed,fitted));
 }
});
test('a small exhaustive reference proves the fewest valid finite segments',()=>{
 const points=curve(9);let best=points.length;
 for(let bits=0;bits<2**(points.length-2);bits++){
  const vertices=[points[0],...points.slice(1,-1).filter((_,i)=>bits&(1<<i)),points.at(-1)];
  if(vertices.length<best&&represents(points,vertices))best=vertices.length;
 }
 assert.equal(minimum({points,work:{checks:0}}).length,best);
});
test('a complete oscillating source tree stays within 32 native members through minimum control selection',()=>{
 const width=70,height=60,mask=new Uint8Array(width*height),terminals=[5*width+35];
 for(let y=5;y<=30;y++)mask[y*width+35]=1;
 for(const sign of [-1,1])for(let step=0;step<=32;step++){
  const x=35+sign*step,y=30+Math.round(Math.sin(step/2));mask[y*width+x]=1;
  if(step===32)terminals.push(y*width+x);
 }
 const before=mask.slice(),{sourceSharedShaftTree:tree}=require('../packages/slideclone-core/source-shared-shaft-tree');
 const result=tree({mask,width,height,terminals,work:{checks:0}});assert.ok(result);assert.ok(result.partCount<=32);
 assert.equal(result.edges.length,3);assert.deepEqual(mask,before);
});
test('empty, invalid, extreme, unsafe and exhausted observations never grant an unverified path',()=>{
 for(const input of [null,{}, {points:[],work:{checks:0}}, {points:new Array(2),work:{checks:0}},
  {points:curve(513),work:{checks:0}}, {points:[{x:0,y:0},{x:Infinity,y:0}],work:{checks:0}},
  {points:curve(2),work:{checks:NaN}}])assert.throws(()=>minimum(input),TypeError);
 const straight=Array.from({length:512},(_,x)=>({x,y:0})),work={checks:0};
 assert.deepEqual(minimum({points:straight,work}),[straight[0],straight.at(-1)]);assert.ok(work.checks<=4000000);
 const jagged=Array.from({length:40},(_,x)=>({x,y:x%2*10}));assert.equal(minimum({points:jagged,work:{checks:0}}),null);
 const budget={checks:3999999};assert.equal(minimum({points:curve(33),work:budget}),null);assert.ok(budget.checks>4000000);
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter={work:{checks:0}};Object.defineProperty(getter,'points',{get:trap});
 const nested=curve(2);Object.defineProperty(nested[0],'x',{get:trap});
 for(const value of [getter,new Proxy({}, {get:trap}),{points:nested,work:{checks:0}}])assert.throws(()=>minimum(value),TypeError);
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-route-minimum-polyline.js'));
});
