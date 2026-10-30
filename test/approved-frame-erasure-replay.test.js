'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildApprovedFrameMask,signedDistance,digest}=require('../packages/slideclone-core/scene-plan/approved-frame-mask');
const {buildApproximateBackgroundPlan}=require('../packages/slideclone-core/scene-plan/approved-frame-approximation');
const {applyApprovedFrameErasureReplay:apply}=require('../packages/slideclone-core/scene-plan/approved-frame-erasure-replay');
function fixture(){
 const width=64,height=48,rgba=Buffer.alloc(width*height*4),frame={x:8,y:8,w:48,h:30,radius:6},sha='a'.repeat(64);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sd=signedDistance(frame,x,y),color=Math.abs(sd)<=.7?[225,235,230]:sd<0?[242,249,245]:[251,250,248];rgba.set([...color,255],(y*width+x)*4);
 }
 const source={width,height,rgba},data={approvalId:'user-20261023-approx-frame',source,sourceSha256:sha,fitSha256:sha,
  frames:[{status:'fitted',id:'region-n6',source:{width,height,sha256:sha},geometry:{boxPx:{x:8,y:8,w:48,h:30},radiusPx:6,strokeWidthPx:2,strokeColor:'#E1EBE6'},approximation:{approvalId:'user-20261023-approx-frame'}}],
  protections:[],additionalProtections:[],supplement:[],supplementEvidenceSha256:sha,excludedSourceMask:new Uint8Array(width*height),classificationSha256:sha,classificationSourceSha256:sha};
 data.originalMaskSha256=buildApprovedFrameMask(data).maskSha256;data.excludedSourceMaskSha256=digest(data.excludedSourceMask);
 const plan=buildApproximateBackgroundPlan(data),registration={x:0,y:0,w:width,h:height},before={width,height,rgba:Buffer.from(rgba)};
 const target=8*width+30,hidden=target+1;before.rgba.set([13,17,19,0],hidden*4);
 const after=applyOriginal({asset:before,source,plan,registration}),asset={width,height,rgba:Buffer.from(after.rgba)};
 asset.rgba.set([255,255,255,0],target*4);asset.rgba.set([29,31,37,0],0);
 return {asset,before,after,source,plan,registration,beforeRgbaSha256:digest(before.rgba),afterRgbaSha256:digest(after.rgba),target,hidden};
}
const applyOriginal=require('../packages/slideclone-core/scene-plan/approved-frame-approximation').applyApproximateBackgroundPlan;
function input(f){const {target,hidden,...data}=f;return data;}
test('a newly erased previously opaque approved source cell replays the exact approved fill without adding coordinates',()=>{
 const f=fixture(),before=Buffer.from(f.asset.rgba),result=apply(input(f));
 assert.equal(result.rgba[f.target*4+3],255);assert.deepEqual(result.rgba.subarray(f.target*4,f.target*4+4),f.after.rgba.subarray(f.target*4,f.target*4+4));
 assert.deepEqual(f.asset.rgba,before);assert.equal(result.replayedPixels,1);
 assert.deepEqual(result.rgba.subarray(f.hidden*4,f.hidden*4+4),before.subarray(f.hidden*4,f.hidden*4+4));
 assert.deepEqual(result.rgba.subarray(0,4),before.subarray(0,4));assert.equal(result.strictAccepted,false);assert.equal(result.noGhostVerified,false);
});
test('empty replay, partial alpha, opaque edits and already applied fills retain their existing bytes',()=>{
 for(const alpha of[1,128,255]){const f=fixture();f.asset.rgba.set([1,2,3,alpha],f.target*4);const result=apply(input(f));assert.equal(result.replayedPixels,0);assert.deepEqual(result.rgba.subarray(f.target*4,f.target*4+4),Buffer.from([1,2,3,alpha]));}
 const f=fixture();f.asset.rgba=Buffer.from(f.after.rgba);const result=apply(input(f));assert.equal(result.replayedPixels,0);assert.deepEqual(result.rgba,f.after.rgba);
});
test('stale source, before and after bindings, changed approved output and invalid registration fail atomically',()=>{
 for(const change of[f=>f.beforeRgbaSha256='0'.repeat(64),f=>f.afterRgbaSha256='0'.repeat(64),
  f=>{f.after.rgba[0]^=1;f.afterRgbaSha256=digest(f.after.rgba);},f=>f.source.rgba[0]^=1,
  f=>f.registration.x=.5,f=>f.asset.width=63,f=>f.before.rgba=Buffer.alloc(1),f=>f.plan.repairMask[0]=1]){
  const f=fixture();change(f);const original=Buffer.from(f.asset.rgba);assert.throws(()=>apply(input(f)));assert.deepEqual(f.asset.rgba,original);
 }
});
test('unknown, sparse, extreme and hostile inputs reject before executing hooks or exposing content',()=>{
 let calls=0;const hook=()=>{calls++;throw Error('private-content');};
 const f=fixture();const rows=[null,[],{},new Proxy(input(f),{get:hook,ownKeys:hook,getPrototypeOf:hook}),
  Object.defineProperty(input(f),'before',{get:hook}),{...input(f),asset:{width:32768,height:32768,rgba:Buffer.alloc(0)}},
  {...input(f),beforeRgbaSha256:'private-content'},{...input(f),extra:true}];
 for(const row of rows)assert.throws(()=>apply(row),e=>e instanceof Error&&!e.message.includes('private-content'));
 assert.equal(calls,0);
});
test('cropped registrations and offset byte views preserve the same original source-cell binding',()=>{
 const f=fixture(),crop=image=>{
  const rgba=Buffer.alloc(32*12*4);for(let y=0;y<12;y++)image.rgba.copy(rgba,y*32*4,((y+6)*64+16)*4,((y+6)*64+48)*4);
  const storage=Buffer.alloc(rgba.length+12);rgba.copy(storage,5);return {width:32,height:12,rgba:new Uint8Array(storage.buffer,storage.byteOffset+5,rgba.length)};
 };
 f.asset=crop(f.asset);f.before=crop(f.before);f.after=crop(f.after);f.registration={x:16,y:6,w:32,h:12};
 f.beforeRgbaSha256=digest(f.before.rgba);f.afterRgbaSha256=digest(f.after.rgba);
 const result=apply(input(f)),local=((8-6)*32+30-16)*4;
 assert.equal(result.replayedPixels,1);assert.deepEqual([...result.rgba.subarray(local,local+4)],[...f.after.rgba.subarray(local,local+4)]);
});
test('native byte metadata is used without invoking caller methods or iterators',()=>{
 const f=fixture();let calls=0;
 for(const image of[f.asset,f.before,f.after])for(const key of['subarray','slice','map','buffer','byteOffset','constructor',Symbol.iterator]){
  Object.defineProperty(image.rgba,key,{get(){calls++;throw Error('private-content');}});
 }
 assert.equal(apply(input(f)).replayedPixels,1);assert.equal(calls,0);
});
test('replay regressions are discovered by the unified unit and all CI entry',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of['unit','all'])assert(discoverTestFiles(require('node:path').resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/approved-frame-erasure-replay.test.js'));
});
