'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {coveredFixture}=require('./helpers/source-directed-dashes.cjs');
const {measureSourceSceneVisibleGap:measure}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile,measuredSceneVisibleGapPaint:paint}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {captureSourceCropRegistrations:capture,registerSourceCrop:register}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
const {replaceMeasuredSceneConnectors:replace}=require('../packages/slideclone-core/scene-plan/source-scene-replaced-connectors');
const {eraseRegisteredConnectorPixels:erase}=require('../packages/slideclone-core/scene-plan/source-crop-connector-erasure');
const {cropPng,writePng,readPng}=require('../packages/slideclone-core/png');
const {pxToPtBox}=require('../packages/slideclone-core/scene-plan/raster-native-detection');
function setup(t,vertical=false){
 const f=coveredFixture(vertical),fit=measure(f).fit;assert.ok(fit);
 const slideSize={widthPt:960,heightPt:720};
 const line=compile({fit,relation:{id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'},
  fromId:f.from.id,toId:f.to.id,width:240,height:180,slideSize});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-crop-erasure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const window=vertical?{x:70,y:90,w:41,h:45}:{x:140,y:40,w:45,h:41},raster=cropPng(f.image,window),file=path.join(root,'assets/crop.png');writePng(file,raster);
 const item={id:'crop',assetPath:'assets/crop.png',box:pxToPtBox(window,f.image,slideSize),source:{nativeRebuild:true}};
 const result=capture(f.image,root,slideSize,()=>register(f.image,window,file,raster,item.box));assert.equal(result.result,true);
 return {...f,root,file,raster,item,window,line,slideSize,sourceCropSession:result.token,
  images:[item],shapes:[line],previous:[],protectedMembers:new Set()};
}
test('a partially overlapping registered crop erases exact privately owned texels and preserves every other cell',t=>{
 for(const vertical of [false,true]){
  const f=setup(t,vertical),bytes=fs.readFileSync(f.file),source=Buffer.from(f.image.rgba),before=structuredClone(f.item),cells=paint(f.image,f.line);
  const result=replace(f);assert.equal(result.erasedImages.length,1);assert.deepEqual(result.removedImages,[]);
  const actual=f.images[0];assert.deepEqual({...actual,assetPath:before.assetPath},before);assert.notEqual(actual.assetPath,before.assetPath);
  const raster=readPng(path.join(f.root,actual.assetPath));let count=0,untouched=0;
  for(let n=0;n<raster.width*raster.height;n++){
   const cell=(f.window.y+Math.floor(n/raster.width))*f.image.width+f.window.x+n%raster.width;
   assert.deepEqual(raster.rgba.subarray(n*4,n*4+3),f.raster.rgba.subarray(n*4,n*4+3));
   if(cells.has(cell)){assert.equal(raster.rgba[n*4+3],0);count++;}
   else{assert.equal(raster.rgba[n*4+3],f.raster.rgba[n*4+3]);untouched++;}
  }
  assert.ok(count>0);assert.ok(untouched>count);assert.equal(result.erasedImages[0].erasedPixels,count);
  assert.deepEqual(result.erasedImages[0].replacementIds,[f.line.id]);
  assert.deepEqual(fs.readFileSync(f.file),bytes);assert.deepEqual(f.image.rgba,source);assert.deepEqual(f.item,before);
  assert.deepEqual(replace(f).erasedImages,[],'a registered derivative has no remaining owned connector texels');
  const {readRegisteredSourceCropSnapshot:read}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
  assert.deepEqual(read(f.sourceCropSession,f.image,f.root,path.join(f.root,actual.assetPath),actual.box).pixelBox,f.window);
  assert.deepEqual(read(f.sourceCropSession,f.image,f.root,f.file,f.item.box).raster.rgba,f.raster.rgba);
 }
});
test('public metadata, changed receipts, changed sampling and protected images cannot authorize pixel erasure',t=>{
 for(const mode of ['no-token','token-copy','shape-copy','shape-edit','source','pixels','placement','scaled','style','protected','referenced','minimum','unregistered']){
  const f=setup(t),bytes=fs.readFileSync(f.file);
  if(mode==='no-token')delete f.sourceCropSession;if(mode==='token-copy')f.sourceCropSession=structuredClone(f.sourceCropSession);
  if(mode==='shape-copy')f.shapes=[structuredClone(f.line)];if(mode==='shape-edit')f.line.source.sceneRelationId='other';
  if(mode==='source')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  if(mode==='pixels'){const crop={...f.raster,rgba:Buffer.from(f.raster.rgba)};crop.rgba[0]++;writePng(f.file,crop);}
  if(mode==='placement')f.item.box.x++;if(mode==='scaled')f.item.box.h++;
  if(mode==='style')f.item.style={opacity:.8};if(mode==='protected')f.protectedMembers.add(f.item);
  if(mode==='referenced')f.line.style.startAnchor.elementId=f.item.id;if(mode==='minimum')f.item.source.protectedMinimumUnit=true;
  if(mode==='unregistered'){fs.copyFileSync(f.file,path.join(f.root,'assets/copy.png'));f.item.assetPath='assets/copy.png';}
  assert.deepEqual(replace(f).erasedImages,[],mode);assert.strictEqual(f.images[0],f.item,mode);
  if(mode!=='pixels')assert.deepEqual(fs.readFileSync(f.file),bytes,mode);
 }
});
test('previously erased and recolored cells stay untouched, and the existing work budget fails atomically',t=>{
 const f=setup(t),cells=paint(f.image,f.line),local=[];
 for(const cell of cells){const x=cell%240-f.window.x,y=Math.floor(cell/240)-f.window.y;if(x>=0&&x<f.window.w&&y>=0&&y<f.window.h)local.push((y*f.raster.width+x)*4);}
 assert.ok(local.length>3);f.raster.rgba[local[0]+3]=0;f.raster.rgba[local[1]]=255;f.raster.rgba[local[2]+3]=127;writePng(f.file,f.raster);
 const captured=capture(f.image,f.root,f.slideSize,()=>register(f.image,f.window,f.file,f.raster,f.item.box));f.sourceCropSession=captured.token;
 const original=fs.readFileSync(f.file),files=fs.readdirSync(path.join(f.root,'assets'));
 for(const checks of [4000000,3999999]){
  assert.equal(erase({token:captured.token,image:f.image,root:f.root,file:f.file,item:f.item,raster:f.raster,shapes:f.shapes,work:{checks}}),null);
  assert.deepEqual(fs.readdirSync(path.join(f.root,'assets')),files);assert.deepEqual(fs.readFileSync(f.file),original);
 }
 const result=replace(f),out=readPng(path.join(f.root,f.images[0].assetPath));
 assert.equal(result.erasedImages[0].erasedPixels,local.length-3);
 assert.equal(out.rgba[local[0]+3],0);assert.equal(out.rgba[local[1]+3],255);assert.equal(out.rgba[local[1]],255);
 assert.deepEqual(out.rgba.subarray(local[2],local[2]+4),f.raster.rgba.subarray(local[2],local[2]+4),'different alpha is generated paint, not an identical source texel');
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-crop-connector-erasure.test.js'));
});
test('asset publication failures propagate while the source, old asset and image placement remain intact',t=>{
 const f=setup(t),bytes=fs.readFileSync(f.file),pixels=Buffer.from(f.image.rgba),before=structuredClone(f.item),create=fs.mkdtempSync;
 const failure=Object.assign(new Error('fixture write failure'),{code:'EACCES'});
 try{
  fs.mkdtempSync=()=>{throw failure;};
  assert.throws(()=>replace(f),error=>error===failure);
 }finally{fs.mkdtempSync=create;}
 assert.deepEqual(f.images,[before]);assert.strictEqual(f.images[0],f.item);assert.deepEqual(f.image.rgba,pixels);assert.deepEqual(fs.readFileSync(f.file),bytes);
});

test('a full provenance budget rolls back a newly written crop and preserves the prior output',t=>{
 const f=setup(t),slide=f.slideSize,full={x:0,y:0,w:240,h:180},tail={x:0,y:0,w:240,h:98};
 const captured=capture(f.image,f.root,slide,()=>{
  assert.equal(register(f.image,f.window,f.file,f.raster,f.item.box),true);
  for(let i=0;i<92;i++){
   const file=path.join(f.root,'assets',`full-${i}.png`);writePng(file,f.image);
   assert.equal(register(f.image,full,file,f.image,pxToPtBox(full,f.image,slide,0)),true);
  }
  const file=path.join(f.root,'assets/tail.png'),raster=cropPng(f.image,tail);writePng(file,raster);
  assert.equal(register(f.image,tail,file,raster,pxToPtBox(tail,f.image,slide,0)),true);
 });
 f.sourceCropSession=captured.token;
 const files=fs.readdirSync(path.join(f.root,'assets')),bytes=fs.readFileSync(f.file),before=structuredClone(f.item);
 assert.deepEqual(replace(f).erasedImages,[]);
 assert.deepEqual(fs.readdirSync(path.join(f.root,'assets')),files,'no orphan descendant directory after capacity rejection');
 assert.deepEqual(fs.readFileSync(f.file),bytes);assert.deepEqual(f.images,[before]);assert.strictEqual(f.images[0],f.item);
});

test('a failed descendant PNG write leaves no new asset or changed image metadata',t=>{
 const f=setup(t),files=fs.readdirSync(path.join(f.root,'assets')),bytes=fs.readFileSync(f.file),before=structuredClone(f.item);
 const write=fs.writeFileSync,failure=Object.assign(new Error('fixture output failure'),{code:'ENOSPC'});
 try{fs.writeFileSync=()=>{throw failure;};assert.throws(()=>replace(f),error=>error===failure);}
 finally{fs.writeFileSync=write;}
 assert.deepEqual(fs.readdirSync(path.join(f.root,'assets')),files);assert.deepEqual(fs.readFileSync(f.file),bytes);
 assert.deepEqual(f.images,[before]);assert.strictEqual(f.images[0],f.item);
});
