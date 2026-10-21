"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {materializeSceneIcon}=require('../packages/slideclone-core/source-scene-icon');
const {nativeSceneIconShapes}=require('../packages/slideclone-core/source-scene-native-icon');
const {writePng}=require('../packages/slideclone-core/png');

test('isolated dense and tall icons reach native reconstruction while raster retention stays rejected',t=>{
 const {compileSceneIcon,sceneNativeIconBinding}=require('../packages/slideclone-core/source-scene-native-icon');
 const {measureSceneIconDetailed,measureSceneNativeIconDetailed}=require('../packages/slideclone-core/source-scene-icon');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-native-admission-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const [width,height]of [[60,60],[24,72]]){
  const image={width:400,height:400,rgba:Buffer.alloc(400*400*4,255)};
  for(let y=40;y<40+height;y++)for(let x=40;x<40+width;x++)image.rgba.set([24,24,24,255],(y*400+x)*4);
  const input={image,box:{x:40,y:40,w:width,h:height},id:'isolated',regionId:'region',root,
   slideSize:{widthPt:400,heightPt:400},textBoxes:[],budget:{used:0}};
  assert.equal(measureSceneIconDetailed(input).reason,'icon-source-crop-admission');
  const measured=measureSceneNativeIconDetailed({...input,budget:{used:0}});
  assert.ok(measured.measurement);assert.equal(measured.measurement.icon.source.protectedMinimumUnit,undefined);
  assert.equal(measured.measurement.icon.source.tightCropAdmission,undefined);
  for(const preflight of [true,false]){
   const result=compileSceneIcon({...input,budget:{used:0}},{preflight,nativePictorial:true,parentObjectId:''});
   assert.equal(result.failure,null);assert.ok(result.shapes.length);assert.ok(sceneNativeIconBinding(image,result));
   assert.ok(result.shapes.every(shape=>shape.source.editable===true&&!shape.assetPath));
  }
  assert.equal(fs.existsSync(path.join(root,'assets')),false,'native compilation cannot publish an unadmitted raster');
  const text=compileSceneIcon({...input,budget:{used:0},textBoxes:[{text:'label',box:{x:40,y:40,w:8,h:8}}]},
   {preflight:true,nativePictorial:true,parentObjectId:''});
  assert.equal(text.detailCode,'icon-source-text');assert.deepEqual(text.shapes,[]);
  assert.throws(()=>measureSceneNativeIconDetailed({...input,image:{...image,rgba:Buffer.alloc(1)},budget:{used:0}}));
  assert.throws(()=>measureSceneNativeIconDetailed({...input,budget:{used:4000000}}),RangeError);
 }
});

