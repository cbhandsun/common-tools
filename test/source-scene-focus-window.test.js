"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {allocateSourceSceneReview:allocate,sourceSceneReviewCrop:crop,sourceSceneReviewFocusWindow:focus}=require('../packages/slideclone-core/source-scene-review-allocation');
const {prepareSceneReviewImages:prepare}=require('../packages/slideclone-core/source-scene-local-observations');
const {readPng}=require('../packages/slideclone-core/png');
const unit={index:10,box:{x:80,y:60,w:900,h:260},role:'region-inventory',optional:true,textKnown:false};
const dimensions={width:1200,height:700};

test('a legal complete structural candidate retains both focus views when only expanded context exceeds 262144',()=>{
 const input={...dimensions,targets:[unit]},before=structuredClone(input),allocation=allocate(input);
 assert.deepEqual(allocation.structureFocusIndices,[10]);assert.equal(allocation.focusPixels,2*900*260);
 assert.ok(allocation.sheetPixels+allocation.reservedPixels+allocation.focusPixels<=4000000);
 const expanded=crop(unit,.7,dimensions.width,dimensions.height);assert.ok(expanded.w*expanded.h>262144);
 const focused=focus({...dimensions,candidateBox:unit.box,cropBox:expanded});assert.deepEqual(focused,unit.box);
 assert.deepEqual(input,before);
 const oversized={...unit,box:{x:80,y:60,w:900,h:300}};
 assert.equal(allocate({...dimensions,targets:[oversized]}).structureFocusIndices,undefined);
 assert.equal(focus({...dimensions,candidateBox:oversized.box,cropBox:crop(oversized,.7,1200,700)}),null);
});

test('focus preparation charges the exact fallback and retains every candidate pixel and atlas geometry',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scene-focus-window-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const rgba=Buffer.alloc(dimensions.width*dimensions.height*4,255),marked=((unit.box.y+unit.box.h-1)*dimensions.width+unit.box.x+unit.box.w-1)*4;
 rgba[marked]=31;rgba[marked+1]=79;rgba[marked+2]=123;
 const image={...dimensions,rgba},expanded=crop(unit,.7,1200,700),candidate={...unit.box,x:unit.box.x-expanded.x,y:unit.box.y-expanded.y};
 const request={image,directory,cropTargets:[{index:10,cropBox:expanded,candidateBox:candidate}],focusIndices:[],structureFocusIndices:[10],reservedPixels:0,pixels:0,paddingRatio:.7};
 const result=prepare(request),view=readPng(path.join(directory,'focus-0.7-10.png'));
 assert.equal(view.width,900);assert.equal(view.height,260);
 assert.deepEqual([...view.rgba.subarray(view.rgba.length-4)],[31,79,123,255]);
 assert.match(result.images[1].label,/"x":0,"y":0,"w":900,"h":260/);
 assert.deepEqual(result.frame.sourceTargets[0].cropBox,expanded);
 assert.equal(result.pixels,result.frame.width*result.frame.height+900*260);
 assert.ok(result.pixels<=4000000);
 assert.throws(()=>prepare({...request,directory:fs.mkdtempSync(path.join(directory,'exhausted-')),reservedPixels:4000000}),RangeError);
});

test('legal context stays unchanged and fallback rounding preserves fractional and source-edge candidates',()=>{
 const cropBox={x:0,y:0,w:100,h:80},candidateBox={x:1.2,y:2.4,w:12.5,h:15.3};
 assert.deepEqual(focus({width:100,height:80,candidateBox,cropBox}),cropBox);
 const fractional={x:.2,y:.3,w:899.7,h:259.6};
 assert.deepEqual(focus({...dimensions,candidateBox:fractional,cropBox:{x:0,y:0,w:1100,h:600}}),{x:0,y:0,w:900,h:260});
 assert.equal(focus({...dimensions,candidateBox:{x:0,y:0,w:1024,h:256},cropBox:{x:0,y:0,w:1200,h:400}}).w,1024);
 assert.equal(focus({...dimensions,candidateBox:{x:0,y:0,w:1025,h:256},cropBox:{x:0,y:0,w:1200,h:400}}),null);
});

test('focus boundary rejects empty, invalid, extreme, escaping and hostile inputs without invoking accessors',()=>{
 const input={...dimensions,candidateBox:unit.box,cropBox:crop(unit,.7,1200,700)};let touched=0;
 const trap=()=>{touched++;throw Error('private-source-data');};
 for(const value of [null,{},new Proxy(input,{get:trap,ownKeys:trap}),{...input,get width(){return trap();}},
  {...input,width:Infinity},{...input,height:0},{...input,candidateBox:{...unit.box,w:0}},
  {...input,cropBox:{x:0,y:0,w:1,h:1}},{...input,cropBox:{x:0,y:0,w:1201,h:700}},
  {...input,candidateBox:new Proxy(unit.box,{get:trap,ownKeys:trap})}])
  assert.throws(()=>focus(value),error=>error instanceof TypeError&&!error.message.includes('private-source-data'));
 assert.equal(touched,0);
});

test('focus fallback regressions are discovered by unit and all CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(file=>file.file.endsWith('source-scene-focus-window.test.js')));
});

test('oversized whole-owner observations fail before files are written even with ample total budget',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scene-owner-cap-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const image={width:1400,height:800,rgba:Buffer.alloc(1400*800*4,255)};
 for(const box of [{x:20,y:30,w:1100,h:300},{x:40,y:50,w:1150,h:380}]){
  assert.equal(focus({width:image.width,height:image.height,candidateBox:box,cropBox:box}),null);
  const target={index:0,cropBox:box,candidateBox:{...box,x:0,y:0}};
  assert.throws(()=>prepare({image,directory,cropTargets:[target],focusIndices:[],structureFocusIndices:[0],reservedPixels:0,pixels:0,paddingRatio:0}),/focus window exceeds boundary/);
  assert.deepEqual(fs.readdirSync(directory),[]);
 }
});
