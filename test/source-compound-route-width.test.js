'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceCompoundShaftWidth:measure}=require('../packages/slideclone-core/routing/source-compound-route-width');
const {sourceRouteCoverageWidth}=require('../packages/slideclone-core/routing/source-route-coverage-width');
function fixture(stroke=3){
 const width=80,height=120,rgba=Buffer.alloc(width*height*4,255),path=[],excluded=new Uint8Array(width*height),background=[255,255,255];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const field=y<50?[255,225+Math.min(30,y),205+Math.min(50,y)]:y>=74&&y<=78?[225,235,245]:background;
  rgba.set([...field,255],(y*width+x)*4);
 }
 for(let y=20;y<=100;y++){
  path.push({x:40,y});for(let x=40-Math.floor(stroke/2);x<40-Math.floor(stroke/2)+stroke;x++)rgba.set([20,60,120,255],(y*width+x)*4);
 }
 return {path,trimmed:path,rgba,width,height,excluded,background,work:{checks:0}};
}
test('complete shaft calibration uses independently observed fields without changing original samples or paint',()=>{
 const f=fixture(),snapshot=structuredClone(f);
 assert.equal(sourceRouteCoverageWidth({...f,complete:true,cache:new Map()}),null);
 const result=measure(f);assert.ok(result>=2.9&&result<=3.1,String(result));
 assert.deepEqual(f.path,snapshot.path);assert.deepEqual(f.rgba,Buffer.from(snapshot.rgba));assert.deepEqual(f.excluded,snapshot.excluded);
 assert.ok(f.work.checks<=4000000);
});
test('opaque widths, blank shafts, clipped observations, alpha and spent work retain their original rejection',()=>{
 assert.equal(measure(fixture(7)),null);
 for(const change of [f=>f.rgba.fill(255),f=>{for(let i=3;i<f.rgba.length;i+=4)f.rgba[i]=0;},f=>{f.work.checks=4000000;}]){
  const f=fixture();change(f);assert.equal(measure(f),null);
 }
 const empty=fixture();empty.trimmed=[];assert.equal(measure(empty),null);
 const clipped=fixture();clipped.path=clipped.path.map(p=>({...p,x:0}));clipped.trimmed=clipped.path;assert.equal(measure(clipped),null);
});
test('compound width regressions enter unified CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-compound-route-width.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-compound-route-width.js'));
});

test('a retained source run cannot omit, reorder or replace a difficult shaft sample',()=>{
 const f=fixture();
 for(const trimmed of [f.trimmed.filter((_,i)=>i!==30),[...f.trimmed].reverse(),f.trimmed.map((p,i)=>i===30?{x:41,y:p.y}:p)])
  assert.equal(measure({...f,trimmed,work:{checks:0}}),null);
 assert.ok(measure({...f,trimmed:f.path.slice(5,-5),work:{checks:0}})!==null);
});

test('an independently proved straight run supplies a stable normal at raster staircases',()=>{
 const width=80,height=80,rgba=Buffer.alloc(width*height*4,255),background=[255,255,255];
 const path=[[0,0],[0,1],[1,2],[1,3],[2,4],[2,5],[3,6],[3,7],[4,7],[4,8],[5,9],[5,10],[5,11],[6,12],[6,13],[7,14]]
  .map(([x,y])=>({x:x+25,y:y+20}));
 const a=path[0],b=path.at(-1),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const along=((x-a.x)*dx+(y-a.y)*dy)/length;if(along<0||along>length)continue;
  const distance=Math.abs((x-a.x)*dy-(y-a.y)*dx)/length,alpha=Math.max(0,Math.min(1,2-distance));
  if(alpha)rgba.set([30,60,90].map(v=>Math.round(255+alpha*(v-255))),(y*width+x)*4);
 }
 for(let y=29;y<=31;y++)for(let x=33;x<=50;x++)rgba.set([30,60,90,255],(y*width+x)*4);
 // The endpoint regions have a separate head certificate. The full path
 // still supplies the independent straight-run frame for the retained shaft.
 const trimmed=path.slice(2,-2),input={width,height,rgba,background,path,trimmed,work:{checks:0}};
 assert.equal(sourceRouteCoverageWidth({...input,path:trimmed,complete:true,cache:new Map()}),null);
 const snapshot=Buffer.from(rgba),result=measure({...input,work:{checks:0}});
 assert.ok(result>=2.5&&result<=3.5,String(result));assert.deepEqual(rgba,snapshot);
 assert.ok(measure({...input,path:[...path].reverse(),trimmed:[...trimmed].reverse(),work:{checks:0}})!==null);
 assert.equal(measure({...input,trimmed:path,work:{checks:0}}),null,'a genuinely obstructed end section retains its rejection');
});

