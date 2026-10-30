'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {coveredFixture}=require('./helpers/source-directed-dashes.cjs');
const {measureSourceSceneVisibleGap:measure}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint,measuredSceneVisibleGapReplacementScope}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {replaceMeasuredSceneConnectors:replace}=require('../packages/slideclone-core/scene-plan/source-scene-replaced-connectors');
function setup(vertical=false,reversed=false){
 const f=coveredFixture(vertical),input=reversed?{...f,from:f.to,to:f.from,direction:'backward'}:f;
 const result=measure(input);assert.ok(result.fit,result.reason);
 const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:input.direction};
 const line=compile({fit:result.fit,relation,fromId:input.from.id,toId:input.to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
 const old=(id,first,last,across=f.axis)=>({id,type:'line',box:vertical?{x:across,y:first,w:0,h:last-first}:{x:first,y:across,w:last-first,h:0},
  style:{stroke:'#334455',strokeWidthPt:4,connectorType:'straight'},source:{nativeRebuild:true,detector:'visual-atom-native-connector',layerSourceId:'crop',atomKind:'grid-line-candidate'}});
 const prior=old('old',f.lo-15,f.hi+15);
 return {...f,line,old,prior,previous:[prior],shapes:[prior,line],protectedMembers:new Set(),slideSize:{widthPt:240,heightPt:180}};
}
test('complete private dashed observation retires only overlapping legacy paint and preserves both external fragments',()=>{
 for(const vertical of [false,true])for(const reversed of [false,true]){
  const f=setup(vertical,reversed),before=structuredClone(f.prior),pixels=Buffer.from(f.image.rgba),paint=measuredSceneVisibleGapPaint(f.image,f.line);
  const result=replace(f),parts=f.shapes.filter(s=>s!==f.line);
  assert.equal(result.clipped.length,1);assert.equal(parts.length,2);assert.deepEqual(f.prior,before);
  assert.equal(parts[0].id,'old');assert.equal(parts[1].id,'old-retained-2');
  const box1=parts[0].box,box2=parts[1].box;
  assert.equal(vertical?box1.y:box1.x,f.lo-15);assert.equal(vertical?box1.h:box1.w,14.5);
  assert.equal(vertical?box2.y:box2.x,f.hi+.5);assert.equal(vertical?box2.h:box2.w,14.5);
  for(const part of parts){assert.deepEqual(part.style,f.prior.style);assert.deepEqual(part.source,f.prior.source);}
  assert.deepEqual(measuredSceneVisibleGapPaint(f.image,f.line),paint);assert.deepEqual(f.image.rgba,pixels);
  const blank=f.vertical?61*240+f.axis:f.axis*240+90;assert.equal(paint.has(blank),false,'empty dash intervals gain no paint rights');
 }
});
test('a wholly overlapping approximation is removed while a one-sided predecessor retains its exact outside geometry',()=>{
 for(const mode of ['whole','head','tail','reverse']){
  const f=setup(),p=mode==='whole'?f.old('old',100,125):mode==='head'?f.old('old',f.lo-15,125):mode==='tail'?f.old('old',100,f.hi+15):f.old('old',f.hi+15,f.lo-15);
  f.previous=[p];f.shapes=[p,f.line];const result=replace(f),parts=f.shapes.filter(s=>s!==f.line);
  assert.equal(parts.length,mode==='whole'?0:mode==='reverse'?2:1,mode);
  assert.equal(result.clipped.length,1,mode);
  if(mode==='head')assert.deepEqual(parts[0].box,{x:f.lo-15,y:f.axis,w:14.5,h:0});
  if(mode==='tail')assert.deepEqual(parts[0].box,{x:f.hi+.5,y:f.axis,w:14.5,h:0});
  if(mode==='reverse'){assert.ok(parts.every(s=>s.box.w<0));assert.equal(parts[0].box.x,f.hi+15);assert.equal(parts[1].box.x,f.lo-.5);}
 }
});
test('crossings, semantic identities, bindings, wide strokes, transforms and protected fragments survive',()=>{
 for(const mode of ['crossing','semantic','from','to','visual','anchor','arrow','referenced','protected','wide','rotate','dash','cap','outside','collision']){
  const f=setup(),p=f.prior;
  if(mode==='crossing')p.box={x:100,y:f.axis-10,w:0,h:20};
  if(mode==='semantic')p.source.semanticNativeStructure=true;
  if(mode==='from')p.source.fromAtomId='other';if(mode==='to')p.source.toAtomId='other';if(mode==='visual')p.source.visualConnectorId='connection';
  if(mode==='anchor')p.style.startAnchor={elementId:'node'};if(mode==='arrow')p.style.endArrow='triangle';
  if(mode==='referenced')f.line.style.startAnchor.elementId=p.id;if(mode==='protected')f.protectedMembers.add(p);
  if(mode==='wide')p.style.strokeWidthPt=30;if(mode==='rotate')p.style.rotation=90;
  if(mode==='dash')p.style.strokeDashPattern='[[1,1]]';if(mode==='cap')p.style.lineCap='round';
  if(mode==='outside')p.box.y+=20;if(mode==='collision')f.shapes.push(f.old('old-retained-2',20,30));
  const before=structuredClone(p);replace(f);assert.ok(f.shapes.includes(p),mode);assert.deepEqual(p,before);
 }
});
test('copied or changed receipts, different source pixels and exhausted replacement work cannot authorize clipping',()=>{
 for(const mode of ['copy','changed','pixels']){
  const f=setup();if(mode==='copy')f.shapes[1]=structuredClone(f.line);if(mode==='changed')f.line.source.sceneRelationId='other';
  if(mode==='pixels')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  replace(f);assert.ok(f.shapes.includes(f.prior),mode);
 }
 const f=setup(),work={checks:4000000};
 assert.deepEqual(require('../packages/slideclone-core/scene-plan/source-scene-dash-retirement').retireMeasuredSceneDashApproximations(f,new Set(),work),[]);
 assert.ok(f.shapes.includes(f.prior));assert.ok(work.checks>4000000);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-dash-retirement.test.js'));
});
test('retirement cannot use excluded foreign pixels, serialized scope metadata or mutable scope snapshots',()=>{
 const f=coveredFixture();f.put(110,f.axis,[210,230,245]);
 const result=measure(f);assert.ok(result.fit,result.reason);
 const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'};
 const line=compile({fit:result.fit,relation,fromId:f.from.id,toId:f.to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
 const scope=measuredSceneVisibleGapReplacementScope(f.image,line),foreign=f.axis*240+110;
 assert.ok(scope);assert.equal(scope.cells.has(foreign),false);
 const base=setup(),prior=base.old('old',f.lo-15,f.hi+15);
 scope.cells.add(foreign); // A detached returned set cannot change the private receipt.
 const shapes=[prior,line];replace({...f,shapes,previous:[prior],protectedMembers:new Set(),slideSize:base.slideSize});
 assert.ok(shapes.includes(prior));assert.equal(measuredSceneVisibleGapReplacementScope(f.image,line).cells.has(foreign),false);
 const clone=structuredClone(line);clone.source.retirement={horizontal:true,cells:[foreign]};
 assert.equal(measuredSceneVisibleGapReplacementScope(f.image,clone),null);
});
test('extreme and unsupported legacy geometry fails closed without emitting invalid or colliding fragments',()=>{
 for(const mode of ['huge','negative','nan','zero','diagonal','empty-style','none','wrong-detector','tiny']){
  const f=setup(),p=f.prior;
  if(mode==='huge')p.box.x=1e100;if(mode==='negative')p.box.x=-1;if(mode==='nan')p.box.w=NaN;
  if(mode==='zero')p.box.w=0;if(mode==='diagonal')p.box.h=1;if(mode==='empty-style')p.style={};
  if(mode==='none')p.style.stroke='none';if(mode==='wrong-detector')p.source.detector='provider-claim';
  if(mode==='tiny')p.box.w=.5;
  if(mode==='nan')assert.throws(()=>replace(f),TypeError);else replace(f);
  assert.ok(f.shapes.includes(p),mode);
 }
});
test('duplicate new outputs and a full object budget cannot grant or materialize extra fragments',()=>{
 for(const kind of ['identity','id','capacity']){
  const f=setup();
  if(kind==='identity')f.shapes.push(f.line);
  if(kind==='id')f.shapes.push(structuredClone(f.line));
  if(kind==='capacity')for(let n=2;n<10000;n++)f.shapes.push({id:'extra-'+n,type:'rect',box:{x:0,y:0,w:1,h:1}});
  const length=f.shapes.length;replace(f);assert.ok(f.shapes.includes(f.prior),kind);assert.equal(f.shapes.length,length);
 }
});
