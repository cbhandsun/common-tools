"use strict";
const assert=require("node:assert/strict"),test=require("node:test");
const {sourceIconPaletteShapes:palette}=require("../packages/slideclone-core/source-icon-palette");
const {sourceIconPaintError:score}=require("../packages/slideclone-core/source-icon-paint-error");
const {nativeSceneIconShapes}=require("../packages/slideclone-core/source-scene-native-icon");
const box={x:10,y:20,w:64,h:64};
function fixture(){
 const image={width:32,height:32,rgba:Buffer.alloc(32*32*4)};
 const colors=[[20,50,90],[70,100,140],[130,160,200]];
 for(let y=5;y<27;y++)for(let x=5;x<27;x++)if(!(x>=14&&x<=17&&y>=14&&y<=17))
  image.rgba.set([...colors[Math.floor((x-5)/8)],255],(y*32+x)*4);
 return image;
}
test("complete isolated source paint retains colors, empty holes and original native path/part limits",()=>{
 const image=fixture(),before=Buffer.from(image.rgba),shapes=palette(image,box,"icon");
 assert.ok(shapes.length>0&&shapes.length<=32);
 assert.ok(shapes.every(s=>s.type==="freeform"&&s.style.freeformSegments.length<=120));
 assert.deepEqual(score(image,box,shapes),{error:0,missing:0,extra:0});
 assert.deepEqual(image.rgba,before);assert.deepEqual(palette(image,box,"icon"),shapes);
});
test("source-native icon stage selects better complete paint without raster fallback or new ownership",()=>{
 const image=fixture(),icon={id:"scene-icon-fixture",assetPath:"assets/unused.png",box,source:{sceneRegionId:"root"}};
 const shapes=nativeSceneIconShapes(icon,"unused","",image);
 assert.ok(shapes.length>0);assert.ok(shapes.every(s=>s.source.detector==="source-scene-palette-native"));
 assert.deepEqual(score(image,box,shapes),{error:0,missing:0,extra:0});
 assert.ok(shapes.every(s=>s.source.sceneRegionId==="root"&&s.source.editable===true));
});

test("page composition prevents palette refinements from inflating the shared structure tree",()=>{
 const image=fixture(),icon={id:"scene-icon-fixture",assetPath:"assets/unused.png",box,source:{sceneRegionId:"root"}};
 const {vectorizeDensePictorialIcon}=require("../packages/slideclone-core/pictorial-icon-native-vectorization");
 const baseline=vectorizeDensePictorialIcon({image,box,idPrefix:icon.id});
 const bounded=nativeSceneIconShapes(icon,"unused","",image,false,true);
 const unrestricted=nativeSceneIconShapes(icon,"unused","",image);
 const {compactNativeFreeformPaths}=require("../packages/slideclone-core/native-freeform-path");
 const count=value=>1+(value&&typeof value==="object"?Object.values(value).reduce((n,v)=>n+count(v),0):0);
 const cost=shapes=>{
  const deck={pages:[{shapes:structuredClone(shapes)}]};compactNativeFreeformPaths(deck);
  // Region and parent ownership are attached equally after representation choice.
  for(const s of deck.pages[0].shapes){delete s.source.sceneRegionId;delete s.source.sceneParentObjectId;}
  return count(deck.pages[0].shapes);
 };
 assert.ok(cost(unrestricted)>cost(baseline));assert.ok(cost(bounded)<=cost(baseline));
 assert.deepEqual(bounded.map(s=>s.style),baseline.map(s=>s.style));
 assert.ok(bounded.every(s=>s.source.editable===true&&s.source.sceneRegionId==="root"));
 assert.throws(()=>nativeSceneIconShapes(icon,"unused","",image,false,"invalid"),TypeError);
 const empty={width:32,height:32,rgba:Buffer.alloc(32*32*4)};
 assert.deepEqual(nativeSceneIconShapes(icon,"unused","",empty,false,true),[]);
});
test("empty and over-budget representations return no partial source paint",()=>{
 const empty={width:32,height:32,rgba:Buffer.alloc(32*32*4)};
 assert.deepEqual(palette(empty,box,"icon"),[]);
 const noisy={width:64,height:64,rgba:Buffer.alloc(64*64*4,255)};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)noisy.rgba.set((x+y)%2?[20,50,90,255]:[130,160,200,255],(y*64+x)*4);
 assert.deepEqual(palette(noisy,box,"icon"),[]);
 assert.throws(()=>palette({width:513,height:513,rgba:Buffer.alloc(513*513*4)},box,"icon"),/input/);
});
test("vertically adjacent identical source runs coalesce without changing their pixel population",()=>{
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4,255)};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)image.rgba.set(x<32?[20,50,90,255]:[130,160,200,255],(y*64+x)*4);
 const shapes=palette(image,box,"icon");assert.equal(shapes.length,2);
 assert.ok(shapes.every(s=>s.style.freeformSegments.length===5));
 assert.deepEqual(score(image,box,shapes),{error:0,missing:0,extra:0});
});
test("invalid source bytes, unsafe identities and invalid geometry fail before emission",()=>{
 assert.throws(()=>palette({width:32,height:32,rgba:Buffer.alloc(1)},box,"icon"),/pixels/);
 for(const id of ["../private","x\nprivate",""])assert.throws(()=>palette(fixture(),box,id),/input/);
 for(const b of [{...box,w:0},{...box,x:-1},{...box,h:Infinity}])assert.throws(()=>palette(fixture(),b,"icon"),/input/);
 const hostile={get width(){assert.fail("must not read accessor");}};assert.throws(()=>palette(hostile,box,"icon"),TypeError);
});

