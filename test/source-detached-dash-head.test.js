'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sourceVisibleDashProfile:profile}=require('../packages/slideclone-core/routing/source-visible-dash-profile');
const {readPng}=require('../packages/slideclone-core/png');
function real(){return {...JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-directed-dash-unsupported.json'),'utf8')),
 rgba:readPng(path.join(__dirname,'fixtures/source-directed-dash-unsupported.png')).rgba,work:{checks:0}};}

test('complete detached source triangle uses independently measured dashes and covered spatial paint without filling gaps',()=>{
 const input=real(),before=Buffer.from(input.rgba),components=structuredClone(input.components),fit=profile(input);
 assert.ok(fit,'the complete small terminal needs a separate geometry and paint proof');
 assert.equal(fit.axis,11.5);assert.equal(fit.widthPx,2);assert.equal(fit.lo,9);assert.equal(fit.hi,154);
 assert.equal(JSON.parse(fit.strokeDashPattern).length,16);assert.ok(fit.spatial);assert.equal(fit.spatial.axis,'y');
 assert.ok(fit.spatial.stops.length<=6);assert.deepEqual(input.rgba,before);assert.deepEqual(input.components,components);
 assert.ok(input.work.checks>0&&input.work.checks<=4000000);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});

test('detached source proof rejects foreign paint, reverse direction, holes, side branches, misplaced fragments and exhausted budgets',()=>{
 for(const kind of ['foreign-paint','reverse','hole','branch','off-axis','fragment','budget']){
  const input=real(),head=input.components.at(-1);
  if(kind==='foreign-paint')for(const n of head.cells)input.rgba.set([180,10,100,255],n*4);
  if(kind==='reverse')input.direction='backward';
  if(kind==='hole')head.cells=head.cells.filter(n=>n!==151*25+12);
  if(kind==='branch'){head.cells.push(151*25+15,151*25+16);}
  if(kind==='off-axis')head.cells=head.cells.map(n=>n+5);
  if(kind==='fragment')input.components.splice(1,0,{cells:[15*25+18],boundary:false});
  if(kind==='budget')input.work.checks=4000000;
  assert.equal(profile(input),null,kind);
 }
});

test('detached spatial paint and exact private source ownership survive both axes, physical reversals and logical endpoint swaps',()=>{
 const {fixture}=require('./helpers/source-detached-dashes.cjs');
 const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
 const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
 for(const horizontal of [false,true])for(const mirrored of [false,true])for(const reversed of [false,true]){
  const f=fixture(horizontal,mirrored,reversed),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
  const fit=result.fit,relation={id:'relation-detached',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:f.direction};
  const request={fit,relation,fromId:f.from.id,toId:f.to.id,width:300,height:300,slideSize:{widthPt:300,heightPt:300}};
  const output=compile(request),gradient=output.style.strokeGradient;
  assert.ok(gradient);assert.equal(gradient.angleDeg,horizontal?(reversed?180:0):(reversed?270:90));
  assert.equal(output.style.startAnchor.elementId,f.from.id);assert.equal(output.style.endAnchor.elementId,f.to.id);
  assert.equal(output.style[f.direction==='forward'?'endArrow':'startArrow'],'triangle');
  assert.equal(JSON.parse(output.style.strokeDashPattern).length,16);assert.equal(output.source.sourcePhysicalAttachment,false);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,fit),f.sourcePixels);assert.deepEqual(measuredSceneVisibleGapPaint(f.image,output),f.sourcePixels);
  assert.ok(Object.isFrozen(fit.strokeGradient)&&Object.isFrozen(fit.strokeGradient.stops)&&fit.strokeGradient.stops.every(Object.isFrozen));
  assert.throws(()=>compile({...request,fit:structuredClone(fit)}),/proof is invalid/u);
  assert.equal(measuredSceneVisibleGapPaint(f.image,structuredClone(output)),null);
  for(const change of [s=>{s.style.strokeGradient.stops=structuredClone(s.style.strokeGradient.stops);s.style.strokeGradient.stops[0].color='#000000';},s=>{s.style.strokeGradient.angleDeg=37;},
   s=>{s.style.strokeDashPattern='[[1,1]]';},s=>{s.style.startAnchor.elementId='other';},s=>{s.source.sceneRelationId='other';}]){
   const changed=compile(request);change(changed);assert.equal(measuredSceneVisibleGapPaint(f.image,changed),null);
  }
  assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 }
});

