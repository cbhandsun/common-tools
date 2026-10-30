'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const repo=path.resolve(__dirname,'..'),core=file=>require(path.join(repo,'packages/slideclone-core',file));
const {sourceSharedOutputFixture}=require(path.join(repo,'test/helpers/source-shared-output.cjs'));
const {captureSourceCropRegistrations:capture,registerSourceCrop:register}=core('scene-plan/source-crop-registration');
const {replaceMeasuredSceneConnectors:replace}=core('scene-plan/source-scene-replaced-connectors');
const {eraseRegisteredConnectorPixels:erase}=core('scene-plan/source-crop-connector-erasure');
const {measuredSharedSceneRoutePaintGroups:read}=core('routing/source-shared-route-compiler');
const {cropPng,writePng,readPng}=core('png');
const {pxToPtBox}=core('scene-plan/raster-native-detection');
function setup(t){
 const f=sourceSharedOutputFixture(),slideSize={widthPt:300,heightPt:230},window={x:20,y:40,w:260,h:140};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-crop-erasure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const raster=cropPng(f.image,window),file=path.join(root,'assets/crop.png');writePng(file,raster);
 const item={id:'registered-underlay',assetPath:'assets/crop.png',box:pxToPtBox(window,f.image,slideSize),source:{nativeRebuild:true}};
 const captured=capture(f.image,root,slideSize,()=>register(f.image,window,file,raster,item.box));assert.equal(captured.result,true);
 return {...f,root,file,raster,item,window,slideSize,sourceCropSession:captured.token,images:[item],previous:[],protectedMembers:new Set()};
}
test('registered local underlay erases the complete privately measured shared component and preserves all other RGBA',t=>{
 const f=setup(t),source=Buffer.from(f.image.rgba),old=fs.readFileSync(f.file),before=structuredClone(f.item),cells=read(f.image,f.shapes,{checks:0})[0].cells;
 const result=replace(f);assert.equal(result.erasedImages.length,1);assert.deepEqual(result.removedImages,[]);
 assert.notEqual(f.images[0].assetPath,f.item.assetPath);const output=readPng(path.join(f.root,f.images[0].assetPath));let count=0;
 for(let n=0;n<output.width*output.height;n++){
  const cell=(f.window.y+Math.floor(n/output.width))*f.image.width+f.window.x+n%output.width;
  assert.ok(output.rgba.subarray(n*4,n*4+3).equals(f.raster.rgba.subarray(n*4,n*4+3)));
  if(cells.has(cell)){assert.equal(output.rgba[n*4+3],0);count++;}else assert.equal(output.rgba[n*4+3],f.raster.rgba[n*4+3]);
 }
 assert.ok(count>100);assert.equal(result.erasedImages[0].erasedPixels,count);assert.equal(result.erasedImages[0].replacementIds.length,1);
 assert.deepEqual(f.image.rgba,source);assert.deepEqual(fs.readFileSync(f.file),old);assert.deepEqual(f.item,before);
});
test('shared crop erasure requires original source, complete unchanged real output and crop registration',t=>{
 for(const mode of ['no-token','token-copy','member-copy','missing-member','empty','duplicate','style','endpoint','source','box','asset-bytes','unregistered','protected']){
  const f=setup(t),old=fs.readFileSync(f.file),member=f.built.parts[0];
  if(mode==='no-token')delete f.sourceCropSession;if(mode==='token-copy')f.sourceCropSession={};
  if(mode==='member-copy')f.shapes=f.shapes.map(row=>row===member?structuredClone(row):row);
  if(mode==='missing-member')f.shapes=f.shapes.filter(row=>row!==member);
  if(mode==='empty')f.shapes=[];
  if(mode==='duplicate')f.shapes.push(member);
  if(mode==='style')member.style.stroke='#ABCDEF';
  if(mode==='endpoint')f.bodies[0].box.x+=1;
  if(mode==='source')f.image.rgba[0]^=1;
  if(mode==='box')f.item.box.x+=1;
  if(mode==='asset-bytes'){f.raster.rgba[0]^=1;writePng(f.file,f.raster);}
  if(mode==='unregistered'){fs.copyFileSync(f.file,path.join(f.root,'assets/uncaptured.png'));f.item.assetPath='assets/uncaptured.png';}
  if(mode==='protected')f.protectedMembers.add(f.item);
  const bytesBefore=fs.readFileSync(f.file);
  assert.deepEqual(replace(f).erasedImages,[],mode);assert.equal(f.images[0],f.item,mode);assert.deepEqual(fs.readFileSync(f.file),bytesBefore,mode);
  if(mode!=='asset-bytes')assert.deepEqual(fs.readFileSync(f.file),old,mode);
 }
});

test('shared crop erasure regression is discovered by the unified CI unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(repo,suite).some(row=>row.file.replaceAll('\\','/')==='test/source-shared-crop-erasure.test.js'));
});
test('shared crop work exhaustion produces no derivative or partial publication',t=>{
 const f=setup(t),old=fs.readFileSync(f.file),files=fs.readdirSync(path.join(f.root,'assets'));
 for(const checks of [4000000,3999999]){
  assert.equal(erase({token:f.sourceCropSession,image:f.image,root:f.root,file:f.file,item:f.item,raster:f.raster,shapes:f.shapes,work:{checks}}),null);
  assert.deepEqual(fs.readdirSync(path.join(f.root,'assets')),files);assert.deepEqual(fs.readFileSync(f.file),old);
 }
});
test('changed texels and already transparent shared cells are preserved exactly',t=>{
 const f=setup(t),cells=read(f.image,f.shapes,{checks:0})[0].cells,offsets=[];
 for(const cell of cells){const x=cell%f.image.width-f.window.x,y=Math.floor(cell/f.image.width)-f.window.y;
  if(x>=0&&x<f.window.w&&y>=0&&y<f.window.h)offsets.push((y*f.raster.width+x)*4);}
 assert.ok(offsets.length>4);f.raster.rgba[offsets[0]+3]=0;f.raster.rgba[offsets[1]]=255;writePng(f.file,f.raster);
 const captured=capture(f.image,f.root,f.slideSize,()=>register(f.image,f.window,f.file,f.raster,f.item.box));f.sourceCropSession=captured.token;
 const result=replace(f);assert.equal(result.erasedImages[0]?.erasedPixels,offsets.length-2);
 const output=readPng(path.join(f.root,f.images[0].assetPath));assert.equal(output.rgba[offsets[0]+3],0);
 assert.equal(output.rgba[offsets[1]+3],255);assert.equal(output.rgba[offsets[1]],255);
});
