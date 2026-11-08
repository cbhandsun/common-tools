'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSceneOutlineMatte}=require('../packages/slideclone-core/scene-plan/source-scene-outline-matte');
const {measureSceneIconBackdrop,matteSceneParametricBackdrop,sceneParametricBackdropGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-parametric-surface');
const {cropPng}=require('../packages/slideclone-core/png');
const {withSceneFillRasterCache:withCache,readSceneFillRaster:read,sceneFillRasterReadCost:cost}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
function fixture(){
 const image={width:200,height:130,rgba:Buffer.alloc(200*130*4,255)},hint={x:20,y:15,w:140,h:90},budget={used:0};
 for(let y=15;y<105;y++)for(let x=20;x<160;x++)image.rgba.set(x<22||x>=158||y<17||y>=103?[10,20,30,255]:[235,245,250,255],(y*200+x)*4);
 for(let y=40;y<80;y++)for(let x=60;x<135;x++)image.rgba.set([10,20,30,255],(y*200+x)*4);
 return {image,hint,budget};
}

test('adjacent background remains measurable from the same cached source at the 4M ceiling',()=>{
 const f=fixture(),expected=measureSceneOutlineMatte(f.image,f.hint,[],{used:0});assert.ok(expected);
 withCache(f.image,f.budget,()=>{
  read(f.image,{x:12,y:7,w:156,h:106},f.budget);f.budget.used=4000000;
  assert.deepEqual(measureSceneOutlineMatte(f.image,f.hint,[],f.budget),expected);
  assert.equal(f.budget.used,4000000);
  assert.ok(measureSceneIconBackdrop(f.image,f.hint,[],f.budget));
  assert.equal(f.budget.used,4000000);
 });
});

test('a real partial-cache overrun remains atomic and cross-source reuse is unavailable',()=>{
 const f=fixture(),window={x:12,y:7,w:156,h:106};
 withCache(f.image,f.budget,()=>{
  read(f.image,{...window,w:155},f.budget);assert.equal(cost(f.image,window,f.budget),106);
  f.budget.used=3999895;
  assert.equal(measureSceneOutlineMatte(f.image,f.hint,[],f.budget),null);
  assert.equal(f.budget.used,3999895);assert.equal(cost(f.image,window,f.budget),106);
  f.budget.used=3999894;
  assert.ok(measureSceneOutlineMatte(f.image,f.hint,[],f.budget));assert.equal(f.budget.used,4000000);
  assert.equal(measureSceneOutlineMatte({...f.image,rgba:Buffer.from(f.image.rgba)},f.hint,[],f.budget),null);
 });
});

test('cached empty and open rings still cannot supply adjacent background',()=>{
 for(const mode of ['empty','open']){
  const f=fixture();if(mode==='empty')f.image.rgba.fill(255);
  else for(let y=14;y<19;y++)for(let x=75;x<105;x++)f.image.rgba.set([255,255,255,255],(y*200+x)*4);
  withCache(f.image,f.budget,()=>{
   read(f.image,{x:12,y:7,w:156,h:106},f.budget);f.budget.used=4000000;
   assert.equal(measureSceneOutlineMatte(f.image,f.hint,[],f.budget),null);
   assert.equal(f.budget.used,4000000);
  });
 }
});

test('validated pixel views cannot execute buffer accessors during adjacent-background measurement',()=>{
 const f=fixture();let accessed=0;
 for(const key of ['buffer','byteOffset','byteLength'])Object.defineProperty(f.image.rgba,key,{get(){accessed++;throw Error('sensitive-test-data');}});
 assert.ok(measureSceneOutlineMatte(f.image,f.hint,[],f.budget));assert.equal(accessed,0);
});

test('the original private glyph proof resolves OCR padding across the same measured ring',()=>{
 const {createSceneGlyphOcclusion,sceneIconTextFootprint}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const f=fixture();
 for(let y=15;y<105;y++)for(let x=20;x<160;x++)if(x<22||x>=158||y<17||y>=103)
  f.image.rgba.set([0,120,200,255],(y*200+x)*4);
 for(let y=44;y<59;y++)for(let x=31;x<34;x++)f.image.rgba.set([0,0,0,255],(y*200+x)*4);
 const text={text:'I',box:{x:18,y:40,w:30,h:25},font:{color:'#000000'}};
 const glyph=createSceneGlyphOcclusion(f.image,[text],{widthPt:200,heightPt:130},f.budget);
 const proof=sceneIconTextFootprint(glyph,f.image,f.budget,text.box);assert.ok(proof);
 assert.equal(proof(32,48),true);assert.equal(proof(20,48),false);
 assert.equal(measureSceneOutlineMatte(f.image,f.hint,[text.box],f.budget),null);
 const measured=measureSceneOutlineMatte(f.image,f.hint,[text.box],f.budget,glyph);assert.ok(measured);
 assert.equal(measured.color,'#EBF5FA');assert.equal(measured.matteOnly,true);
 assert.ok(measureSceneIconBackdrop(f.image,f.hint,[text.box],f.budget,glyph));
 for(const token of [{},structuredClone(glyph),new Proxy({}, {})])
  assert.equal(measureSceneOutlineMatte(f.image,f.hint,[text.box],f.budget,token),null);
 const foreign=createSceneGlyphOcclusion({...f.image,rgba:Buffer.from(f.image.rgba)},[text],{widthPt:200,heightPt:130},f.budget);
 assert.equal(measureSceneOutlineMatte(f.image,f.hint,[text.box],f.budget,foreign),null);
 const otherBudget=createSceneGlyphOcclusion(f.image,[text],{widthPt:200,heightPt:130},{used:0});
 assert.equal(measureSceneOutlineMatte(f.image,f.hint,[text.box],f.budget,otherBudget),null);
 assert.ok(f.budget.used<=4000000);
});
test('a complete ring supplies adjacent background separation without inventing a heterogeneous solid body',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),measured=measureSceneOutlineMatte(f.image,f.hint,[],f.budget);
 assert.ok(measured);assert.equal(measured.matteOnly,true);assert.equal(measured.color,'#EBF5FA');assert.equal(measured.outline.fill,'none');
 const proof=measureSceneIconBackdrop(f.image,f.hint,[],f.budget);assert.ok(proof);
 assert.equal(sceneParametricBackdropGeometry(proof,f.image,f.budget),null);
 const window={x:30,y:30,w:115,h:60},crop=cropPng(f.image,window),result=matteSceneParametricBackdrop(proof,f.image,f.budget,window,crop);
 assert.equal(result.rgba[3],0);
 const at=((50-window.y)*window.w+80-window.x)*4;assert.deepEqual(result.rgba.subarray(at,at+4),crop.rgba.subarray(at,at+4));
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 assert.equal(matteSceneParametricBackdrop(structuredClone(proof),f.image,f.budget,window,crop),crop);
 assert.equal(matteSceneParametricBackdrop(proof,{...f.image,rgba:Buffer.from(f.image.rgba)},f.budget,window,crop),crop);
 assert.equal(matteSceneParametricBackdrop(proof,f.image,{used:0},window,crop),crop);
});
test('empty, open, masked and exhausted rings cannot supply background evidence',()=>{
 const f=fixture();assert.equal(measureSceneOutlineMatte({...f.image,rgba:Buffer.alloc(f.image.rgba.length,255)},f.hint,[],{used:0}),null);
 for(let y=14;y<19;y++)for(let x=75;x<105;x++)f.image.rgba.set([255,255,255,255],(y*200+x)*4);
 assert.equal(measureSceneOutlineMatte(f.image,f.hint,[],{used:0}),null);
 const good=fixture();assert.equal(measureSceneOutlineMatte(good.image,good.hint,[good.hint],{used:0}),null);
 const exhausted={used:4000000};assert.equal(measureSceneOutlineMatte(good.image,good.hint,[],exhausted),null);assert.equal(exhausted.used,4000000);
});
test('outline palette boundaries reject malformed and hostile input without evaluating provider accessors',()=>{
 const f=fixture();let reads=0;
 const getter={get x(){reads++;throw Error('private');},y:15,w:140,h:90};
 for(const hint of [null,getter,new Proxy(f.hint,{}),{...f.hint,w:Infinity},{...f.hint,x:-1}])assert.throws(()=>measureSceneOutlineMatte(f.image,hint,[],f.budget),TypeError);
 assert.equal(reads,0);
});
