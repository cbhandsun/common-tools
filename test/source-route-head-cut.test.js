'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteHeadCut}=require('../packages/slideclone-core/routing/source-route-head-cut');
const {sourceFilledHeadProfile}=require('../packages/slideclone-core/routing/source-filled-head-profile');
function head(slope,halfHead=13){
 const width=180,height=150,tip={x:110,y:30},scale=Math.hypot(1,slope),dx=slope/scale,dy=-1/scale;
 const cut={x:tip.x-dx*48,y:tip.y-dy*48},cells=[];
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const t=(x-tip.x)*dx+(y-tip.y)*dy,n=-(x-tip.x)*dy+(y-tip.y)*dx;
  if(t>=-48&&t<=0&&Math.abs(n)<=(t>=-28?-t/28*halfHead:2))cells.push(y*width+x);
 }
 return {cells,width,tip,cut,horizontal:false,shaft:4,routeLength:180,work:{checks:0}};
}
test('oblique original cell cuts prove three complete neck slabs while retaining their censored caps',()=>{
 for(const slope of [.15,.35]){
  const input=head(slope),snapshot=structuredClone(input);
  assert.ok(sourceFilledHeadProfile(input),String(slope));assert.deepEqual(input.cells,snapshot.cells);assert.ok(input.work.checks<=4000000);
 }
});

test('a connected steep source head passes while the partially cut neck slab remains in its contour',()=>{
 const input=head(.6,17),snapshot=structuredClone(input);
 assert.ok(sourceFilledHeadProfile(input));assert.deepEqual(input.cells,snapshot.cells);
 assert.ok(input.work.checks<=4000000);
});

test('a diagonal-only isolated tip is rejected even after its cut cap is excluded from neck measurement',()=>{
 const input=head(.6),left=new Set(input.cells),sizes=[];
 // This raster fixture has a one-cell tip at (110,30) touching the main
 // head only at a corner. Independently establish its two boundary loops;
 // the existing single-contour certificate must continue to reject it.
 while(left.size){
  const seed=left.values().next().value,queue=[seed];left.delete(seed);
  for(const n of queue)for(const k of [n-1,n+1,n-input.width,n+input.width])if(left.delete(k))queue.push(k);
  sizes.push(queue.length);
 }
 assert.deepEqual(sizes.sort((a,b)=>a-b),[1,443]);
 assert.equal(sourceFilledHeadProfile(input),null);
});
test('source-normal head partitions preserve the complete component and original shared cells',()=>{
 const width=40,height=40,remaining=new Uint8Array(width*height);
 for(let y=10;y<=24;y++)for(let x=10;x<=24;x++)remaining[y*width+x]=1;
 const snapshot=remaining.slice(),tip={x:24,y:24},cut={x:16,y:16},work={checks:0};
 const result=sourceRouteHeadCut({remaining,width,height,tip,cut,horizontal:true,normal:true,work});assert.ok(result);
 assert.ok(result.selected.includes(24*width+24));assert.ok(result.shared.size>0);
 const selected=new Set(result.selected),retained=new Set();
 for(let n=0;n<remaining.length;n++)if(remaining[n]&&(!selected.has(n)||result.shared.has(n)))retained.add(n);
 for(let n=0;n<remaining.length;n++)if(remaining[n])assert.ok(selected.has(n)||retained.has(n));
 for(const n of result.shared){const p=(n%width-cut.x)*8+(Math.floor(n/width)-cut.y)*8;assert.ok(p>=0&&p<=8);}
 assert.deepEqual(remaining,snapshot);
 assert.equal(sourceRouteHeadCut({remaining,width,height,tip,cut,horizontal:true,normal:true,work:{checks:4000000}}),null);
});
test('a disconnected source mark cannot be borrowed as part of the head',()=>{
 const remaining=new Uint8Array(40*40);remaining[25*40+25]=1;remaining[30*40+30]=1;
 const result=sourceRouteHeadCut({remaining,width:40,height:40,tip:{x:25,y:25},cut:{x:20,y:20},horizontal:true,normal:true,work:{checks:0}});
 assert.ok(result);assert.deepEqual(result.selected,[25*40+25]);assert.equal(result.shared.size,0);
});

test('head partition dimensions, coordinates, empty ink and work limits fail closed',()=>{
 const remaining=new Uint8Array(400);remaining[210]=1;
 const good={remaining,width:20,height:20,tip:{x:10,y:10},cut:{x:5,y:5},horizontal:true,normal:true,work:{checks:0}};
 for(const change of [{width:0},{height:1.5},{remaining:new Uint8Array(399)},{width:1000,height:1000},
  {tip:{x:-1,y:10}},{tip:{x:10.5,y:10}},{cut:{x:NaN,y:5}},{cut:{x:20,y:5}},
  {cut:{x:10,y:10}},{remaining:new Uint8Array(400)},{work:{checks:-1}},{work:{checks:4000000}},{work:{checks:3999999}}])
  assert.equal(sourceRouteHeadCut({...good,...change}),null);
});
