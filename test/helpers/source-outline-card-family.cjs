'use strict';
const assert=require('node:assert/strict');
const {fixture:cardFixture}=require('./approved-card-backdrop.cjs');
const {readPng,writePng}=require('../../packages/slideclone-core/png');
const {fingerprint}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {withSourceMeasuredOutlineScope:scope,registerSourceMeasuredOutlineStyle:register,captureSourceOutlineAppearance:capture}=require('../../packages/slideclone-core/scene-plan/source-measured-outline-compatibility');
const {measureOutlinedSceneContainer:measure}=require('../../packages/slideclone-core/scene-plan/source-scene-outline');
const {measureSourceOutlinePaint:paint}=require('../../packages/slideclone-core/scene-plan/source-outline-paint');
const {applySourceOutlinePaint:apply}=require('../../packages/slideclone-core/scene-plan/source-outline-paint-shapes');
const {traceNativeMaskContours:trace}=require('../../packages/slideclone-core/scene-plan/native-mask-contours');
function fixture(t,{exhaustFamily=false}={}){
 const f=cardFixture(t),image=readPng(f.context.sourceFile),box={x:380,y:1047,w:70,h:60};
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
  const edge=Math.min(x-box.x,box.x+box.w-1-x,y-box.y,box.y+box.h-1-y);if(edge>3)continue;
  image.rgba.set([...(edge===1?[100,140,155]:edge===2?[20,70,90]:[180,210,220]),255],(y*image.width+x)*4);
 }
 writePng(f.context.sourceFile,image);f.card.source.sha256=f.hashFile(f.context.sourceFile);
 f.review.source.sha256=f.card.source.sha256;for(const fit of f.review.fits)fit.source.sha256=f.card.source.sha256;
 const result=scope(image,f.card.source.sha256,()=>{
  const outline=measure(image,box,[],{used:0});assert.ok(outline?.paint?.disjoint);
  const original=f.members[2],sx=f.deck.slideSize.widthPt/image.width,sy=f.deck.slideSize.heightPt/image.height;
  const shape={...original,box:{x:outline.box.x*sx,y:outline.box.y*sy,w:outline.box.w*sx,h:outline.box.h*sy},
   style:{fill:outline.color,stroke:'none',freeformSegments:outline.segments}};
  const current=apply([shape],new Map([[shape.id,outline.paint]])).shapes;
  const points=outline.sourcePixels.map(n=>({x:n%image.width,y:Math.floor(n/image.width)}));
  const colors=new Map(points.map(p=>[p.y*image.width+p.x,[...image.rgba.slice((p.y*image.width+p.x)*4,(p.y*image.width+p.x)*4+3)]]));
  if(exhaustFamily){
   const work={checks:0,exhausted:false};assert.ok(trace(points,outline.box,{tolerancePx:1.5,workState:work}));
   const remaining={checks:4000000-work.checks,exhausted:false};
   capture(image,outline,remaining,{points,colors,width:image.width});assert.equal(remaining.checks,4000000);
  }
  assert.equal(register(outline,current[0],current),true);
  const legacyPaint=paint({points,colors,width:image.width},{checks:0,exhausted:false});assert.ok(legacyPaint);
  const legacy=apply([{...shape,style:{...shape.style,freeformSegments:trace(points,outline.box,{tolerancePx:1.5})}}],new Map([[shape.id,legacyPaint]])).shapes;
  assert.equal(legacy.length,2);assert.ok(current.length>2);
  return {current,legacy};
 });
 f.page.shapes=f.page.shapes.flatMap(s=>s.id===f.members[2].id?result.current:s.id===f.members[3].id?[]:[s]);
 for(const old of result.legacy)f.card.members.find(m=>m.id===old.id).fingerprint=fingerprint(old);
 return {...f,...result};
}
module.exports={fixture};
