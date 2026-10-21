'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteNodeBackground:measure}=require('../packages/slideclone-core/source-route-node-background');

function fixture(){
 const width=48,height=32,image={width,height,rgba:Buffer.alloc(width*height*4,255)},mask=new Uint8Array(width*height);
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*width+x)*4);
 for(let y=0;y<4;y++)for(let x=8;x<32;x++)mask[y*width+x]=1;
 for(let x=10;x<30;x++)mask[4*width+x]=1;
 for(let y=5;y<14;y++)for(let x=10;x<30;x++)put(x,y,[255,205+(y-5)*5,185+(y-5)*7]);
 for(let y=5;y<32;y++)put(20,y,[150,40,10]);
 return {image,bodies:[{box:{x:8,y:0,w:24,h:5},mask}],background:[255,255,255],work:{checks:0},put};
}

function transform(input,reverse,transpose){
 const {width,height}=input.image,w=transpose?height:width,h=transpose?width:height;
 const rgba=Buffer.alloc(w*h*4),mask=new Uint8Array(w*h);
 const point=(x,y)=>{if(reverse)y=height-1-y;return transpose?{x:y,y:x}:{x,y};};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=point(x,y),n=p.y*w+p.x,src=y*width+x;
  rgba.set(input.image.rgba.subarray(src*4,src*4+4),n*4);mask[n]=input.bodies[0].mask[src];
 }
 const a=point(8,0),b=point(31,4),query=point(20,5),outside=point(8,5);
 return {image:{width:w,height:h,rgba},bodies:[{box:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x)+1,h:Math.abs(a.y-b.y)+1},mask}],
  background:input.background,work:{checks:0},query:query.y*w+query.x,outside:outside.y*w+outside.x};
}

test('rounded private body caps anchor all four source shadow directions without inventing bounding-box corners',()=>{
 for(const reverse of [false,true])for(const transpose of [false,true]){
  const f=transform(fixture(),reverse,transpose),before=Buffer.from(f.image.rgba),mask=f.bodies[0].mask.slice(),at=measure(f);
  assert.deepEqual(at(f.query),[255,205,185]);assert.deepEqual(at(f.outside),f.background);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.bodies[0].mask,mask);assert.ok(f.work.checks>0&&f.work.checks<=4000000);
 }
});

test('body cap nominations retain original flank, continuity, opaque source and complete support gates',()=>{
 for(const mode of ['empty','disjoint','alpha','sharp','detached','clipped']){
  const f=fixture();
  if(mode==='empty')f.bodies=[];
  if(mode==='disjoint')f.bodies[0].mask[4*48+20]=0;
  if(mode==='alpha')f.image.rgba[(7*48+10)*4+3]=0;
  if(mode==='sharp')for(let x=10;x<30;x++)f.put(x,8,[30,60,90]);
  if(mode==='detached')for(let x=10;x<30;x++)f.put(x,5,[255,255,255]);
  if(mode==='clipped')for(let y=5;y<32;y++)for(let x=10;x<30;x++)f.put(x,y,[255,205,185]);
  assert.deepEqual(measure(f)(5*48+20),f.background,mode);
 }
});

test('actual cap scans and candidate copies share one ledger and exhaustion cannot retain a partial certificate',()=>{
 const ordinary=fixture(),at=measure(ordinary),cost=ordinary.work.checks;
 assert.deepEqual(at(5*48+20),[255,205,185]);
 const spent=fixture();spent.work.checks=4000000-cost+10;
 const failed=measure(spent);assert.ok(spent.work.checks>4000000);assert.deepEqual(failed(5*48+20),spent.background);
 const sentinel=spent.work.checks;assert.deepEqual(failed(5*48+20),spent.background);assert.equal(spent.work.checks,sentinel);
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.includesSuite(__filename,'unit'),true);
 assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-route-body-shadow-spans.js'));
});
