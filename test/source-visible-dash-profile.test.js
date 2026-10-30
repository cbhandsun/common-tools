"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {fixture}=require('./helpers/source-directed-dashes.cjs');


test('directed dashes keep a complete independently observed terminal and exact private source ink in either axis and direction',()=>{
 for(const vertical of [false,true])for(const reversed of [false,true]){
  const f=fixture(vertical),input=reversed?{...f,from:f.to,to:f.from,direction:'backward'}:f;
  const before=Buffer.from(f.image.rgba),result=measure(input);assert.ok(result.fit,result.reason);
  const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:input.direction};
  const shape=compile({fit:result.fit,relation,fromId:input.from.id,toId:input.to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
  assert.equal(shape.style[reversed?'startArrow':'endArrow'],'triangle');
  assert.equal(shape.style.startAnchor.elementId,input.from.id);assert.equal(shape.style.endAnchor.elementId,input.to.id);
  const ordered=[...f.dashes,[f.headLo,f.hi]];if(reversed)ordered.reverse();
  assert.deepEqual(JSON.parse(shape.style.strokeDashPattern),ordered.map(([lo,hi],i)=>{
   const next=ordered[i+1],gap=next?(reversed?lo-next[1]-1:next[0]-hi-1):1;
   return [(hi-lo+1)/3,gap/3];
  }),'the complete head/neck and its actual separation cannot disappear into a repeated shaft pattern');
  const cells=measuredSceneVisibleGapPaint(f.image,shape),oracle=new Set();
  for(let y=0;y<180;y++)for(let x=0;x<240;x++)if(f.image.rgba[(y*240+x)*4]===30)oracle.add(y*240+x);
  assert.deepEqual(cells,oracle);assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),oracle);
  assert.deepEqual(f.image.rgba,before);assert.equal(measuredSceneVisibleGapCells(f.image,structuredClone(result.fit)),null);
 }
});

test('directed dash proof cannot discard a short foreign component or absorb an unmeasured fragment into paint ownership',()=>{
 for(const vertical of [false,true])for(const length of [1,2])for(const end of [false,true]){
  const f=fixture(vertical),a=end?f.hi+3:f.dashes[0][1]+3;
  for(let step=0;step<length;step++)f.put(a+step,f.axis+5);
  const before=Buffer.from(f.image.rgba),result=measure(f);
  assert.equal(result.fit,null,`${vertical}/${length}/${end}: every observed component needs a complete common-axis proof`);
  assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 }
});

test('a complete two-column dash is measured and included rather than discarded solely for its length',()=>{
 const f=fixture(),along=f.dashes[0][1]+4;
 for(let a=along;a<along+2;a++)for(let c=f.axis-1;c<=f.axis+1;c++)f.put(a,c);
 const result=measure(f);assert.ok(result.fit,result.reason);
 const pattern=JSON.parse(result.fit.strokeDashPattern);
 assert.equal(pattern.length,f.dashes.length+2);assert.deepEqual(pattern[1],[2/3,5/3]);
 const cells=measuredSceneVisibleGapCells(f.image,result.fit);
 for(let a=along;a<along+2;a++)for(let c=f.axis-1;c<=f.axis+1;c++)assert.ok(cells.has(c*240+a));
});

test('production visible-gap recovery leaves an unsafe directed dash unresolved and emits no ink-owning relation',()=>{
 const {compileExistingSceneVisibleGaps:stage}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-stage');
 const f=fixture();f.put(f.dashes[0][1]+3,f.axis+5);
 const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:180,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:180}}],
  objects:[{id:'object-a',regionId:'region-root',kind:'container',box:f.from.box},{id:'object-b',regionId:'region-root',kind:'container',box:f.to.box}],relations:[relation]};
 const unresolved=[{id:relation.id,reason:'relation-source-evidence',detailCode:'shaft-support'}],before=structuredClone(plan);
 const result=stage({plan,image:f.image,nodes:new Map([['object-a',f.from],['object-b',f.to]]),shapes:[{id:'a'},{id:'b'}],
  textMasks:[],budget:f.budget,slideSize:{widthPt:240,heightPt:180},unresolved});
 assert.deepEqual(result.parts,[]);assert.equal(result.resolved.size,0);assert.deepEqual(result.repaired,[]);
 assert.deepEqual(result.unresolved,unresolved);assert.deepEqual(plan,before);
});

test('a detached rectangle, reverse arrow, foreign terminal paint or side branch cannot authorize a directed dash head',()=>{
 for(const vertical of [false,true])for(const kind of ['rectangle','paint','inconsistent-paint','reverse','branch']){
  const f=fixture(vertical);
  if(kind==='rectangle')f.head('rectangle');
  if(kind==='paint')f.head('triangle',[160,20,40]);
  if(kind==='inconsistent-paint')for(let a=f.headLo;a<=f.hi;a++){
   const radius=a>=f.hi-6?f.hi-a:1;
   for(let c=f.axis-radius;c<=f.axis+radius;c++)f.put(a,c,a%2?[10,40,70]:[60,90,120]);
  }
  if(kind==='reverse'){
   for(let a=f.headLo;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++)f.put(a,c,[255,255,255]);
   for(let a=f.headLo;a<=f.hi;a++)for(let c=f.axis-(a<=f.headLo+6?a-f.headLo:1);c<=f.axis+(a<=f.headLo+6?a-f.headLo:1);c++)f.put(a,c);
  }
  if(kind==='branch')for(let c=f.axis;c<=f.axis+6;c++)f.put(f.headLo+7,c);
  const before=Buffer.from(f.image.rgba),result=measure(f);
  assert.equal(result.fit,null,`${vertical}/${kind}`);assert.deepEqual(f.image.rgba,before);
 }
});

test('directed dash boundary still rejects blank, incomplete, transparent, obstructed and exhausted observations',()=>{
 for(const kind of ['blank','one-dash','head-gap','alpha','text','obstacle','budget']){
  const f=fixture();
  if(kind==='blank')for(let a=f.lo;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++)f.put(a,c,[255,255,255]);
  if(kind==='one-dash')for(const [lo,hi] of f.dashes.slice(1))for(let a=lo;a<=hi;a++)for(let c=f.axis-1;c<=f.axis+1;c++)f.put(a,c,[255,255,255]);
  if(kind==='head-gap')for(let c=f.axis-6;c<=f.axis+6;c++)f.put(f.hi-3,c,[255,255,255]);
  if(kind==='alpha')f.image.rgba[(f.axis*240+f.headLo)*4+3]=0;
  if(kind==='text')f.textMasks=[{x:90,y:55,w:5,h:10}];
  if(kind==='obstacle')f.otherNodes=[{x:90,y:55,w:5,h:10}];
  if(kind==='budget')f.budget.used=4000000;
  assert.equal(measure(f).fit,null,kind);assert.ok(f.budget.used<=4000000);
 }
});
