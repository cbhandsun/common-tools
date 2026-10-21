'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceCompoundRouteGeometry:measure}=require('../packages/slideclone-core/source-compound-route-geometry');
function fixture(){
 const width=180,height=150,rgba=Buffer.alloc(width*height*4,255),mask=new Uint8Array(width*height),path=[];
 const put=(x,y,on=true)=>{mask[y*width+x]=on?1:0;rgba.set(on?[20,80,210,255]:[255,255,255,255],(y*width+x)*4);};
 for(let i=0;i<=100;i++){
  const angle=Math.PI+i*Math.PI/200,p={x:Math.round(80+50*Math.cos(angle)),y:Math.round(100+50*Math.sin(angle))};
  if(!path.length||path.at(-1).x!==p.x||path.at(-1).y!==p.y)path.push(p);
 }
 for(let x=81;x<=130;x++)path.push({x,y:50});
 for(const p of path)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)put(p.x+dx,p.y+dy);
 for(let x=110;x<=130;x++){const radius=Math.floor((130-x)/2);for(let y=50-radius;y<=50+radius;y++)put(x,y);}
 return {mask,width,height,rgba,path,direction:'forward',background:[255,255,255],work:{checks:0},put};
}
test('compound curve independently certifies a complete broad head and unchanged thin shaft without mutating source',()=>{
 const f=fixture(),before=Buffer.from(f.rgba),mask=Buffer.from(f.mask),result=measure(f);
 assert.ok(result);assert.equal(result.filledTerminals,true);assert.ok(result.shaft>=1&&result.shaft<=5);assert.ok(result.support>=.9);
 assert.deepEqual(f.rgba,before);assert.deepEqual(Buffer.from(f.mask),mask);assert.ok(f.work.checks<=4000000);
});
test('complete native polyline proof takes precedence over the fixed-contour fallback',()=>{
 const {partitionSourceCompoundRoute}=require('../packages/slideclone-core/source-compound-route-partition');
 const {proveSourceCompoundPolyline}=require('../packages/slideclone-core/source-compound-route-geometry');
 const control=fixture(),partition=partitionSourceCompoundRoute(control);assert.ok(partition);
 const expected=proveSourceCompoundPolyline(control,partition);assert.ok(expected);
 const f=fixture(),result=measure(f);assert.ok(result);
 assert.equal(result.filledBody,undefined);assert.deepEqual(result.nativePoints,expected.nativePoints);
 assert.ok(result.nativePoints.length>=2&&result.nativePoints.length<=16);assert.ok(f.work.checks<=4000000);
});
test('compound proof rejects branches, broken shafts, false direction, oversized bodies and missing heads',()=>{
 for(const mode of ['branch','broken','direction','head','body']){
  const f=fixture();
  if(mode==='branch')for(let y=40;y<50;y++)for(let x=90;x<=92;x++)f.put(x,y);
  if(mode==='broken')for(let y=45;y<=55;y++)f.put(95,y,false);
  if(mode==='direction')f.direction='backward';
  if(mode==='head')for(let x=110;x<=130;x++)for(let y=39;y<=61;y++)if(y<49||y>51)f.put(x,y,false);
  if(mode==='body')for(const p of f.path)for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)f.put(p.x+dx,p.y+dy);
  assert.equal(measure(f),null,mode);
 }
});
test('compound work ledger, source boundary and original path length limits fail closed',()=>{
 const f=fixture();assert.equal(measure({...f,work:{checks:4000000}}),null);
 assert.equal(measure({...f,path:[]}),null);assert.equal(measure({...f,path:Array(513).fill(f.path[0])}),null);
 assert.equal(measure({...f,direction:'undirected'}),null);
});
