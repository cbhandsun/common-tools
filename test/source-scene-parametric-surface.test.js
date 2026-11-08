"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fitSourceTextBand,fitObservedSourceTextBand}=require('../packages/slideclone-core/typography/source-text-band-evidence');
const {measureSceneParametricSurface}=require('../packages/slideclone-core/scene-plan/source-scene-parametric-surface');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {withSceneFillRasterCache}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
function fixture({wavy=true,labels=true}={}){
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4)},put=(x,y,color)=>{const i=(y*160+x)*4;image.rgba.set([...color,255],i);};
 for(let y=0;y<120;y++)for(let x=0;x<160;x++)put(x,y,[253,232,242]);
 for(let x=20;x<120;x++){
  const offset=wavy?Math.floor(x/7)%2:0;
  for(let y=20+offset;y<90+offset;y++)put(x,y,[246-Math.round((y-20)/10),246,252]);
 }
 const masks=[];
 if(labels)for(const y of [27,81]){
  for(let cy=y;cy<y+7;cy++)for(let x=30;x<110;x++)if((x-30)%10<5)put(x,cy,[30,40,60]);masks.push({x:30,y,w:80,h:7});
 }
 return {image,masks,hint:{x:20,y:20,w:100,h:70}};
}

function competingFrameFixture({parent=false}={}){
 const image={width:260,height:210,rgba:Buffer.alloc(260*210*4)},hint={x:30,y:25,w:144,h:120};
 const paint=(x,y,w,h,color)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set([...color,255],(row*image.width+col)*4);};
 paint(0,0,260,210,[249,252,255]);
 if(parent){
  paint(10,10,231,161,[245,248,255]);
  for(const edge of [[10,10,231,1],[10,170,231,1],[10,10,1,161],[240,10,1,161]])paint(...edge,[228,231,238]);
 }else{
  paint(174,10,67,151,[245,248,255]);
  for(const edge of [[174,10,67,1],[174,160,67,1],[240,10,1,151]])paint(...edge,[228,231,238]);
 }
 const ink=[30,60,90];
 for(let x=46;x<158;x+=12){paint(x,25,8,2,ink);paint(x,143,8,2,ink);}
 for(let y=37;y<131;y+=12){paint(30,y,2,10,ink);paint(172,y,2,10,ink);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[165,25,true,false],[30,136,false,true],[165,136,true,true]]){
  paint(x,y+(bottom?7:0),9,2,ink);paint(x+(right?7:0),y,2,9,ink);
 }
 return {image,hint,candidate:parent?{x:10,y:10,w:230,h:160}:{x:174,y:10,w:66,h:150},paint};
}

test('a crossing hollow frame cannot supply the source perimeter of a different opaque recovery',()=>{
 const f=competingFrameFixture(),before=Buffer.from(f.image.rgba),budget={used:0};
 assert.ok(measureSceneParametricSurface(f.image,f.candidate,[],{used:0}),'isolated middle-edge fitting reproduces the false candidate');
 const cache=createSceneMeasurementCache(f.image,[],budget);
 assert.equal(cache.outline(f.hint),null);assert.ok(cache.pattern(f.hint));
 assert.deepEqual(cache.surface(f.candidate),{outline:null,measured:null});assert.equal(cache.portFrame(f.candidate),null);
 assert.ok(cache.failureDetails(f.candidate).some(f=>f.code==='parametric-boundary-owned-by-frame'));
 const used=budget.used;assert.deepEqual(cache.surface(f.candidate),{outline:null,measured:null});
 assert.equal(cache.portFrame(f.candidate),null);assert.equal(budget.used,used);assert.ok(used<=4000000);
 assert.deepEqual(f.image.rgba,before);
});

test('cached recovery retrieval rechecks subsequently measured competing frame ink without rescanning',()=>{
 const f=competingFrameFixture(),budget={used:0},cache=createSceneMeasurementCache(f.image,[],budget);
 assert.ok(cache.surface(f.candidate).measured);
 assert.equal(cache.outline(f.hint),null);assert.ok(cache.pattern(f.hint));
 const used=budget.used;assert.equal(cache.surface(f.candidate).measured,null);assert.equal(cache.portFrame(f.candidate),null);
 assert.equal(budget.used,used);
});