test('compound calibration rejects invalid, extreme and executable boundary inputs before side effects',()=>{
 for(const input of [null,{}, {...fixture(),path:new Array(4)}, {...fixture(),trimmed:Array(513).fill({x:40,y:30})},
  {...fixture(),path:[{x:Infinity,y:20}]}, {...fixture(),trimmed:[{x:80,y:20}]},
  {...fixture(),background:[255,NaN,255]}, {...fixture(),work:{checks:-1}}, {...fixture(),work:Object.freeze({checks:0})},
  {...fixture(),rgba:Buffer.alloc(1)}, {...fixture(),width:513,height:513,rgba:Buffer.alloc(513*513*4)}])assert.throws(()=>measure(input));
 let calls=0;const trap=()=>{calls++;throw Error('private');};
 for(const input of [new Proxy({}, {get:trap}), {...fixture(),path:new Proxy([],{get:trap})},
  {...fixture(),trimmed:[Object.defineProperty({y:20},'x',{get:trap})]},
  {...fixture(),rgba:new Proxy(new Uint8Array(80*120*4),{get:trap})}])assert.throws(()=>measure(input),TypeError);
 assert.equal(calls,0);
});

test('complex head vertices cannot veto independent scanline calibration of the complete retained shaft',()=>{
 const {compoundHeadAxisFixture}=require('./helpers/source-compound-head-axis.cjs');
 const {partitionSourceCompoundRoute}=require('../packages/slideclone-core/routing/source-compound-route-partition');
 const {simplifySourceRoute}=require('../packages/slideclone-core/routing/source-route-centerline');
 const f=compoundHeadAxisFixture({tipX:250}),partition=partitionSourceCompoundRoute({...f,work:{checks:0}});assert.ok(partition);
 assert.equal(simplifySourceRoute(f.path,{checks:0}),null,'the broad head exceeds native thin-shaft vertex capacity');
 for(let y=0;y<30;y++)for(let x=0;x<f.width;x++)f.rgba.set([255,205,185,255],(y*f.width+x)*4);
 for(let y=90;y<=93;y++)for(let x=0;x<f.width;x++)if(!f.mask[y*f.width+x])f.rgba.set([255,205,185,255],(y*f.width+x)*4);
 const request={...f,trimmed:partition.trimmed,work:{checks:0}},snapshot=Buffer.from(f.rgba),path=structuredClone(f.path);
 assert.equal(sourceRouteCoverageWidth({...request,path:request.trimmed,complete:true,cache:new Map(),work:{checks:0}}),null);
 const width=measure(request);assert.ok(width>=1&&width<=5,String(width));
 assert.deepEqual(f.rgba,snapshot);assert.deepEqual(f.path,path);assert.ok(request.work.checks<=4000000);
 for(const change of [q=>{q.work.checks=4000000;},q=>q.rgba.fill(255),q=>{for(let i=3;i<q.rgba.length;i+=4)q.rgba[i]=0;}]){
  const q={...request,rgba:Buffer.from(snapshot),work:{checks:0}};change(q);assert.equal(measure(q),null);
 }
 const full=require('../packages/slideclone-core/routing/source-compound-route-geometry').sourceCompoundRouteGeometry({...f,work:{checks:0}});
 assert.ok(full,'the unchanged head, footprint, topology and flank checks still apply');assert.ok(full.nativePoints.length<=16);
 const broad=compoundHeadAxisFixture();
 for(let y=0;y<30;y++)for(let x=0;x<broad.width;x++)broad.rgba.set([255,205,185,255],(y*broad.width+x)*4);
 for(let y=90;y<=93;y++)for(let x=0;x<broad.width;x++)if(!broad.mask[y*broad.width+x])broad.rgba.set([255,205,185,255],(y*broad.width+x)*4);
 // Reusing pure cell intersections now leaves enough of the SAME budget for
 // the complete geometry. A pre-exhausted ledger must still grant nothing.
 const broadSnapshot=Buffer.from(broad.rgba),broadMask=broad.mask.slice();
 const geometry=require('../packages/slideclone-core/routing/source-compound-route-geometry').sourceCompoundRouteGeometry(broad);
 assert.ok(geometry);assert.ok(geometry.nativePoints.length<=16);assert.ok(broad.work.checks<=4000000);
 assert.deepEqual(geometry.nativePoints[0],broad.path[0]);assert.deepEqual(geometry.nativePoints.at(-1),broad.path.at(-1));
 assert.deepEqual(broad.rgba,broadSnapshot);assert.deepEqual(broad.mask,broadMask);
 assert.equal(require('../packages/slideclone-core/routing/source-compound-route-geometry').sourceCompoundRouteGeometry({...broad,work:{checks:4000000}}),null);
});
