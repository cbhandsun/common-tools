'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compileSceneIcon,sceneNativeIconNode}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {hasMeasuredScenePortFrame,measuredSceneContourPort,measuredScenePortBodyMask,measuredScenePortOwnsCell,measuredSceneGroupBounds,measuredSceneOpaqueSurface,measuredScenePortPerimeterCells}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {measureSourceSceneVisibleGap}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-ink-port-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:180,height:110,rgba:Buffer.alloc(180*110*4,255)};
 const put=(x,y)=>image.rgba.set([30,60,90,255],(y*image.width+x)*4);
 for(const left of [20,110]){
  for(let y=30;y<65;y++)for(let x=left;x<left+8;x++)put(x,y);
  for(let y=57;y<65;y++)for(let x=left;x<left+25;x++)put(x,y);
 }
 const compile=left=>compileSceneIcon({image,box:{x:left,y:30,w:25,h:35},id:'icon-'+left,regionId:'region',root,
  slideSize:{widthPt:180,heightPt:110},textBoxes:[],budget:{used:0}},{preflight:true,nativePictorial:true,parentObjectId:'',relationEndpoint:true});
 return {image,root,put,compile};
}

test('a concave pictorial contour projects a logical gap only after its complete exterior corridor is observed',t=>{
 const f=fixture(t);
 for(let x=50;x<=104;x++)for(let y=39;y<=41;y++)f.put(x,y);
 for(let step=0;step<5;step++)for(let y=40-step;y<=40+step;y++)f.put(104-step,y);
 const from=sceneNativeIconNode(f.image,f.compile(20)),to=sceneNativeIconNode(f.image,f.compile(110));assert.ok(from);assert.ok(to);
 const input={image:f.image,from,to,direction:'forward',textMasks:[],otherNodes:[],budget:{used:0},shaftBox:{x:48,y:33,w:59,h:15}};
 const before=Buffer.from(f.image.rgba),result=measureSourceSceneVisibleGap(input);assert.ok(result.fit,result.reason);
 assert.equal(result.fit.physical,undefined);assert.deepEqual(f.image.rgba,before);
 assert.ok(input.budget.used>0&&input.budget.used<=4000000);
 const occluded=measureSourceSceneVisibleGap({...input,budget:{used:0},textMasks:[{x:36,y:38,w:4,h:4}]});assert.equal(occluded.fit,null);
 f.put(38,40);assert.equal(measureSourceSceneVisibleGap({...input,budget:{used:0}}).fit,null,'ink hidden inside the old rectangular gap cannot be ignored');
});
test('a complete one-shape pictorial endpoint exposes its source ink without inventing a filled enclosure',t=>{
 const f=fixture(t),compiled=f.compile(20);assert.equal(compiled.failure,null);assert.equal(compiled.shapes.length,1);
 const node=sceneNativeIconNode(f.image,compiled);assert.ok(node);assert.equal(node.id,compiled.shapes[0].id);
 assert.ok(hasMeasuredScenePortFrame(f.image,node.portFrame,node.box));
 assert.deepEqual(measuredSceneContourPort(f.image,node.portFrame,node.box,40,'right'),{x:28,y:40});
 assert.deepEqual(measuredSceneContourPort(f.image,node.portFrame,node.box,60,'right'),{x:45,y:60});
 const mask=measuredScenePortBodyMask(f.image,node.portFrame,node.box,{x:20,y:30,w:25,h:35},{checks:0});assert.ok(mask);
 assert.equal(mask[10*25+20],0,'empty concave corner is not body ink');assert.equal(mask[30*25+20],1);
 assert.equal(measuredScenePortOwnsCell(f.image,node.portFrame,node.box,40*f.image.width+40),false);
 assert.equal(measuredSceneGroupBounds(f.image,node.portFrame),null);assert.equal(measuredSceneOpaqueSurface(f.image,node.portFrame),null);
 const cells=measuredScenePortPerimeterCells(f.image,node.portFrame,node.box,{x:20,y:30,w:25,h:35});cells.clear();
 assert.ok(measuredScenePortOwnsCell(f.image,node.portFrame,node.box,60*f.image.width+40),'a returned set cannot edit source ownership');
 assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
});
test('pictorial endpoint receipts reject copied outputs, changed members and cross-source frames',t=>{
 const f=fixture(t),compiled=f.compile(20),node=sceneNativeIconNode(f.image,compiled);assert.ok(node);
 assert.equal(sceneNativeIconNode(f.image,structuredClone(compiled)),null);
 assert.equal(sceneNativeIconNode({...f.image,rgba:Buffer.from(f.image.rgba)},compiled),null);
 for(const token of [{},structuredClone(node.portFrame),new Proxy(node.portFrame,{})])assert.equal(hasMeasuredScenePortFrame(f.image,token,node.box),false);
 assert.equal(hasMeasuredScenePortFrame(f.image,node.portFrame,{...node.box,x:node.box.x+1}),false);
 assert.equal(measuredScenePortBodyMask(f.image,node.portFrame,node.box,{x:0,y:0,w:180,h:110},{checks:4000000}),null);
 compiled.shapes[0].box.x++;assert.equal(sceneNativeIconNode(f.image,compiled),null);
 const removed=f.compile(20);removed.shapes.pop();assert.equal(sceneNativeIconNode(f.image,removed),null);
});
test('an independently observed visible arrow can bind real pictorial shapes while blanks, directions and text occlusion fail',t=>{
 const f=fixture(t);for(let x=50;x<=104;x++)for(let y=59;y<=61;y++)f.put(x,y);
 for(let step=0;step<5;step++)for(let y=60-step;y<=60+step;y++)f.put(104-step,y);
 const a=f.compile(20),b=f.compile(110),from=sceneNativeIconNode(f.image,a),to=sceneNativeIconNode(f.image,b);assert.ok(from);assert.ok(to);
 const input={image:f.image,from,to,direction:'forward',textMasks:[],otherNodes:[],budget:{used:0},shaftBox:{x:48,y:53,w:59,h:15}};
 const result=measureSourceSceneVisibleGap(input);assert.ok(result.fit,result.reason);assert.ok(input.budget.used<=4000000);
 assert.equal(measureSourceSceneVisibleGap({...input,direction:'undirected',budget:{used:0}}).fit,null);
 assert.equal(measureSourceSceneVisibleGap({...input,textMasks:[{x:65,y:55,w:10,h:10}],budget:{used:0}}).fit,null);
 const other={...f.image,rgba:Buffer.from(f.image.rgba)};
 assert.equal(measureSourceSceneVisibleGap({...input,image:other,budget:{used:0}}).fit,null);
});
test('the scene compiler retains real pictorial endpoint IDs without proxy containers or raster endpoints',t=>{
 const f=fixture(t);for(let x=50;x<=104;x++)for(let y=59;y<=61;y++)f.put(x,y);
 for(let step=0;step<5;step++)for(let y=60-step;y<=60+step;y++)f.put(104-step,y);
 const sourceFile=path.join(f.root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,f.image);
 const sourceHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=require('../packages/slideclone-core/scene-plan/source-scene-plan').parseSourceScenePlan({coordinateSpace:'source-pixels',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:110}}],
  objects:[20,110].map(left=>({id:'icon-'+left,regionId:'root',kind:'icon',box:{x:left,y:30,w:25,h:35}})),
  relations:[{id:'link',regionId:'root',fromId:'icon-20',toId:'icon-110',direction:'forward',shaftBox:{x:48,y:53,w:59,h:15}}]},
 {sourceHash,widthPx:180,heightPx:110});
 for(const preflight of [true,false]){
  const result=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({sourceFile,plan,root:f.root,
   page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:180,heightPt:110},preflight});
  assert.equal(result.evidence.icons,2);assert.equal(result.evidence.resolvedRelations,1,JSON.stringify(result.evidence.unresolved));
  assert.equal(result.page.images.length,0);
  const connector=result.page.shapes.find(s=>s.source?.sceneRelationId==='relation-link');assert.ok(connector);
  for(const key of ['startAnchor','endAnchor']){
   const target=result.page.shapes.find(s=>s.id===connector.style[key].elementId);assert.ok(target);
   assert.equal(target.source.semanticPictorialNative,true);
  }
  assert.equal(result.page.shapes.some(s=>s.source?.detector==='source-scene-container'),false);
 }
});

