"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fitScenePrimitiveCandidate}=require('../packages/slideclone-core/source-scene-primitive-fit');
const image=()=>{const width=160,height=120,rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const d=Math.hypot((x+.5-82)/32,(y+.5-60)/26);if(d<=1){const p=(y*width+x)*4;rgba[p]=120;rgba[p+1]=170;rgba[p+2]=220;}}
 return {width,height,rgba};};
const request=()=>({image:image(),budget:{used:0},textMasks:[],protectedChildren:[],frame:{widthPx:160,heightPx:120,widthPt:160,heightPt:120},
 recipe:{id:'shape',kind:'ellipse',box:{x:45,y:34,w:64,h:52},fill:'#78AADC',stroke:'#78AADC',strokeWidthPx:0}});
test('actual constructed ellipse is calibrated to source, retaining all authority vetoes',()=>{
 const r=request(),original=structuredClone(r.recipe),fit=fitScenePrimitiveCandidate(r);assert(fit);
 assert(fit.calibration.after.loss<fit.calibration.before.loss);assert(fit.recipe.box.x>original.box.x);
 assert.equal(fit.sourceAuthorized,false);assert.equal(fit.portsAuthorized,false);assert.equal(fit.labelsCompleted,false);
 assert.equal(fit.shapes[0].source.editable,undefined);assert.deepEqual(r.recipe,original);assert(r.budget.used>0&&r.budget.used<=4000000);
});
test('shared budget exhaustion, transparent source, and completely protected scene produce no fit',()=>{
 const r=request();r.budget.used=4000000;assert.equal(fitScenePrimitiveCandidate(r),null);assert.equal(r.budget.used,4000000);
 const p=request();p.protectedChildren=[{x:0,y:0,w:160,h:120}];assert.equal(fitScenePrimitiveCandidate(p),null);
 const t=request();for(let i=3;i<t.image.rgba.length;i+=4)t.image.rgba[i]=0;assert.equal(fitScenePrimitiveCandidate(t),null);
});
test('invalid boundaries fail before source reads and never execute getters',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'recipe',{get(){calls++;throw Error('private-key');}});
 for(const r of [null,{},[],new Proxy(request(),{}),hostile,{...request(),textMasks:new Array(1)},
  {...request(),frame:{widthPx:159,heightPx:120,widthPt:160,heightPt:120}},
  {...request(),protectedChildren:[{x:159,y:0,w:2,h:10}]}, {...request(),budget:{used:-1}}])
  assert.throws(()=>fitScenePrimitiveCandidate(r),e=>e instanceof TypeError&&!e.message.includes('private-key'));
 assert.equal(calls,0);
});
test('large source windows respect original per-unit capacity without partial scans',()=>{
 const r=request();r.image={width:800,height:800,rgba:new Uint8Array(800*800*4).fill(255)};
 r.frame={widthPx:800,heightPx:800,widthPt:800,heightPt:800};r.recipe.box={x:1,y:1,w:798,h:798};
 assert.equal(fitScenePrimitiveCandidate(r),null);assert.equal(r.budget.used,0);
});
