'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteCoverageWidth:measure}=require('../packages/slideclone-core/routing/source-route-coverage-width');

function fixture(stroke=3,neighbor=true){
 const width=80,height=80,rgba=new Uint8Array(width*height*4).fill(255),background=[255,255,255];
 // One-cell drift in a staircase makes a forward two-cell chord vertical.
 // Every source point still lies within .75px of this straight run.
 const path=[[0,0],[0,1],[1,2],[1,3],[2,4],[2,5],[3,6],[3,7],[4,7],[4,8],[5,9],[5,10],[5,11],[6,12],[6,13],[7,14]]
  .map(([x,y])=>({x:x+25,y:y+20}));
 const start=path[0],end=path.at(-1),dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const along=((x-start.x)*dx+(y-start.y)*dy)/length;
  if(along<0||along>length)continue;
  const distance=Math.abs((x-start.x)*dy-(y-start.y)*dx)/length;
  const alpha=Math.max(0,Math.min(1,stroke/2+.5-distance));
  if(alpha)rgba.set([30,60,90].map(v=>Math.round(255+alpha*(v-255))),(y*width+x)*4);
 }
 // The incorrect horizontal frame reaches neighboring ink. The measured
 // run's normal instead finds two real background cells before that ink.
 if(neighbor)for(let y=29;y<=31;y++)for(let x=33;x<=50;x++)rgba.set([30,60,90,255],(y*width+x)*4);
 return {path,rgba,width,height,background,work:{checks:0},cache:new Map()};
}
const direction={x:7,y:14};

test('an independently simplified straight run supplies its own tangent through a digital staircase',()=>{
 const f=fixture(),before=f.rgba.slice();
 const {simplifySourceRoute}=require('../packages/slideclone-core/routing/source-route-centerline');
 assert.ok(f.path.slice(1).every((p,i)=>Math.max(Math.abs(p.x-f.path[i].x),Math.abs(p.y-f.path[i].y))===1));
 assert.deepEqual(simplifySourceRoute(f.path,{checks:0}),[f.path[0],f.path.at(-1)]);
 assert.ok(measure(fixture(3,false))!==null);
 assert.equal(measure(f),null,'the original two-cell frame hits neighboring ink');
 const result=measure({...f,linearDirection:direction});
 assert.ok(result>=2.5&&result<=3.5,String(result));
 // A successful straight-run cache entry cannot authorize a different frame.
 assert.equal(measure(f),null);
 assert.equal(measure({...f,linearDirection:direction}),result);
 assert.equal(measure({...f,linearDirection:{x:8192,y:16384}}),result);
 assert.equal(measure({...f,path:[...f.path].reverse(),linearDirection:{x:-7,y:-14}}),result);
 assert.deepEqual(f.rgba,before);assert.ok(f.work.checks<=4000000);
});

test('straight-run calibration retains width, background, alpha, clipping and work limits',()=>{
 const measureRun=f=>measure({...f,linearDirection:direction});
 assert.equal(measureRun({...fixture(),path:[]}),null);
 assert.equal(measureRun({...fixture(),path:[{x:25,y:20}]}),null);
 assert.equal(measureRun(fixture(7)),null);
 const blank=fixture();blank.rgba.fill(255);assert.equal(measureRun(blank),null);
 const translucent=fixture();for(let i=3;i<translucent.rgba.length;i+=4)translucent.rgba[i]=0;
 assert.equal(measureRun(translucent),null);
 const exhausted=fixture();exhausted.work.checks=4000000;assert.equal(measureRun(exhausted),null);
 const clipped=fixture();clipped.path=clipped.path.map(p=>({...p,x:0}));assert.equal(measureRun(clipped),null);
 const noFlank=fixture();for(let y=0;y<noFlank.height;y++)for(let x=27;x<noFlank.width;x++)noFlank.rgba.set([30,60,90,255],(y*noFlank.width+x)*4);
 assert.equal(measureRun(noFlank),null,'no two real background cells within twelve pixels');
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(r=>r.file.replaceAll('\\','/')==='test/source-route-width-tangent.test.js'));
});

test('invalid straight-run frames are rejected before invoking accessors, proxies or the backdrop',()=>{
 let calls=0;
 for(const linearDirection of [null,{},[],{x:0,y:0},{x:NaN,y:1},{x:1,y:Infinity},{x:16385,y:1},{x:'7',y:13},
  new Proxy({x:7,y:13},{get(){calls++;throw Error('private');}}),
  Object.defineProperty({y:13},'x',{get(){calls++;throw Error('private');}})]){
  const f=fixture();
  assert.equal(measure({...f,linearDirection,backgroundAt(){calls++;throw Error('private');}}),null);
  assert.equal(f.cache.size,0);assert.equal(f.work.checks,0);
 }
 assert.equal(calls,0);
});
