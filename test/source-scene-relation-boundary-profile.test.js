'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paintPrimitive}=require('./helpers/scene-primitive-program-fixture.cjs');
const {parsePrimitiveCandidate}=require('../packages/slideclone-core/scene-plan/source-scene-primitive-candidate');
const {compileScenePrimitiveProgram}=require('../packages/slideclone-core/scene-plan/source-scene-primitive-program');
const {measureSceneRelationDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-relation');
function fixture(){
 const image={width:300,height:160,rgba:Buffer.alloc(300*160*4,255)},budget={used:0},nodes=[];
 for(const x of [20,170])paintPrimitive(image,parsePrimitiveCandidate({id:'source-'+x,kind:'cylinder',capRatio:.2,
  box:{x,y:20,w:50,h:40},fill:'#D2E6F5',stroke:'#0F0F0F',strokeWidthPx:2}));
 const put=(x,y)=>image.rgba.set([30,60,90,255],(y*image.width+x)*4);
 for(let x=70;x<=168;x++)for(let dy=-1;dy<=1;dy++)put(x,40+dy);
 for(let x=163;x<=168;x++)for(let dy=-(168-x);dy<=168-x;dy++)put(x,40+dy);
 for(const [index,x]of [20,170].entries()){
  const r=compileScenePrimitiveProgram({image,object:{id:'object-'+index,regionId:'region-root',kind:'container',box:{x,y:20,w:50,h:40},
   nativeGeometry:{kind:'cylinder',capRatio:.2}},textMasks:[],budget,slideSize:{widthPt:300,heightPt:160}});
  assert.equal(r.failure,null,JSON.stringify(r));nodes.push({id:'node-'+index,box:r.measurement.box,portFrame:r.portFrame});
 }
 return {image,from:nodes[0],to:nodes[1],direction:'forward',textMasks:[],budget,shaftBox:{x:70,y:34,w:99,h:13}};
}
test('actual multi-face stroke fringe no longer turns the source corridor into foreground',()=>{
 const f=fixture(),r=measureSceneRelationDetailed(f);assert.equal(r.reason,null,JSON.stringify(r));assert.ok(r.fit.support>=.9);
 assert.equal(r.fit.color,'#1E3C5A');assert.equal(r.fit.widthPx,3);assert.equal(r.fit.startSide,'right');assert.equal(r.fit.endSide,'left');
 assert.ok(f.budget.used<=4000000);
});
test('source perimeter exclusions require exact private source and owner geometry',()=>{
 for(const mutate of [f=>f.from.portFrame=f.to.portFrame={},f=>f.image={...f.image,rgba:Buffer.from(f.image.rgba)},
  f=>{f.from.box={...f.from.box,w:f.from.box.w+1};f.to.box={...f.to.box,w:f.to.box.w+1};}]){
  const f=fixture();mutate(f);assert.equal(measureSceneRelationDetailed(f).fit,null);
 }
});
test('endpoint boundary paint cannot supply missing shaft, head, direction or OCR ownership',()=>{
 for(const mutate of [f=>f.direction='both',f=>f.direction='backward',f=>f.textMasks=[{x:92,y:39,w:10,h:3}],
  f=>{for(let y=28;y<=52;y++)f.image.rgba.set([255,255,255,255],(y*f.image.width+110)*4);},
  f=>{for(let x=163;x<=168;x++)for(let y=34;y<=46;y++)if(y<39||y>41)f.image.rgba.set([255,255,255,255],(y*f.image.width+x)*4);}]){
  const f=fixture();mutate(f);assert.equal(measureSceneRelationDetailed(f).fit,null);
 }
 const f=fixture();f.budget.used=4000000;assert.throws(()=>measureSceneRelationDetailed(f),/pixel budget/u);
});