test('a complete multi-part icon relation binds the contacted member in the final scene',t=>{
 const f=fixture(t);
 for(const left of [20,110])for(let y=57;y<65;y++)for(let x=left+10;x<left+25;x++)f.image.rgba.set([180,40,30,255],(y*f.image.width+x)*4);
 for(let x=50;x<=104;x++)for(let y=59;y<=61;y++)f.put(x,y);
 for(let step=0;step<5;step++)for(let y=60-step;y<=60+step;y++)f.put(104-step,y);
 const sourceFile=path.join(f.root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,f.image);
 const sourceHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=require('../packages/slideclone-core/scene-plan/source-scene-plan').parseSourceScenePlan({coordinateSpace:'source-pixels',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:110}}],
  objects:[20,110].map(left=>({id:'icon-'+left,regionId:'root',kind:'icon',box:{x:left,y:30,w:25,h:35}})),
  relations:[{id:'link',regionId:'root',fromId:'icon-20',toId:'icon-110',direction:'forward',shaftBox:{x:48,y:53,w:59,h:15}}]},
 {sourceHash,widthPx:180,heightPx:110});
 for(const preflight of [true,false]){
  const result=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({sourceFile,plan,root:f.root,
   page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:180,heightPt:110},preflight});
  assert.equal(result.evidence.resolvedRelations,1,JSON.stringify(result.evidence.unresolved));
  assert.equal(result.page.images.length,0);
  const connector=result.page.shapes.find(s=>s.source?.sceneRelationId==='relation-link');assert.ok(connector);
  const start=result.page.shapes.find(s=>s.id===connector.style.startAnchor.elementId);
  const end=result.page.shapes.find(s=>s.id===connector.style.endAnchor.elementId);
  assert.ok(start);assert.ok(end);assert.equal(start.style.fill.toUpperCase(),'#B4281E');assert.equal(end.style.fill.toUpperCase(),'#1E3C5A');
  assert.ok(result.page.shapes.filter(s=>s.source?.semanticPictorialNative).length>=4,'all actual native members survive finalization');
  assert.equal(result.page.shapes.some(s=>s.source?.detector==='source-scene-container'),false);
 }
});
test('multi-paint pictures cannot attach their whole unit to one native patch',t=>{
 const f=fixture(t);for(let y=58;y<64;y++)for(let x=30;x<40;x++)f.image.rgba.set([180,40,30,255],(y*f.image.width+x)*4);
 const result=f.compile(20);assert.equal(result.failure,null);assert.ok(result.shapes.length>1);
 assert.equal(sceneNativeIconNode(f.image,result),null);assert.equal(result.icon.source.editable,false);
});

