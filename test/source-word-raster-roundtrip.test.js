'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceWordLayout,remeasureSourceWordLayout}=require('../packages/slideclone-core/typography/source-word-layout-evidence');
const {sourceWordRetryFrame}=require('../packages/slideclone-core/typography/source-word-retry-frame');
const {sourceWordRasterEdge,sourceWordPixelFloor,sourceWordPixelCeil}=require('../packages/slideclone-core/typography/source-word-raster-edge');
function fixture(box={x:20,y:16,w:40,h:20}){
 const width=96,height=64,rgba=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const bg=[235+x%7,237+y%3,240],edge=x===24||x===55||y===20||y===31;
  const alpha=x>=24&&x<=55&&y>=20&&y<=31?(edge?.7:1):0;
  rgba.set([...bg.map((v,c)=>Math.round(v*(1-alpha)+[30,35,40][c]*alpha)),255],(y*width+x)*4);
 }
 return {image:{width,height,rgba},line:{text:'TEST',box},color:'#1E2328',maxScanPixels:4000000};
}
function observed(result){return {runs:result.runs,typographicRuns:result.typographicRuns,reason:result.reason,scannedPixels:result.scannedPixels};}
test('source word raster windows and half-coverage geometry survive pixel-to-point roundoff',()=>{
 const base=fixture(),expected=measureSourceWordLayout(base);assert.ok(expected.runs);assert.ok(expected.typographicRuns);
 for(const sign of [-1,1])for(const key of ['x','y','w','h']){
  const box={...base.line.box,[key]:base.line.box[key]+sign*Number.EPSILON*base.line.box[key]*2};
  const input=fixture(box),before=structuredClone(input),actual=measureSourceWordLayout(input);
  assert.deepEqual(observed(actual),observed(expected),key+' '+sign);
  assert.deepEqual(input,before,'measurement does not rewrite admitted source geometry');
 }
});
test('source word retry windows retain the same neighbor limits after coordinate roundoff',()=>{
 const base={width:96,height:64,hint:{x:20,y:16,w:40,h:20},margin:8,sides:{left:true,right:true,top:true,bottom:true},neighbors:[{x:70,y:10,w:10,h:40},{x:10,y:48,w:70,h:8}]};
 const expected=sourceWordRetryFrame(base);
 for(const sign of [-1,1])for(const key of ['x','y','w','h']){
  const hint={...base.hint,[key]:base.hint[key]+sign*Number.EPSILON*base.hint[key]*2};
  assert.deepEqual(sourceWordRetryFrame({...base,hint}),expected,key+' '+sign);
 }
});
test('real fractional seeds retain their extra raster cells and their full scan charge',()=>{
 const base=fixture(),baseline=measureSourceWordLayout(base);
 for(const delta of [1e-8,.125,.5]){
  const actual=measureSourceWordLayout(fixture({...base.line.box,w:base.line.box.w+delta}));
  assert.equal(actual.scannedPixels,baseline.scannedPixels+24);
 }
 const limited=measureSourceWordLayout({...base,maxScanPixels:baseline.scannedPixels-1});
 assert.equal(limited.reason,'source-budget');assert.equal(limited.scannedPixels,0);
});
test('raster edge normalization is bounded, does not coerce inputs, and retains meaningful fractions',()=>{
 for(const edge of [0,1,16,1024,16384]){
  assert.equal(sourceWordRasterEdge(edge),edge);
  for(const sign of [-1,1]){
   const value=edge+sign*2*Number.EPSILON*Math.max(1,edge);
   if(value>=0&&value<=16384)assert.equal(sourceWordRasterEdge(value),edge);
  }
 }
 for(const value of [1e-8,1.125,16-1e-8,1024+1e-8,16384-1e-8]){
  assert.equal(sourceWordRasterEdge(value),value);
  assert.equal(sourceWordPixelFloor(value),Math.floor(value));assert.equal(sourceWordPixelCeil(value),Math.ceil(value));
 }
 let hooks=0;
 const hostile={valueOf(){hooks++;throw Error('PRIVATE');},toString(){hooks++;throw Error('PRIVATE');}};
 for(const value of [undefined,null,[],{},hostile,new Proxy(hostile,{}),'PRIVATE',NaN,Infinity,-Infinity,-1,16385,Number.MAX_VALUE]){
  for(const method of [sourceWordRasterEdge,sourceWordPixelFloor,sourceWordPixelCeil])
   assert.throws(()=>method(value),e=>e instanceof TypeError&&!e.message.includes('PRIVATE'));
 }
 assert.equal(hooks,0);
});
test('roundoff stabilization preserves exact budget rejection and private snapshot replay',()=>{
 const base=fixture(),expected=measureSourceWordLayout(base),pixels=expected.scannedPixels;
 const input=fixture({...base.line.box,x:base.line.box.x-Number.EPSILON*base.line.box.x*2});
 input.maxScanPixels=pixels;
 const first=measureSourceWordLayout(input);assert.deepEqual(observed(first),observed(expected));
 const before=input.image.rgba.slice();input.image.rgba.fill(255);
 const replay=remeasureSourceWordLayout(input,input.color,pixels);assert.deepEqual(observed(replay),observed(expected));
 const exhausted=remeasureSourceWordLayout(input,input.color,pixels-1);assert.equal(exhausted.reason,'source-budget');assert.equal(exhausted.scannedPixels,0);
 assert.equal(remeasureSourceWordLayout({...input},input.color,pixels),null);
 input.image.rgba.set(before);input.maxScanPixels=pixels-1;
 assert.equal(measureSourceWordLayout(input).reason,'source-budget');assert.equal(remeasureSourceWordLayout(input,input.color,pixels),null);
});
test('zero page edges, empty source and censored ink retain their original failure boundaries',()=>{
 const edge=fixture({x:0,y:0,w:96,h:64});assert.ok(measureSourceWordLayout(edge).runs);
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(measureSourceWordLayout(blank).runs,null);
 const censored=fixture();for(let y=0;y<=20;y++)censored.image.rgba.set([30,35,40,255],(y*96+24)*4);
 assert.equal(measureSourceWordLayout(censored).runs,null);
 const fractional=sourceWordRetryFrame({width:96,height:64,hint:{x:20,y:16,w:40,h:20},margin:8,
  sides:{left:true,right:true,top:true,bottom:true},neighbors:[{x:65.25,y:10,w:10,h:40},{x:10,y:44.25,w:70,h:8}]});
 assert.equal(fractional.x+fractional.w,65);assert.equal(fractional.y+fractional.h,44);
});
