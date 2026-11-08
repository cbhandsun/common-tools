'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sourceVisibleDashProfile:profile}=require('../packages/slideclone-core/routing/source-visible-dash-profile');
const {coveredFixture}=require('./helpers/source-directed-dashes.cjs');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');

test('complete source JPEG dashes share observed shaft paint while every component and terminal retains independent coverage',()=>{
 const {readPng}=require('../packages/slideclone-core/png');
 const image=readPng(path.join(__dirname,'fixtures/source-directed-dash-jpeg.png'));
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-directed-dash-jpeg.json'),'utf8'));
 const before=Buffer.from(image.rgba),mask=structuredClone(input.components);
 const result=profile({...input,rgba:image.rgba,work:{checks:0}});
 assert.ok(result);assert.equal(result.lo,5);assert.equal(result.hi,128);assert.equal(result.widthPx,2);
 assert.equal(JSON.parse(result.strokeDashPattern).length,7);
 assert.deepEqual(image.rgba,before);assert.deepEqual(input.components,mask);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});

test('real green-blue dashes require a complete independent detached-head and spatial paint proof',()=>{
 const {readPng}=require('../packages/slideclone-core/png');
 const image=readPng(path.join(__dirname,'fixtures/source-directed-dash-unsupported.png'));
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-directed-dash-unsupported.json'),'utf8'));
 const work={checks:0},before=Buffer.from(image.rgba);
 const result=profile({...input,rgba:image.rgba,work});assert.ok(result);assert.ok(result.spatial);
 assert.equal(result.spatial.support,28/30);assert.ok(work.checks<=4000000);assert.deepEqual(image.rgba,before);
});

test('complete JPEG coverage observes the original shared budget and cannot authorize missing body geometry or excessive components',()=>{
 const {readPng}=require('../packages/slideclone-core/png');
 const {sourceVisibleGapGeometry}=require('../packages/slideclone-core/routing/source-visible-gap-profile');
 const {sourceDashCoveragePaint:paint}=require('../packages/slideclone-core/routing/source-dash-coverage-paint');
 const image=readPng(path.join(__dirname,'fixtures/source-directed-dash-jpeg.png'));
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-directed-dash-jpeg.json'),'utf8'));
 const head=sourceVisibleGapGeometry({...input,cells:input.components.at(-1).cells,rgba:image.rgba,work:{checks:0}});assert.ok(head.complete);
 const request={...input,components:input.components.slice(0,-1),head,rgba:image.rgba,work:{checks:0}};
 for(const checks of [3999999,4000000]){
  const work={checks};assert.equal(paint({...request,work}),null);assert.ok(work.checks>=checks);
 }
 for(const checks of [NaN,Infinity,-1,4000001])assert.throws(()=>paint({...request,work:{checks}}),TypeError);
 for(const components of [[],request.components.slice(0,1),Array(24).fill(request.components[0])])assert.equal(paint({...request,components}),null);
 assert.equal(paint({...request,head:{...head,complete:null}}),null);
});

test('a covered terminal cannot nominate a new background from one edge, disagreeing edges or transparent backdrop pixels',()=>{
 const {readPng}=require('../packages/slideclone-core/png');
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-directed-dash-jpeg.json'),'utf8'));
 for(const kind of ['one-edge','both-edges','alpha']){
  const image=readPng(path.join(__dirname,'fixtures/source-directed-dash-jpeg.png'));
  for(let a=0;a<image.height;a++){
   const first=a*image.width*4,last=(a*image.width+image.width-1)*4;
   if(kind==='alpha'){image.rgba[first+3]=0;image.rgba[last+3]=0;}
   else{image.rgba.set([20,220,200,255],first);if(kind==='both-edges')image.rgba.set([220,20,200,255],last);}
  }
  assert.equal(profile({...input,rgba:image.rgba,work:{checks:0}}),null,kind);
 }
});

test('alpha covered terminal uses unchanged complete geometry, exact source paint cells and real anchors in both axes and directions',()=>{
 for(const vertical of [false,true])for(const reversed of [false,true]){
  const f=coveredFixture(vertical),input=reversed?{...f,from:f.to,to:f.from,direction:'backward'}:f;
  const before=Buffer.from(f.image.rgba),result=measure(input);assert.ok(result.fit,result.reason);
  const relation={id:'relation-covered-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:input.direction};
  const shape=compile({fit:result.fit,relation,fromId:input.from.id,toId:input.to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
  assert.equal(shape.style.stroke.toUpperCase(),'#1E3C5A');assert.equal(shape.style[reversed?'startArrow':'endArrow'],'triangle');
  assert.equal(JSON.parse(shape.style.strokeDashPattern).length,4);assert.equal(shape.style.startAnchor.elementId,input.from.id);
  assert.deepEqual(measuredSceneVisibleGapPaint(f.image,shape),measuredSceneVisibleGapCells(f.image,result.fit));
  const cells=measuredSceneVisibleGapCells(f.image,result.fit);assert.ok(cells.size>0);
  for(const n of cells)assert.ok(f.image.rgba[n*4]<210,'only actual complete observed stroke pixels receive ownership');
  shape.style.stroke='#FFFFFF';assert.equal(measuredSceneVisibleGapPaint(f.image,shape),null);
  assert.deepEqual(f.image.rgba,before);
 }
});

test('shared paint cannot hide an unsupported whole head, small foreign dash, missing body witness or budget failure',()=>{
 for(const kind of ['foreign-head','foreign-dash','inconsistent-head','no-witness','branch','budget']){
  const f=coveredFixture();
  if(kind==='foreign-head')f.head('triangle',[160,20,40]);
  if(kind==='foreign-dash')for(let a=110;a<=111;a++)for(let c=f.axis-1;c<=f.axis+1;c++)f.put(a,c,[160,20,40]);
  if(kind==='inconsistent-head')for(let a=f.headLo;a<=f.hi;a++){
   const radius=a>=f.hi-6?f.hi-a:1;
   for(let c=f.axis-radius;c<=f.axis+radius;c++)f.put(a,c,a%2?[10,40,70]:[60,90,120]);
  }
  if(kind==='no-witness')for(const [lo,hi] of f.dashes.slice(1))for(let a=lo;a<=hi;a++)for(let c=f.axis-1;c<=f.axis+1;c++)f.put(a,c,[180,195,210]);
  if(kind==='branch')for(let c=f.axis;c<=f.axis+8;c++)f.put(f.headLo+7,c);
  if(kind==='budget')f.budget.used=4000000;
  const before=Buffer.from(f.image.rgba);assert.equal(measure(f).fit,null,kind);assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 }
});