test('multi-part ports select the source-contacted paint member and retain complete membership',t=>{
 const f=fixture(t),{sceneNativeIconEndpoint}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
 for(let y=57;y<65;y++)for(let x=30;x<45;x++)f.image.rgba.set([180,40,30,255],(y*f.image.width+x)*4);
 const result=f.compile(20);assert.equal(result.failure,null);assert.ok(result.shapes.length>1);
 const red=sceneNativeIconEndpoint(f.image,result,60,'right'),blue=sceneNativeIconEndpoint(f.image,result,40,'right');
 assert.ok(red);assert.ok(blue);assert.notEqual(red.id,blue.id);
 assert.equal(result.shapes.find(s=>s.id===red.id).style.fill.toUpperCase(),'#B4281E');
 assert.equal(result.shapes.find(s=>s.id===blue.id).style.fill.toUpperCase(),'#1E3C5A');
 assert.deepEqual(measuredSceneContourPort(f.image,red.portFrame,red.box,60,'right'),{x:45,y:60});
 assert.equal(sceneNativeIconEndpoint(f.image,result,20,'right'),null);
 assert.equal(sceneNativeIconEndpoint(f.image,result,NaN,'right'),null);
 assert.equal(sceneNativeIconEndpoint(f.image,result,60,'invalid'),null);
 assert.equal(sceneNativeIconEndpoint(f.image,structuredClone(result),60,'right'),null);
 assert.equal(sceneNativeIconEndpoint({...f.image,rgba:Buffer.from(f.image.rgba)},result,60,'right'),null);
 result.shapes[0].box.x++;assert.equal(sceneNativeIconEndpoint(f.image,result,60,'right'),null,'an unrelated changed member invalidates the complete unit');
 const removed=f.compile(20);removed.shapes.pop();assert.equal(sceneNativeIconEndpoint(f.image,removed,60,'right'),null);
});