test("touching staircase runs share exact compound boundaries within the original command budget",()=>{
 const image={width:128,height:128,rgba:Buffer.alloc(128*128*4)};
 for(let y=5;y<105;y++)for(let x=5;x<y+7;x++)image.rgba.set([20,50,90,255],(y*128+x)*4);
 const before=Buffer.from(image.rgba),shapes=palette(image,box,"stairs");
 assert.ok(shapes.length>0&&shapes.length<Math.ceil(100/24));
 assert.ok(shapes.every(s=>s.style.freeformSegments.length<=120));
 assert.deepEqual(score(image,box,shapes),{error:0,missing:0,extra:0});
 assert.deepEqual(image.rgba,before);
 const {compactNativeFreeformPaths,readNativeFreeformSegments}=require("../packages/slideclone-core/native-freeform-path");
 const deck={pages:[{shapes:structuredClone(shapes)}]};compactNativeFreeformPaths(deck);
 assert.deepEqual(deck.pages[0].shapes.map(s=>readNativeFreeformSegments(s.style)),shapes.map(s=>s.style.freeformSegments));
 assert.deepEqual(score(image,box,deck.pages[0].shapes),{error:0,missing:0,extra:0});
 const {includesSuite}=require("../scripts/test-suites");assert.ok(includesSuite(__filename,"unit"));
});

test("compound palette boundaries preserve holes diagonal contacts and disjoint cells without partial paint",()=>{
 for(let seed=1;seed<=8;seed++){
  const image={width:48,height:48,rgba:Buffer.alloc(48*48*4)};
  for(let y=2;y<46;y++)for(let x=2;x<46;x++){
   const hollow=x>12&&x<35&&y>12&&y<35;
   if(!hollow&&((x+y+seed)%7!==0))image.rgba.set(x<24?[20,50,90,255]:[130,160,200,255],(y*48+x)*4);
  }
  const shapes=palette(image,box,"holes");assert.ok(shapes.length>0&&shapes.length<=32);
  assert.ok(shapes.every(s=>s.style.freeformSegments.length<=120));
  assert.deepEqual(score(image,box,shapes),{error:0,missing:0,extra:0});
 }
});
