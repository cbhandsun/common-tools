'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareNativeSourceRender}=require('../packages/slideclone-core/scene-plan/source-native-render-comparison');
function fixture(){
 const width=12,height=12,rgba=Buffer.alloc(width*height*4,255),mask=new Uint8Array(width*height);
 for(const [x,y]of [[3,3],[4,3],[5,3],[6,3],[5,4],[5,5],[5,6]]){
  const n=y*width+x;mask[n]=1;rgba.set([110,55,20,255],n*4);
 }
 return {source:{width,height,rgba},rendered:{width,height,rgba:Buffer.from(rgba)},sourceMask:mask,background:[255,255,255],work:{checks:0}};
}
test('complete source and rendered ink are compared without a blank-area denominator',()=>{
 const input=fixture(),result=compareNativeSourceRender(input);
 assert.equal(result.paintMatched,true);assert.equal(result.sourceInk,7);assert.equal(result.renderedInk,7);
 assert.equal(result.sourceSupport,1);assert.equal(input.work.checks,12*12*12);
 for(const n of [3*12+3,3*12+4])input.rendered.rgba.set([255,255,255,255],n*4);
 assert.equal(compareNativeSourceRender(input).paintMatched,false);
});
test('extra paint, copied source content, wrong paint and missing junctions cannot certify the graph',()=>{
 for(const mutate of [
  input=>input.rendered.rgba.set([110,55,20,255],0),
  input=>{input.rendered.rgba.set([0,0,0,255],0);input.source.rgba.set([0,0,0,255],0);},
  input=>input.rendered.rgba.set([0,0,0,255],(3*12+5)*4),
  input=>input.rendered.rgba.set([255,255,255,255],(3*12+5)*4)
 ]){const input=fixture();mutate(input);assert.equal(compareNativeSourceRender(input).paintMatched,false);}
});
test('empty components and transparent or malformed pixels never pass',()=>{
 const empty=fixture();empty.sourceMask.fill(0);assert.equal(compareNativeSourceRender(empty).paintMatched,false);
 const alpha=fixture();alpha.rendered.rgba[3]=0;assert.equal(compareNativeSourceRender(alpha).status,'alpha-rejected');
 const invalid=fixture();invalid.sourceMask[0]=2;assert.throws(()=>compareNativeSourceRender(invalid),/mask is invalid/u);
 for(const mutate of [input=>{input.rendered.width=13;},input=>{input.source.rgba=Buffer.alloc(1);},
  input=>{input.sourceMask=new Uint8Array(1);},input=>{input.background=[0,NaN,0];},input=>{input.work.checks=-1;},
  input=>{input.source.width=16385;},input=>{input.source.rgba=new Uint8Array(new SharedArrayBuffer(576));}]){
  const input=fixture();mutate(input);assert.throws(()=>compareNativeSourceRender(input),/invalid/u);
 }
});
test('unknown, proxy, accessor and hostile buffer inputs fail without invoking user code',()=>{
 for(const value of [null,[],{},new Proxy({},{get(){throw new Error('trap');}}),Object.defineProperty({},'source',{get(){throw new Error('getter');}})])
  assert.throws(()=>compareNativeSourceRender(value),/controls are invalid/u);
 const input=fixture();input.source.rgba=new Proxy(input.source.rgba,{get(){throw new Error('trap');}});
 assert.throws(()=>compareNativeSourceRender(input),/rasters are invalid/u);
 const shadow=fixture();Object.defineProperty(shadow.sourceMask,'length',{get(){throw new Error('getter');}});
 assert.equal(compareNativeSourceRender(shadow).paintMatched,true);
});
test('the original counter is charged atomically and exhausted comparisons return no partial support',()=>{
 const input=fixture();input.work.checks=4000000-12*12*12;
 assert.equal(compareNativeSourceRender(input).paintMatched,true);assert.equal(input.work.checks,4000000);
 assert.equal(compareNativeSourceRender(input).status,'budget-exhausted');assert.equal(input.work.checks,4000001);
 const frozen=fixture();Object.freeze(frozen.work);assert.throws(()=>compareNativeSourceRender(frozen),/controls are invalid/u);
});
test('regression is discovered by the unified unit CI entrypoint',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(row=>row.file.replaceAll('\\','/')==='test/source-native-pixel-comparison.test.js'));
});
