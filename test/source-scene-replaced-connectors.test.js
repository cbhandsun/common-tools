'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-bent-gap.cjs');
const {measureSourceSceneVisibleGap}=require('../packages/slideclone-core/source-scene-visible-gap');
const {compileSourceSceneVisibleGap}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
const {replaceMeasuredSceneConnectors:replace}=require('../packages/slideclone-core/source-scene-replaced-connectors');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
function setup(flipX=false,flipY=false){
 const f=fixture(flipX,flipY),fit=measureSourceSceneVisibleGap(f).fit;assert.ok(fit);
 const line=compileSourceSceneVisibleGap({fit,relation:f.relation,fromId:f.from.id,toId:f.to.id,width:260,height:220,slideSize:{widthPt:260,heightPt:220},fromTextEndpoint:f.from.portFrame,toTextEndpoint:f.to.portFrame});
 const old=(id,a,b,style={})=>({id,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{stroke:'#1450DC',connectorType:'straight',...style},source:{nativeRebuild:true,semanticNativeStructure:true}});
 const [a,b,c]=[[80,150],[180,150],[180,70]].map(([x,y])=>f.point(x,y));
 const previous=[old('shaft',a,b),old('head',b,c,{endArrow:'triangle'})];
 return {...f,line,old,previous,shapes:[...previous,line],slideSize:{widthPt:260,heightPt:220},protectedMembers:new Set()};
}
test('one source-proven elbow replaces both prior fragments in every quadrant without mutating source',()=>{
 for(const x of [false,true])for(const y of [false,true]){
  const f=setup(x,y),before=Buffer.from(f.image.rgba),result=replace(f);
  assert.equal(result.removed.length,2);assert.deepEqual(f.shapes,[f.line]);assert.deepEqual(f.image.rgba,before);
 }
});
test('crossing, partially covered, opposing, anchored and protected independent connections survive',()=>{
 for(const mode of ['crossing','partial','opposing','anchored','protected','referenced']){
  const f=setup();let item=f.previous[0];
  if(mode==='crossing')item.box={x:120,y:130,w:0,h:40};
  if(mode==='partial')item.box.w+=30;
  if(mode==='opposing')item.style.startArrow='triangle';
  if(mode==='anchored')item.style.startAnchor={elementId:'other'};
  if(mode==='protected')f.protectedMembers.add(item);
  if(mode==='referenced')f.line.style.startAnchor.elementId=item.id;
  replace(f);assert.ok(f.shapes.includes(item),mode);
 }
});
test('a serialized, forged or modified new arrow cannot grant replacement authority',()=>{
 for(const mode of ['clone','mutate','forge']){
  const f=setup();if(mode==='mutate')f.line.box.w++;
  else {f.shapes.pop();f.shapes.push(mode==='clone'?structuredClone(f.line):{...f.line,source:{detector:'source-scene-visible-gap'}});}
  assert.deepEqual(replace(f).removed,[]);
 }
});
test('filled connector contour replacement tests every painted row rather than its bounding box',()=>{
 const f=setup(),contour={id:'contour',type:'freeform',box:{x:90,y:149,w:20,h:2},source:{nativeRebuild:true,semanticNativeStructure:true,connector:true},
  style:{fill:'#1450DC',stroke:'none',freeformSegments:[{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},{type:'lnTo',points:[{x:1,y:1}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}]}};
 f.previous.push(contour);f.shapes.unshift(contour);assert.ok(replace(f).removed.some(r=>r.id==='contour'));
 const g=setup();contour.box.h=20;g.previous.push(contour);g.shapes.unshift(contour);replace(g);assert.ok(g.shapes.includes(contour));
});
test('empty and unsafe boundaries fail closed; tests are found by unified CI',()=>{
 const f=setup();assert.deepEqual(replace({...f,shapes:[]}).removed,[]);
 for(const input of [null,{},[],{...f,slideSize:{widthPt:0,heightPt:220}},{...f,shapes:new Array(10001)},{...f,image:{width:100000,height:220}}])assert.throws(()=>replace(input),TypeError);
 let reads=0;const unsafe={...f};Object.defineProperty(unsafe,'shapes',{get(){reads++;throw Error('secret');}});assert.throws(()=>replace(unsafe),TypeError);assert.equal(reads,0);
 const unsafeShape={...f.previous[0]};Object.defineProperty(unsafeShape,'style',{get(){reads++;throw Error('secret');}});
 assert.throws(()=>replace({...f,shapes:[unsafeShape]}),TypeError);assert.equal(reads,0);
 for(const item of [null,{},[],{...f.previous[0],box:null},{...f.previous[0],style:[]}])assert.throws(()=>replace({...f,shapes:[item]}),TypeError);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-replaced-connectors.test.js'));
});
test('actual transparent arrow assets are replaced only when every painted pixel belongs to one private source arrow',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-arrow-assets-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const mode of ['covered','independent-ink','opaque-background','scaled','outside-root','forged']){
  const f=setup(),rgba=Buffer.alloc(103*13*4),raster={width:103,height:13,rgba};
  for(let y=0;y<13;y++)for(let x=0;x<103;x++){
   const source=((y+140)*260+x+80)*4,n=(y*103+x)*4;
   if(f.image.rgba[source]===20)rgba.set([20,80,220,255],n);
   else if(mode==='opaque-background')rgba.set([255,255,255,255],n);
  }
  if(mode==='independent-ink')rgba.set([20,80,220,255],10*4);
  writePng(path.join(root,'asset.png'),raster);
  const item={id:'prior-crop',assetPath:mode==='outside-root'?'../asset.png':'asset.png',box:{x:80,y:140,w:103,h:13},source:{nativeRebuild:true}};
  if(mode==='scaled')item.box.w++;
  if(mode==='forged')f.shapes[f.shapes.length-1]=structuredClone(f.line);
  const images=[item],result=replace({...f,root,images});
  assert.equal(result.removedImages.length,mode==='covered'?1:0,mode);
  assert.equal(images.includes(item),mode!=='covered',mode);
 }
});
