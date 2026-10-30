'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {filledArrowFixture,axisFilledArrowFixture}=require('./helpers/scene-filled-arrow.cjs');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {auditNativeComponentQuality:audit}=require('../packages/slideclone-core/quality/native-component-quality');
const relation={id:'relation-filled',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'};
function compiled(){const f=filledArrowFixture(),result=measure(f);assert.ok(result.fit,result.reason);assert.ok(result.fit.sourcePath,'thick body needs a complete measured source contour');
 const request={fit:result.fit,relation,fromId:'a',toId:'b',width:256,height:256,slideSize:{widthPt:256,heightPt:256}};
 const shape=compile(request),nodes=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5'},source:{}}));return {f,result,request,shape,nodes};}
test('a thick source arrow retains its original evidence and becomes one standard native Office connector',()=>{
 const {f,result,shape,nodes,request}=compiled();assert.equal(shape.type,'line');assert.equal(shape.style.nativePathConnector,undefined);
 assert.equal(shape.style.startArrow,undefined);assert.equal(shape.style.endArrow,'triangle');assert.ok(shape.style.strokeWidthPt>5);
 assert.equal(shape.style.endArrowWidth,'large');assert.equal(shape.source.sourceArrowGeometry,'filled-source-contour');
 assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(measuredSceneVisibleGapPaint(f.image,shape),f.oracle);
 const report=audit({pages:[{shapes:[...nodes,shape],images:[]}]});assert.equal(report.passed,true,JSON.stringify(report.findings));assert.equal(report.metrics.connectors,1);
 assert.throws(()=>compile({...request,fit:structuredClone(result.fit)}),/proof/);
 assert.throws(()=>{result.fit.sourcePath.segments[0].points[0].x=.5;},TypeError);
 assert.throws(()=>compile({...request,fromId:'another'}),/proof/);
 shape.style.stroke='#010203';assert.equal(measuredSceneVisibleGapPaint(f.image,shape),null);
});
test('missing shaft, foreign frames, obstacles, branches, incorrect heads and exhausted budgets remain rejected',()=>{
 for(const mode of ['blank','break','branch','node','text','foreign','head','undirected','budget']){
  const f=filledArrowFixture();
  if(mode==='blank')for(const n of f.oracle)f.put(n%256,Math.floor(n/256),[255,255,255]);
  if(mode==='break')for(let y=90;y<160;y++)f.put(120,y,[255,255,255]);
  if(mode==='branch')for(let y=105;y<140;y++)for(let x=122;x<127;x++)f.put(x,y);
  if(mode==='node')f.otherNodes=[{x:110,y:110,w:20,h:20}];
  if(mode==='text')f.textMasks=[{x:110,y:110,w:20,h:20}];
  if(mode==='foreign')f.from.portFrame={};
  if(mode==='head')f.direction='backward';
  if(mode==='undirected')f.direction='undirected';
  if(mode==='budget')f.budget.used=4000000;
  assert.equal(measure(f).fit,null,mode);assert.ok(f.budget.used<=4000000);
 }
});
test('filled-source connectors remain subject to the existing native arrow quality checks',()=>{
 const {shape,nodes}=compiled();
 for(const change of [s=>{s.style.strokeWidthPt=0;},s=>{s.style.lineCap='butt';},s=>{delete s.style.endArrowWidth;},s=>{delete s.style.endArrowLength;},s=>{s.type='triangle';}]){
  const s=structuredClone(shape);change(s);const report=audit({pages:[{shapes:[...nodes,s],images:[]}]});assert.equal(report.passed,false);
 }
});
test('filled path tests are part of unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-filled-arrow.test.js'));
});

test('complete axis-aligned filled arrows preserve all source cells and real anchors in both axes and directions',()=>{
 for(const vertical of [false,true])for(const reverse of [false,true])for(const both of [false,true]){
  const f=axisFilledArrowFixture({vertical,reverse,both}),before=Buffer.from(f.image.rgba),result=measure({...f,sourceInk:true});
  assert.ok(result.fit,JSON.stringify({vertical,reverse,both,reason:result.reason}));assert.ok(result.fit.sourcePath);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
  const shape=compile({fit:result.fit,relation:{...relation,direction:f.direction},fromId:f.from.id,toId:f.to.id,width:256,height:256,slideSize:{widthPt:256,heightPt:256}});
  assert.equal(shape.style.startAnchor.elementId,f.from.id);assert.equal(shape.style.endAnchor.elementId,f.to.id);
  assert.equal(shape.source.sourceArrowGeometry,'filled-source-contour');assert.ok(f.budget.used<=4000000);
 }
});

test('axis-aligned filled arrows retain complete-body, terminal, obstacle and budget rejection gates',()=>{
 for(const vertical of [false,true])for(const mode of ['blank','break','branch','node','text','foreign','head','undirected','alpha','budget']){
  const f=axisFilledArrowFixture({vertical}),put=(a,c,color)=>f.put(vertical?c:a,vertical?a:c,color);
  if(mode==='blank')for(const n of f.oracle)f.put(n%256,Math.floor(n/256),[255,255,255]);
  if(mode==='break')for(let c=100;c<156;c++)put(120,c,[255,255,255]);
  if(mode==='branch')for(let a=120;a<125;a++)for(let c=100;c<128;c++)put(a,c);
  if(mode==='node')f.otherNodes=[{x:116,y:116,w:24,h:24}];
  if(mode==='text')f.textMasks=[{x:116,y:116,w:24,h:24}];
  if(mode==='foreign')f.from.portFrame={};
  if(mode==='head')f.direction='backward';
  if(mode==='undirected')f.direction='undirected';
  if(mode==='alpha')f.image.rgba[(128*256+128)*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  assert.equal(measure({...f,sourceInk:true}).fit,null,JSON.stringify({vertical,mode}));assert.ok(f.budget.used<=4000000);
 }
});

test('a complete rounded source cap retains its contour without being mistaken for an arrowhead',()=>{
 for(const vertical of [false,true])for(const reverse of [false,true]){
  const f=axisFilledArrowFixture({vertical,reverse,roundCap:true}),result=measure({...f,sourceInk:true});
  assert.ok(result.fit,JSON.stringify({vertical,reverse,reason:result.reason}));assert.ok(result.fit.sourcePath);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);
  const wrong=axisFilledArrowFixture({vertical,roundCap:true});
  assert.equal(measure({...wrong,sourceInk:true,direction:'both'}).fit,null);
 }
});

test('short oblique double-arrow bodies use source-normal slices despite overlapping head projections',()=>{
 for(const sourceInk of [true]){
  const f=filledArrowFixture({both:true}),before=Buffer.from(f.image.rgba),result=measure({...f,sourceInk});
  assert.ok(result.fit,result.reason);assert.ok(result.fit.sourcePath);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
 }
 for(const mode of ['break','branch','head','text','foreign','budget']){
  const f=filledArrowFixture({both:true});
  if(mode==='break')for(let y=90;y<160;y++)f.put(120,y,[255,255,255]);
  if(mode==='branch')for(let y=105;y<140;y++)for(let x=122;x<127;x++)f.put(x,y);
  if(mode==='head')f.direction='forward';
  if(mode==='text')f.textMasks=[{x:110,y:110,w:20,h:20}];
  if(mode==='foreign')f.from.portFrame={};
  if(mode==='budget')f.budget.used=4000000;
  assert.equal(measure({...f,sourceInk:true}).fit,null,mode);
 }
});
