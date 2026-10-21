'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {insidePolygon,ownerVertices}=require('../packages/slideclone-core/source-scene-band-geometry');
const {createMeasuredScenePortFrame,measuredScenePortBodyMask}=require('../packages/slideclone-core/source-scene-port-evidence');
const {sourcePolygonRowMask}=require('../packages/slideclone-core/source-polygon-row-mask');
const image={width:800,height:800,rgba:Buffer.alloc(800*800*4,255)};
function fixture(points,box={x:10,y:12,w:40,h:36},perimeterPixels=[]){
 const segments=points.map(([x,y],i)=>({type:i?'lnTo':'moveTo',points:[{x,y}]})).concat([{type:'close',points:[]}]);
 const measurement={box,fill:'#D2E6F5',segments,perimeterPixels};
 return {box,measurement,vertices:ownerVertices(measurement),token:createMeasuredScenePortFrame(image,measurement)};
}
function expected(f,window){
 const out=new Uint8Array(window.w*window.h),ring=new Set(f.measurement.perimeterPixels);
 const left=Math.max(window.x,Math.ceil(f.box.x-.5)),right=Math.min(window.x+window.w,Math.ceil(f.box.x+f.box.w-.5));
 const top=Math.max(window.y,Math.ceil(f.box.y-.5)),bottom=Math.min(window.y+window.h,Math.ceil(f.box.y+f.box.h-.5));
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(insidePolygon({x:x+.5,y:y+.5},f.vertices))out[(y-window.y)*window.w+x-window.x]=1;
 for(const cell of ring){const x=cell%image.width,y=Math.floor(cell/image.width);
  if(x>=window.x&&x<window.x+window.w&&y>=window.y&&y<window.y+window.h)out[(y-window.y)*window.w+x-window.x]=1;
 }
 return out;
}

test('row scanning exactly preserves every pixel of convex, concave, reversed and half-pixel source bodies',()=>{
 const polygons=[[[0,0],[1,0],[1,1],[0,1]],[[0,.5],[.5,0],[1,.5],[.5,1]],
  [[0,0],[1,0],[1,.25],[.3,.25],[.3,.75],[1,.75],[1,1],[0,1]],
  [[0,0],[1,0],[1,1],[.6,1],[.6,.3],[.4,.3],[.4,1],[0,1]],
  [[0,0],[1,0],[1,0],[1,1],[0,1],[0,0]]];
 for(const points of polygons)for(const reverse of [false,true])for(const offset of [0,.5]){
  const f=fixture(reverse?[...points].reverse():points,{x:10+offset,y:12+offset,w:40,h:36},[11*image.width+9]);
  for(const window of [{x:0,y:0,w:70,h:65},{x:25,y:25,w:11,h:15},{x:55,y:0,w:8,h:60}]){
   const actual=measuredScenePortBodyMask(image,f.token,f.box,window,{checks:0});assert.ok(actual);
   assert.deepEqual(actual,expected(f,window));
  }
 }
});

test('a detailed large source contour fits the unchanged geometry ceiling without enlarging the source window',()=>{
 const points=Array.from({length:118},(_,i)=>[.5+.5*Math.cos(i*Math.PI*2/118),.5+.5*Math.sin(i*Math.PI*2/118)]);
 const f=fixture(points,{x:25,y:25,w:700,h:600}),window={x:0,y:0,w:800,h:280},work={checks:0};
 const oldCost=700*255*(f.vertices.length+1);assert.ok(oldCost>4000000);
 const actual=measuredScenePortBodyMask(image,f.token,f.box,window,work);assert.ok(actual);
 assert.ok(work.checks>0&&work.checks<4000000);
 for(let y=0;y<window.h;y+=7)for(let x=0;x<window.w;x+=5)
  assert.equal(actual[y*window.w+x],insidePolygon({x:x+.5,y:y+.5},f.vertices)?1:0);
});

test('complete source masks remain all-or-nothing under depleted work, unit limits and copied identities',()=>{
 const f=fixture([[0,0],[1,0],[1,1],[0,1]]),window={x:0,y:0,w:70,h:65};
 for(const checks of [3999999,4000000])assert.equal(measuredScenePortBodyMask(image,f.token,f.box,window,{checks}),null);
 assert.equal(measuredScenePortBodyMask(image,f.token,f.box,{x:0,y:0,w:800,h:800},{checks:0}),null);
 assert.equal(measuredScenePortBodyMask(image,structuredClone(f.token),f.box,window,{checks:0}),null);
 assert.equal(measuredScenePortBodyMask({...image,rgba:Buffer.from(image.rgba)},f.token,f.box,window,{checks:0}),null);
 for(const bad of [null,{},new Proxy({checks:0},{}),{checks:-1},{checks:Infinity}])
  assert.equal(measuredScenePortBodyMask(image,f.token,f.box,window,bad),null);
 let accessed=false;const getter={get x(){accessed=true;throw Error('unsafe');},y:0,w:70,h:65};
 assert.equal(measuredScenePortBodyMask(image,f.token,f.box,getter,{checks:0}),null);assert.equal(accessed,false);
});

test('disjoint row masks spend no candidate-cell work and this regression belongs to unified CI',()=>{
 const work={checks:4000000},mask=sourcePolygonRowMask([{x:0,y:0},{x:1,y:0},{x:1,y:1}],{x:5,y:5,w:2,h:2},{x:0,y:0,w:1,h:1},work);
 assert.deepEqual(mask,new Uint8Array(4));assert.equal(work.checks,4000000);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});