test('multi-part ownership rejects hostile, empty and oversized member collections without evaluating getters',t=>{
 const f=fixture(t),{createSceneIconPartPorts}=require('../packages/slideclone-core/scene-plan/source-scene-icon-part-ports');
 const window={x:20,y:30,w:25,h:35},isolated=require('../packages/slideclone-core/png').cropPng(f.image,window);
 let called=0;const hostile=[];Object.defineProperty(hostile,0,{get(){called++;throw Error('private');}});
 for(const shapes of [null,{},[],hostile,new Array(33).fill({})])assert.equal(createSceneIconPartPorts(f.image,isolated,window,window,shapes,{widthPt:180,heightPt:110}),null);
 assert.equal(called,0);
});

test('a diagonal shaft envelope selects a unique contacted part when its midpoint lies outside the icon',t=>{
 const f=fixture(t);
 // Two actual colors make a multi-part picture; only its red lower contour
 // touches the proposed shaft's full vertical interval.
 for(let y=57;y<65;y++)for(let x=110;x<135;x++)f.image.rgba.set([180,40,30,255],(y*f.image.width+x)*4);
 const multi=f.compile(110);assert.equal(multi.failure,null);assert.ok(multi.shapes.length>1);
 const {createSceneIconRelationNodes}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
 const resolve=createSceneIconRelationNodes({image:f.image,icons:[multi],nodes:new Map([['body',{id:'native-body',box:{x:20,y:80,w:20,h:20},portFrame:null}]]),slideSize:{widthPt:180,heightPt:110}});
 const pair=resolve({id:'link',regionId:'region',fromId:'body',toId:'icon-110',direction:'forward',shaftBox:{x:40,y:58,w:70,h:32}});
 assert.ok(pair.to,'a complete shaft envelope can touch the icon although its midpoint is outside it');
 assert.equal(multi.shapes.find(s=>s.id===pair.to.id).style.fill.toUpperCase(),'#B4281E');
 const ambiguous=resolve({id:'link',regionId:'region',fromId:'body',toId:'icon-110',direction:'forward',shaftBox:{x:40,y:55,w:70,h:50}});
 assert.equal(ambiguous.to,undefined,'an envelope touching different members cannot choose one by proximity');
 const empty=resolve({id:'link',regionId:'region',fromId:'body',toId:'icon-110',direction:'forward',shaftBox:{x:40,y:70,w:70,h:30}});
 assert.equal(empty.to,undefined,'an empty corridor does not authorize a port');
});
test('source-to-slide point conversion preserves complete ink endpoint ownership',t=>{
 const f=fixture(t);
 for(const slideSize of [{widthPt:960,heightPt:586.6666666666666},{widthPt:997.3,heightPt:613.7},{widthPt:1000,heightPt:1337}]){
  const result=compileSceneIcon({image:f.image,box:{x:20,y:30,w:25,h:35},id:'rescaled',regionId:'region',root:f.root,slideSize,textBoxes:[],budget:{used:0}},
   {preflight:true,nativePictorial:true,parentObjectId:'',relationEndpoint:true});
  assert.equal(result.failure,null);assert.equal(result.shapes.length,1);
  const node=sceneNativeIconNode(f.image,result);assert.ok(node,JSON.stringify(slideSize));
  assert.deepEqual(measuredSceneContourPort(f.image,node.portFrame,node.box,60,'right'),{x:45,y:60});
 }
});
test('a shaft at a pictorial bounding-box corner cannot bypass actual ink attachment',t=>{
 const f=fixture(t),from=sceneNativeIconNode(f.image,f.compile(20)),to=sceneNativeIconNode(f.image,f.compile(110));assert.ok(from);assert.ok(to);
 // The new shaft occupies only previously empty exterior pixels. The
 // measured pictorial ink is unchanged; its left concave corner stays empty.
 for(let x=46;x<=109;x++)for(let y=47;y<=49;y++)f.put(x,y);
 for(let step=0;step<5;step++)for(let y=48-step;y<=48+step;y++)f.put(109-step,y);
 const result=require('../packages/slideclone-core/scene-plan/source-scene-relation').measureSceneRelationDetailed({image:f.image,from,to,direction:'forward',textMasks:[],budget:{used:0},shaftBox:{x:46,y:40,w:64,h:17}});
 assert.equal(result.fit,null,'a rectangle-aligned shaft does not prove contact with the pictorial source contour');
});
test('source ink masks preserve holes and fail closed on empty, illegal, extreme and hostile controls',()=>{
 const {createSceneInkPort}=require('../packages/slideclone-core/scene-plan/source-scene-ink-port');
 const source={width:40,height:40,rgba:Buffer.alloc(40*40*4,255)},isolated={width:20,height:20,rgba:Buffer.alloc(20*20*4)},box={x:10,y:10,w:20,h:20};
 for(let y=0;y<20;y++)for(let x=0;x<20;x++)if(x<3||x>=17||y<3||y>=17){
  isolated.rgba.set([30,60,90,255],(y*20+x)*4);source.rgba.set([30,60,90,255],((y+10)*40+x+10)*4);
 }
 const token=createSceneInkPort(source,isolated,box,box);assert.ok(token);
 assert.equal(measuredScenePortOwnsCell(source,token,box,20*40+20),false,'the hollow center remains unowned');
 assert.equal(measuredSceneContourPort(source,token,box,20,'right').x,30);
 assert.equal(measuredSceneContourPort(source,token,box,NaN,'right'),null);
 assert.equal(measuredSceneContourPort(source,token,box,20,'unknown'),null);
 assert.equal(createSceneInkPort(source,{...isolated,rgba:Buffer.alloc(20*20*4)},box,box),null);
 assert.equal(createSceneInkPort(source,{...isolated,rgba:Buffer.alloc(20*20*4,255)},box,box),null);
 let called=0;const hostile={};Object.defineProperty(hostile,'width',{get(){called++;throw Error('private');}});
 for(const value of [null,{},hostile,new Proxy(source,{get(){called++;throw Error('private');}})])assert.throws(()=>createSceneInkPort(value,isolated,box,box),TypeError);
 assert.throws(()=>createSceneInkPort(source,isolated,{...box,w:16384},box),TypeError);
 assert.throws(()=>createSceneInkPort(source,{...isolated,rgba:Buffer.alloc(1)},box,box),TypeError);
 const pixels=Buffer.from(source.rgba);Object.defineProperty(pixels,'length',{get(){called++;throw Error('private-pixels');}});
 assert.throws(()=>createSceneInkPort({...source,rgba:pixels},isolated,box,box),TypeError);
 assert.equal(called,0);
});
test('pictorial ink port tests are discovered by the unified unit suite',()=>{
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});