test('spatial stops revalidate every original component and row independently instead of relying on an aggregate score',()=>{
 const input=real(),fit=profile(input);assert.ok(fit?.spatial);const spatial=fit.spatial;
 const {sourceRoutePaintColor}=require('../packages/slideclone-core/routing/source-route-paint-fit');
 const {sourceVisibleGapBackdrops}=require('../packages/slideclone-core/routing/source-visible-gap-profile');
 const supports=[];
 for(const group of input.components){
  const along=[...new Set(group.cells.map(n=>Math.floor(n/25)))].sort((a,b)=>a-b);
  const backgrounds=sourceVisibleGapBackdrops({...input,along});let total=0,matching=0,represented=0;
  for(const [i,a] of along.entries()){
   const paint=sourceRoutePaintColor(spatial.stops,(a-spatial.origin)/spatial.span),bg=backgrounds[i],delta=bg.map((v,k)=>v-paint[k]),norm=delta.reduce((n,v)=>n+v*v,0);
   let row=0;
   for(const n of group.cells.filter(n=>Math.floor(n/25)===a)){
    const p=Array.from(input.rgba.subarray(n*4,n*4+3)),alpha=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-paint[k])*delta[k],0)/norm));total++;
    if(p.every((v,k)=>Math.abs(v-(paint[k]+alpha*delta[k]))<=18)){matching++;row++;}
   }
   if(row)represented++;
  }
  assert.ok(matching/total>=.9);assert.ok(represented/along.length>=.9);supports.push(matching/total);
 }
 assert.equal(spatial.support,Math.min(...supports));
});

test('covered detached paint requires two ordinary witnesses for each section, preserves uniform paint and rejects unsupported small components',()=>{
 for(const kind of ['uniform','one-blue-witness','foreign-small-dash','foreign-head-row','one-edge','alpha','blank']){
  const input=real();
  if(kind==='uniform')for(const component of input.components)for(const n of component.cells)input.rgba.set([30,60,90,255],n*4);
  if(kind==='one-blue-witness')for(const n of input.components[14].cells)input.rgba.set([110,140,128,255],n*4);
  if(kind==='foreign-small-dash')for(const n of input.components[14].cells)input.rgba.set([180,10,100,255],n*4);
  if(kind==='foreign-head-row')for(const n of input.components.at(-1).cells.filter(n=>Math.floor(n/25)===151))input.rgba.set([180,10,100,255],n*4);
  if(kind==='one-edge')for(let a=0;a<172;a++)input.rgba.set([20,220,200,255],a*25*4);
  if(kind==='alpha')input.rgba[input.components.at(-1).cells[0]*4+3]=0;
  if(kind==='blank')input.components=[];
  const before=Buffer.from(input.rgba),fit=profile(input);
  if(kind==='uniform'){assert.ok(fit);assert.equal(fit.color.toUpperCase(),'#1E3C5A');assert.equal(fit.spatial,undefined);}
  else if(kind==='one-edge'){
   const {sourceVisibleGapBackdrops}=require('../packages/slideclone-core/routing/source-visible-gap-profile');
   const backdrops=sourceVisibleGapBackdrops({...input,along:[149,150,151]});assert.deepEqual(backdrops,Array(3).fill(input.background));
  }else assert.equal(fit,null,kind);
  assert.deepEqual(input.rgba,before);
 }
});

test('internal detached geometry and paint observers fail closed for invalid geometry, size and shared work ledgers',()=>{
 const {sourceDetachedDashHead:geometry}=require('../packages/slideclone-core/routing/source-detached-dash-head');
 const {sourceDashSpatialPaint:paint}=require('../packages/slideclone-core/routing/source-dash-spatial-paint');
 const input=real(),head=input.components.at(-1),runs=input.components.slice(0,-1).map(c=>({lo:Math.min(...c.cells.map(n=>Math.floor(n/25))),hi:Math.max(...c.cells.map(n=>Math.floor(n/25)))}));
 const request={...input,cells:head.cells,axis:11.5,widthPx:2,runs},fit=geometry(request);assert.ok(fit);
 for(const change of [{cells:[]},{cells:[-1]},{cells:[NaN]},{cells:[...head.cells,head.cells[0]]},{width:0},{width:1.5},{widthPx:6},{axis:Infinity},{runs:[]},{cells:Array(301).fill(1)}])assert.equal(geometry({...request,...change,work:{checks:0}}),null);
 for(const checks of [-1,NaN,Infinity,3999999,4000000,4000001]){
  assert.equal(geometry({...request,work:{checks}}),null);
  assert.equal(paint({...input,components:input.components.slice(0,-1),head:fit,work:{checks}}),null);
 }
 for(const change of [{components:[]},{components:input.components.slice(0,1)},{components:Array(24).fill(input.components[0])},{width:0},{width:NaN},{background:[NaN,1,2]},
  {components:[{cells:[-1]},...input.components.slice(1,-1)]},{components:[{cells:Array(40000).fill(1)},...input.components.slice(1,-1)]}]){
  assert.equal(paint({...input,components:input.components.slice(0,-1),head:fit,...change,work:{checks:0}}),null);
 }
});
