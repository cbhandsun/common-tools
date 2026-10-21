'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-bent-gap.cjs');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
test('complete source bend compiles to ONE editable native elbow attached to actual texts in all four quadrants',()=>{
 for(const flipX of [false,true])for(const flipY of [false,true]){
  const f=fixture(flipX,flipY),source=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
  assert.equal(result.fit.connectorType,'elbow-2');assert.equal(result.fit.physical,undefined);
  const output=compile({fit:result.fit,relation:f.relation,fromId:f.from.id,toId:f.to.id,width:260,height:220,slideSize:{widthPt:260,heightPt:220},fromTextEndpoint:f.from.portFrame,toTextEndpoint:f.to.portFrame});
  assert.equal(output.type,'line');assert.equal(output.style.connectorType,'elbow-2');
  assert.equal(output.style.startAnchor.elementId,'text-0');assert.equal(output.style.endAnchor.elementId,'text-1');
  assert.equal(output.source.sourcePhysicalAttachment,false);assert.equal(output.style.endArrow,'triangle');
  const oracle=new Set();for(let n=0;n<260*220;n++)if(f.image.rgba[n*4]===20)oracle.add(n);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),oracle);
  assert.deepEqual(measuredSceneVisibleGapPaint(f.image,output),oracle);assert.deepEqual(f.image.rgba,source);
  output.style.connectorType='line';assert.equal(measuredSceneVisibleGapPaint(f.image,output),null);
 }
});
test('bend rejects missing shaft, extra branches, holes, wrong direction, interrupted corridors and obstacles',()=>{
 for(const mode of ['gap','branch','hole','direction','start-corridor','end-corridor','obstacle','no-head','disconnected']){
  const f=fixture();
  if(mode==='gap')for(let y=148;y<=152;y++)f.put(120,y,[255,255,255]);
  if(mode==='branch')for(let y=130;y<150;y++)for(let x=119;x<=121;x++)f.put(x,y);
  if(mode==='hole')f.put(120,150,[255,255,255]);
  if(mode==='direction')f.direction='backward';
  if(mode==='start-corridor')f.put(70,150);
  if(mode==='end-corridor')f.put(180,60);
  if(mode==='obstacle')f.otherNodes.push({x:110,y:149,w:4,h:4});
  if(mode==='no-head')for(let y=70;y<=90;y++)for(let x=170;x<=190;x++)if(x<178||x>182)f.put(x,y,[255,255,255]);
  if(mode==='disconnected')f.put(100,135);
  assert.equal(measure(f).fit,null,mode);
 }
});
test('bend receipts reject forged endpoints, controls, source identity and native text mutations',()=>{
 const f=fixture(),result=measure(f);assert.ok(result.fit,result.reason);
 assert.equal(measure({...f,from:{...f.from,portFrame:{}}}).fit,null);
 const request={fit:result.fit,relation:f.relation,fromId:f.from.id,toId:f.to.id,width:260,height:220,slideSize:{widthPt:260,heightPt:220}};
 assert.throws(()=>compile({...request,fit:structuredClone(result.fit)}),/proof/);
 const relation=structuredClone(f.relation);relation.visiblePath.vertices[1].x++;
 assert.throws(()=>compile({...request,relation}),/proof/);
 assert.equal(measuredSceneVisibleGapCells({...f.image,rgba:Buffer.from(f.image.rgba)},result.fit),null);
 f.texts[0].text='changed';assert.equal(measure(f).fit,null);
});
test('bend public boundary rejects unsafe, empty and invalid controls and enforces source budget',()=>{
 const f=fixture();
 for(const input of [null,{},[],{...f,budget:{used:-1}},{...f,textMasks:null},{...f,visiblePath:{kind:'polyline',dash:'solid',vertices:[]}}])assert.throws(()=>measure(input),TypeError);
 let reads=0;const input={...f};Object.defineProperty(input,'shaftBox',{get(){reads++;throw Error('private');}});
 assert.throws(()=>measure(input),TypeError);assert.equal(reads,0);
 assert.equal(measure({...f,budget:{used:4000000}}).fit,null);
 const vertices=structuredClone(f.visiblePath.vertices);vertices[1].y++;
 assert.equal(measure({...f,visiblePath:{...f.visiblePath,vertices}}).fit,null);
});

test('complete concave source heads and terminal refinement retain strict bend identity and all source ink',()=>{
 const f=fixture();
 // Cut two EXTERIOR notches at the head base; do not fill their white pixels.
 for(let y=88;y<=90;y++)for(let x=174;x<=186;x++)if(x<178||x>182)f.put(x,y,[255,255,255]);
 const vertices=structuredClone(f.visiblePath.vertices);vertices[0].x+=2;vertices[2].y+=3;
 const result=measure({...f,visiblePath:{...f.visiblePath,vertices}});assert.ok(result.fit,result.reason);
 const cells=measuredSceneVisibleGapCells(f.image,result.fit);assert.equal(cells.has(89*260+176),false);
 const branch=fixture();for(let y=135;y<=149;y++)for(let x=175;x<=177;x++)branch.put(x,y);
 assert.equal(measure(branch).fit,null,'the compound union cannot discard corner-adjacent branches');
});

test('new bend unit and native export regressions belong to unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-visible-bent-gap.test.js'));
 assert.ok(discoverTestFiles(process.cwd(),'contract').some(f=>f.file.replaceAll('\\','/')==='test/openxml-source-bent-gap-contract.test.js'));
});
