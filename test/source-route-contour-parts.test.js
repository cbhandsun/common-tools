'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteContourParts:contours}=require('../packages/slideclone-core/source-route-contour-parts');
test('filled route contours retain every original cell and preserve an interior hole',()=>{
 const width=40,height=40,cells=[];
 for(let y=5;y<35;y++)for(let x=5;x<35;x++)if(x<10||x>=30||y<10||y>=30)cells.push(y*width+x);
 const before=[...cells],work={checks:0},parts=contours({cells,width,height,work});assert.ok(parts);
 assert.deepEqual(parts.flatMap(p=>p.cells).sort((a,b)=>a-b),[...cells].sort((a,b)=>a-b));assert.deepEqual(cells,before);
 assert.equal(parts.length,1);assert.equal(parts[0].segments.filter(s=>s.type==='moveTo').length,2);
 assert.ok(work.checks<=4000000);
});
test('complex source contours split without losing pixels or exceeding native command/part limits',()=>{
 const width=240,height=180,cells=[];
 for(let x=10;x<230;x++){const y=70+Math.round(35*Math.sin(x/5));for(let dy=-2;dy<=2;dy++)cells.push((y+dy)*width+x);}
 const work={checks:0},parts=contours({cells,width,height,work});assert.ok(parts);assert.ok(parts.length>1&&parts.length<=30);
 assert.deepEqual(parts.flatMap(p=>p.cells).sort((a,b)=>a-b),[...cells].sort((a,b)=>a-b));
 assert.ok(parts.every(p=>p.segments.length<=120));assert.ok(work.checks<=4000000);
});
test('empty, malformed, duplicate, oversized and exhausted source geometry fails closed',()=>{
 const good={cells:[10,11,20,21],width:10,height:10,work:{checks:0}};
 for(const change of [{cells:[]},{cells:[10,10]},{cells:[-1]},{cells:[100]},{cells:[NaN]},{width:0},{height:1.5},{width:1000,height:1000},{work:{checks:-1}},{work:{checks:4000000}},{work:{checks:3999999}}])
  assert.equal(contours({...good,...change}),null);
});
