"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {readPng}=require('../packages/slideclone-core/png');
const {measureOutlinedSceneContainerDetailed:measure}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
const fixture=require('./fixtures/source-thin-outline/contour.json');

// Sample every cell center against all opposite-winding contours. This checks
// emitted geometry against source ownership, rather than repeating the fitter.
function covered(segments,box,x,y){
 let winding=0,loop=[];
 for(const s of segments){
  if(s.type!=='close'){assert.ok(['moveTo','lnTo'].includes(s.type));loop.push({x:box.x+s.points[0].x*box.w,y:box.y+s.points[0].y*box.h});continue;}
  for(let i=0;i<loop.length;i++){
   const a=loop[i],b=loop[(i+1)%loop.length],cross=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);
   if(a.y<=y&&b.y>y&&cross>0)winding++;
   if(a.y>y&&b.y<=y&&cross<0)winding--;
  }
  loop=[];
 }
 return winding!==0;
}

test('a real thin colored badge outline preserves every source cell center without jagged invented paint',()=>{
 const image=readPng(path.join(__dirname,'fixtures/source-thin-outline/source.png'));
 const before=Buffer.from(image.rgba),budget={used:0};
 const {outline}=measure(image,{x:16.01,y:16.912,w:48.87,h:49.232},[{x:31.214,y:29.569,w:15.204,h:24.616}],budget);
 assert.ok(outline);assert.deepEqual(outline.box,{x:16,y:18,w:49,h:47});
 const cells=new Set(fixture.points.map(p=>`${p.x},${p.y}`));
 for(let y=0;y<47;y++)for(let x=0;x<49;x++)
  assert.equal(covered(outline.segments,outline.box,x+16.5,y+18.5),cells.has(`${x},${y}`),`source cell ${x},${y}`);
 assert.ok(outline.segments.length<=120);assert.ok(budget.used<=262144);assert.deepEqual(image.rgba,before);
});

test('thin outline scan exhaustion remains explicit and blank source cannot invent a border',()=>{
 const image=readPng(path.join(__dirname,'fixtures/source-thin-outline/source.png'));
 const hint={x:16.01,y:16.912,w:48.87,h:49.232};
 assert.throws(()=>measure(image,hint,[],{used:4000000}),RangeError);
 image.rgba.fill(255);assert.equal(measure(image,hint,[],{used:0}).outline,null);
});

test('the thin-outline regression is discovered by the unified unit suite',()=>{
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-thin-outline.test.js','unit'),true);
});