test('native-only isolation cannot fall back to an unadmitted raster when representation fails',t=>{
 const {compileSceneIcon}=require('../packages/slideclone-core/source-scene-native-icon');
 const {measureSceneNativeIconDetailed}=require('../packages/slideclone-core/source-scene-icon');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-native-failure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:400,rgba:Buffer.alloc(400*400*4,255)};
 for(let row=0;row<6;row++)for(let column=0;column<6;column++)for(let y=0;y<4;y++)for(let x=0;x<4;x++)
  image.rgba.set([24,24,24,255],((40+row*8+y)*400+40+column*8+x)*4);
 const input={image,box:{x:40,y:40,w:44,h:44},id:'fragmented',regionId:'region',root,
  slideSize:{widthPt:400,heightPt:400},textBoxes:[],budget:{used:0}};
 assert.ok(measureSceneNativeIconDetailed(input).measurement);
 for(const preflight of [true,false])assert.deepEqual(compileSceneIcon({...input,budget:{used:0}},
  {preflight,nativePictorial:true,parentObjectId:''}),{icon:null,shapes:[],failure:'icon-native-representation'});
 assert.equal(fs.existsSync(path.join(root,'assets')),false);
});
test('the composed icon stage preserves source rejection and preflight writes no representation assets',t=>{
 const {compileSceneIcon}=require('../packages/slideclone-core/source-scene-native-icon');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-icon-stage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=30;y<55;y++)for(let x=30;x<43;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=51;y<55;y++)for(let x=43;x<57;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 const input={image,box:{x:30,y:30,w:28,h:25},id:'child',regionId:'region',root,slideSize:{widthPt:400,heightPt:300},textBoxes:[],budget:{used:0}};
 const native=compileSceneIcon(input,{preflight:true,nativePictorial:true,parentObjectId:'object-parent'});
 assert.equal(native.failure,null);assert.ok(native.shapes.length);assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const raster=compileSceneIcon({...input,budget:{used:0}},{preflight:true,nativePictorial:false,parentObjectId:''});
 assert.equal(raster.failure,null);assert.ok(raster.icon);assert.deepEqual(raster.shapes,[]);assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const final=compileSceneIcon({...input,budget:{used:0}},{preflight:false,nativePictorial:true,parentObjectId:'object-parent'});
 assert.equal(final.failure,null);assert.deepEqual(final.shapes,native.shapes);
 const blank={...input,image:{...image,rgba:Buffer.alloc(image.rgba.length,255)},budget:{used:0}};
 assert.deepEqual(compileSceneIcon(blank,{preflight:true,nativePictorial:true,parentObjectId:'object-parent'}),{icon:null,shapes:[],failure:'icon-isolation',detailCode:'icon-source-empty'});
});
test('isolated pictorial output consists of visible native paths rather than an editable raster claim',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-scene-icon-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=30;y<55;y++)for(let x=30;x<43;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=51;y<55;y++)for(let x=43;x<57;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 const icon=materializeSceneIcon({image,box:{x:30,y:30,w:28,h:25},id:'child',regionId:'region',root,slideSize:{widthPt:400,heightPt:300},textBoxes:[],budget:{used:0}});assert.ok(icon);
 const shapes=nativeSceneIconShapes(icon,root,'object-parent');assert.ok(shapes.length);
 for(const shape of shapes){assert.equal(shape.type,'freeform');assert.equal(shape.source.editable,true);assert.equal(shape.source.sceneParentObjectId,'object-parent');
  assert.ok(shape.style.freeformSegments.length);assert.equal(shape.assetPath,undefined);assert.equal(shape.source.nonEditableReason,undefined);}
});
test('blank source vectors return nothing and corrupt crop data cannot produce a native unit',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-scene-icon-invalid-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 writePng(path.join(root,'blank.png'),{width:10,height:10,rgba:Buffer.alloc(400,255)});
 const icon={assetPath:'blank.png',box:{x:0,y:0,w:10,h:10},id:'blank',source:{sceneRegionId:'region'}};
 assert.deepEqual(nativeSceneIconShapes(icon,root,'parent'),[]);fs.writeFileSync(path.join(root,'blank.png'),'invalid');assert.throws(()=>nativeSceneIconShapes(icon,root,'parent'));
});

function lineArtFixture(width=80,height=80){
 const image={width,height,rgba:Buffer.alloc(width*height*4)};
 for(let y=10;y<70;y++)for(let x=10;x<70;x++)if(x<12||x>=68||y<12||y>=68)
  image.rgba.set([24,24,24,255],(y*width+x)*4);
 return image;
}
function fixtureIcon(image){return {assetPath:'unused.png',box:{x:100,y:200,w:image.width/2,h:image.height/2},id:'isolated',source:{sceneRegionId:'region'}};}