test('independently observed adjacent bodies and complete parents retain their source frames',()=>{
 for(const parent of [false,true]){
  const f=competingFrameFixture({parent});
  if(!parent)f.paint(180,10,1,151,[228,231,238]);
  const candidate=parent?f.candidate:{x:180,y:10,w:60,h:150},budget={used:0},cache=createSceneMeasurementCache(f.image,[],budget);
  assert.equal(cache.outline(f.hint),null);assert.ok(cache.pattern(f.hint));
  const result=cache.surface(candidate);assert.ok(result.measured||result.outline);assert.ok(cache.portFrame(candidate));
  assert.equal(cache.failureDetails(candidate).some(f=>f.code==='parametric-boundary-owned-by-frame'),false);
 }
});
test('complete local-flank evidence recovers a wavy pale body while preserving the old thresholds',()=>{
 const f=fixture(),input={image:f.image,box:f.hint,slideSize:{widthPt:160,heightPt:120}};
 assert.equal(fitSourceTextBand(input),null);
 const fit=fitObservedSourceTextBand(input);assert.ok(fit);assert.ok(fit.support>=.8);
 assert.ok(Math.abs(fit.box.x-20)<=3&&Math.abs(fit.box.y-20)<=3);
 const budget={used:0},surface=measureSceneParametricSurface(f.image,f.hint,f.masks,budget);
 assert.ok(surface);assert.ok(surface.gradient);assert.ok(budget.used>0&&budget.used<=262144);
 assert.ok(surface.gradient.stops.every(s=>/^#[a-f\d]{6}$/iu.test(s.color)));
});
test('previously successful measurements retain exact geometry and do not acquire recovery geometry',()=>{
 const f=fixture({wavy:false,labels:false}),input={image:f.image,box:f.hint,slideSize:{widthPt:160,heightPt:120}};
 const old=fitSourceTextBand(input);assert.ok(old);assert.deepEqual(fitObservedSourceTextBand(input),old);
});

test('wide shallow bodies use the complete edge search domain rather than an oversized layered halo',()=>{
 const image={width:1400,height:400,rgba:Buffer.alloc(1400*400*4,255)};
 for(let y=130;y<230;y++)for(let x=8;x<1392;x++){
  const edge=x===8||x===1391||y===130||y===229;
  image.rgba.set(edge?[228,231,237,255]:[245,248,255,255],(y*1400+x)*4);
 }
 // Pale outside color and 17/21 channel contrast reproduce asymmetric flanks.
 for(let y=0;y<400;y++)for(let x=0;x<1400;x++)if(y<130||y>=230||x<8||x>=1392)
  image.rgba.set([249,252,255,255],(y*1400+x)*4);
 const hint={x:8,y:130,w:1384,h:94},budget={used:0};
 const surface=measureSceneParametricSurface(image,hint,[],budget);
 assert.ok(surface);assert.ok(surface.support>=.8);
 assert.ok(Math.abs(surface.box.y+surface.box.h-229)<=3);
 assert.ok(budget.used>0&&budget.used<=262144);
 const exhausted={used:4000000};assert.equal(measureSceneParametricSurface(image,hint,[],exhausted),null);
 assert.equal(exhausted.used,4000000);
 // A missing side cannot be supplied by the proposed rectangle.
 for(let y=130;y<230;y++)image.rgba.set([249,252,255,255],(y*1400+1391)*4);
 assert.equal(measureSceneParametricSurface(image,hint,[],{used:0}),null);
});
test('unknown hints and serialized surfaces cannot acquire a private measured cache frame',()=>{
 const f=fixture(),budget={used:0},cache=createSceneMeasurementCache(f.image,f.masks,budget);
 assert.equal(cache.portFrame(f.hint),null);
 const result=cache.surface(f.hint);assert.ok(result.measured||result.outline);
 assert.ok(cache.portFrame(f.hint));assert.equal(cache.portFrame({x:21,y:20,w:100,h:70}),null);
 const other=createSceneMeasurementCache({...f.image,rgba:Buffer.from(f.image.rgba)},f.masks,{used:0});
 assert.equal(other.portFrame(f.hint),null);
});
test('masked boundaries and absent bodies do not authorize a surface',()=>{
 const f=fixture();assert.equal(measureSceneParametricSurface(f.image,f.hint,[{x:19,y:19,w:102,h:72}],{used:0}),null);
 const empty={width:160,height:120,rgba:Buffer.alloc(160*120*4,255)};
 assert.equal(measureSceneParametricSurface(empty,f.hint,[],{used:0}),null);
 for(let y=0;y<120;y++)for(let x=0;x<160;x++)f.image.rgba[(y*160+x)*4+3]=0;
 assert.equal(measureSceneParametricSurface(f.image,f.hint,[],{used:0}),null);
});
test('local recovery does not turn unrelated fragments or open outlines into a complete body',()=>{
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4,255)},query={image,box:{x:20,y:20,w:100,h:70},slideSize:{widthPt:160,heightPt:120}};
 for(let x=20;x<55;x++)for(const y of [20,21])image.rgba.set([0,0,0,255],(y*160+x)*4);
 for(let x=85;x<120;x++)for(const y of [88,89])image.rgba.set([0,0,0,255],(y*160+x)*4);
 assert.equal(fitObservedSourceTextBand(query),null);
 assert.equal(measureSceneParametricSurface(image,query.box,[],{used:0}),null);
 for(let x=20;x<120;x+=10)for(let y=20;y<25;y++)for(let dx=0;dx<4;dx++)image.rgba.set([0,0,0,255],(y*160+x+dx)*4);
 assert.equal(fitObservedSourceTextBand(query),null);
});
test('source unit and total limits remain unchanged and charged observations are reusable',()=>{
 const f=fixture(),full={used:4000000};assert.equal(measureSceneParametricSurface(f.image,f.hint,f.masks,full),null);assert.equal(full.used,4000000);
 const budget={used:0};withSceneFillRasterCache(f.image,budget,()=>{
  assert.ok(measureSceneParametricSurface(f.image,f.hint,f.masks,budget));const used=budget.used;
  assert.ok(measureSceneParametricSurface(f.image,f.hint,f.masks,budget));assert.equal(budget.used,used);
 });
 const large={width:700,height:700,rgba:Buffer.alloc(700*700*4,255)},bounded={used:0};
 assert.equal(measureSceneParametricSurface(large,{x:10,y:10,w:670,h:670},[],bounded),null);assert.equal(bounded.used,0);
});
test('invalid, extreme, accessor and proxy controls fail without running provider code',()=>{
 const f=fixture();let accessed=false;
 const getter={get x(){accessed=true;throw Error('provider accessor');},y:20,w:100,h:70};
 const proxy=new Proxy({}, {get(){accessed=true;throw Error('provider proxy');},ownKeys(){accessed=true;throw Error('provider proxy');}});
 for(const hint of [null,{},getter,proxy,{x:-1,y:20,w:100,h:70},{x:20,y:20,w:Infinity,h:70}])
  assert.throws(()=>measureSceneParametricSurface(f.image,hint,[],{used:0}),TypeError);
 for(const image of [null,{},proxy,{...f.image,rgba:f.image.rgba.subarray(4)},{...f.image,width:16385}])
  assert.throws(()=>measureSceneParametricSurface(image,f.hint,[],{used:0}),TypeError);
 for(const budget of [null,{},proxy,{used:-1},{used:NaN}])assert.throws(()=>measureSceneParametricSurface(f.image,f.hint,[],budget),TypeError);
 assert.throws(()=>measureSceneParametricSurface(f.image,f.hint,proxy,{used:0}),TypeError);assert.equal(accessed,false);
 const rgbaProxy=new Proxy(f.image.rgba,{get(){accessed=true;throw Error('pixel proxy');}});
 assert.equal(fitObservedSourceTextBand({image:{...f.image,rgba:rgbaProxy},box:f.hint,slideSize:{widthPt:160,heightPt:120}}),null);
 assert.equal(accessed,false);
});

test('parametric domain and asymmetric stroke regressions stay in the unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),path=require('node:path');
 const root=path.resolve(__dirname,'..');
 for(const suite of ['unit','all']){
  const files=discoverTestFiles(root,suite).map(entry=>entry.file.replaceAll('\\','/'));
  for(const name of ['source-scene-parametric-surface','source-text-band-evidence'])
   assert.ok(files.includes('test/'+name+'.test.js'));
 }
});