test('an isolated sparse native icon keeps its hole instead of failing the dense representation',()=>{
 const image=lineArtFixture(),icon=fixtureIcon(image);
 const {vectorizeDensePictorialIcon}=require('../packages/slideclone-core/pictorial-icon-native-vectorization');
 assert.deepEqual(vectorizeDensePictorialIcon({image,box:icon.box,idPrefix:icon.id}),[]);
 const shapes=nativeSceneIconShapes(icon,'unused','object-parent',image);
 assert.equal(shapes.length,1);assert.equal(shapes[0].type,'freeform');
 assert.equal(shapes[0].style.freeformSegments.filter(s=>s.type==='close').length,2);
 assert.deepEqual(shapes[0].box,{x:105,y:205,w:30,h:30});
 assert.ok(shapes.every(s=>s.style.freeformSegments.length<=120&&s.source.editable===true
  &&s.source.nativeRebuild===true&&s.source.semanticPictorialNative===true&&s.source.pictorialVectorized===true
  &&s.source.nativeComponentRole==='pictorial'&&s.source.sceneRegionId==='region'&&s.source.sceneParentObjectId==='object-parent'));
});

test('successful dense native icons keep their complete original representation',()=>{
 const image=lineArtFixture();
 for(let y=13;y<67;y++)for(let x=13;x<67;x++)image.rgba.set([20,150,220,255],(y*image.width+x)*4);
 const icon=fixtureIcon(image),{vectorizeDensePictorialIcon}=require('../packages/slideclone-core/pictorial-icon-native-vectorization');
 const expected=vectorizeDensePictorialIcon({image,box:icon.box,idPrefix:icon.id});assert.ok(expected.length);
 for(const shape of expected)Object.assign(shape.source,{sceneRegionId:'region',sceneParentObjectId:'object-parent'});
 assert.deepEqual(nativeSceneIconShapes(icon,'unused','object-parent',image),expected);
});

test('sparse representation keeps dimension, component and malformed raster limits',()=>{
 for(const [width,height]of [[512,80],[80,512]]){
  const image=lineArtFixture(width,height);assert.ok(nativeSceneIconShapes(fixtureIcon(image),'unused','parent',image).length);
 }
 for(const [width,height]of [[513,80],[80,513]]){
  const image=lineArtFixture(width,height);assert.deepEqual(nativeSceneIconShapes(fixtureIcon(image),'unused','parent',image),[]);
 }
 const image={width:100,height:100,rgba:Buffer.alloc(40000)};
 for(let i=0;i<17;i++)for(let y=0;y<4;y++)for(let x=0;x<4;x++){
  const sx=5+(i%5)*18+x,sy=5+Math.floor(i/5)*18+y;image.rgba.set([20,20,20,255],(sy*100+sx)*4);
 }
 assert.deepEqual(nativeSceneIconShapes(fixtureIcon(image),'unused','parent',image),[]);
 assert.throws(()=>nativeSceneIconShapes(fixtureIcon(image),'unused','parent',{...image,rgba:Buffer.alloc(1)}),TypeError);
});

test('sparse representation follows source isolation in final and preflight, including text collision',t=>{
 const {compileSceneIcon}=require('../packages/slideclone-core/source-scene-native-icon');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-sparse-stage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image=lineArtFixture(400,400);
 for(let y=10;y<12;y++)for(let x=30;x<50;x++)image.rgba.fill(0,(y*400+x)*4,(y*400+x)*4+4);
 for(let i=0;i<image.width*image.height;i++)if(!image.rgba[i*4+3])image.rgba.set([255,255,255,255],i*4);
 const input={image,box:{x:10,y:10,w:60,h:60},id:'child',regionId:'region',root,slideSize:{widthPt:400,heightPt:400},textBoxes:[],budget:{used:0}};
 const options={preflight:true,nativePictorial:true,parentObjectId:'object-parent'};
 const preview=compileSceneIcon(input,options);assert.equal(preview.failure,null);assert.ok(preview.shapes.length);
 assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const final=compileSceneIcon({...input,budget:{used:0}},{...options,preflight:false});assert.equal(final.failure,null);assert.deepEqual(final.shapes,preview.shapes);
 const collision={...input,budget:{used:0},textBoxes:[{text:'unrelated content',box:{x:10,y:10,w:5,h:5}}]};
 assert.deepEqual(compileSceneIcon(collision,options),{icon:null,shapes:[],failure:'icon-isolation',detailCode:'icon-source-text'});
});
