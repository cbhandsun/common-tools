'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {captureSourceCropRegistrations:capture,registerSourceCrop:register,readRegisteredSourceCrop:read}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
const {cropPng,readPng,writePng}=require('../packages/slideclone-core/png');
const {pxToPtBox}=require('../packages/slideclone-core/scene-plan/raster-native-detection');
const {eraseObjectifiedLayerPrimitives:erase}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {sourceCropBoxForWrite:windowForWrite}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
const {registerDerivedSourceCrop:derive,readRegisteredSourceCropSnapshot:snapshot}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-crop-registration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const source={width:1086,height:1448,rgba:Buffer.alloc(1086*1448*4,255)},slide={widthPt:960,heightPt:1280},px={x:13,y:577,w:403,h:193};
 for(let y=577;y<770;y++)for(let x=13;x<416;x++)source.rgba.set([x%251,y%251,(x+y)%251,255],(y*1086+x)*4);
 const box=pxToPtBox(px,source,slide,0),file=path.join(root,'assets/crop.png'),crop=cropPng(source,px);writePng(file,crop);
 const item={id:'old-crop',assetPath:'assets/crop.png',box,source:{nativeRebuild:true,visualAtomObjectified:true,layer:{layerType:'diagram-zone',recommendedAction:'split-native-with-residual-crop'}}};
 return {root,source,slide,px,file,crop,item};
}
test('primitive erasure preserves the exact producer sampling window across rounded slide coordinates',t=>{
 const f=fixture(t),pixels=Buffer.from(f.source.rgba);
 const result=capture(f.source,f.root,f.slide,()=>{
  assert.equal(register(f.source,f.px,f.file,f.crop,f.item.box),true);
  erase({page:{images:[f.item]},sourceImage:f.source,slideSize:f.slide,irDir:f.root,
   primitiveShapes:[{type:'line',box:{x:100,y:550,w:50,h:0},source:{layerSourceId:f.item.id,detector:'visual-atom-native-connector'}}]});
 });
 const actual=readPng(f.file);assert.equal(actual.width,403);assert.equal(actual.height,193);
 assert.deepEqual(Array.from(actual.rgba.subarray(0,4)),Array.from(f.crop.rgba.subarray(0,4)));
 assert.deepEqual(read(result.token,f.source,f.root,f.file,f.item.box,actual),f.px);assert.deepEqual(f.source.rgba,pixels);
});
test('capture validates controls, restores nested and failed scopes, and never admits serialized provenance',t=>{
 const f=fixture(t);
 for(const [image,root,slide,build] of [[null,f.root,f.slide,()=>{}],[f.source,'relative',f.slide,()=>{}],
  [f.source,f.root,{widthPt:0,heightPt:1280},()=>{}],[f.source,f.root,f.slide,null]])assert.throws(()=>capture(image,root,slide,build),TypeError);
 let calls=0;const unsafe={...f.source};Object.defineProperty(unsafe,'rgba',{get(){calls++;throw Error('private');}});
 assert.throws(()=>capture(unsafe,f.root,f.slide,()=>{}),TypeError);assert.equal(calls,0);
 assert.equal(register(f.source,f.px,f.file,f.crop,f.item.box),false);
 assert.throws(()=>capture(f.source,f.root,f.slide,()=>Promise.resolve()),TypeError);
 assert.throws(()=>capture(f.source,f.root,f.slide,()=>{throw new Error('fixture failure');}),/fixture failure/);
 assert.equal(register(f.source,f.px,f.file,f.crop,f.item.box),false);
 const outer=capture(f.source,f.root,f.slide,()=>{
  const inner=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
  assert.deepEqual(read(inner.token,f.source,f.root,f.file,f.item.box,f.crop),f.px);
  assert.equal(windowForWrite(f.source,f.file,f.item.box),null);
  assert.equal(register(f.source,f.px,f.file,f.crop,f.item.box),true);
  const found=windowForWrite(f.source,f.file,f.item.box);assert.deepEqual(found,f.px);found.x++;
  assert.deepEqual(windowForWrite(f.source,f.file,f.item.box),f.px);
 });
 assert.deepEqual(read(outer.token,f.source,f.root,f.file,f.item.box,f.crop),f.px);
 assert.equal(windowForWrite(f.source,f.file,f.item.box),null);
});
test('invalid crop inputs and missing assets fail without granting a registration',t=>{
 const f=fixture(t);
 capture(f.source,f.root,f.slide,()=>{
  for(const px of [null,{}, {...f.px,x:-1},{...f.px,x:13.5},{...f.px,w:Infinity},{...f.px,w:2000}]){
   assert.throws(()=>register(f.source,px,f.file,f.crop,f.item.box),TypeError);
  }
  assert.throws(()=>register(f.source,f.px,f.file,{...f.crop,rgba:Buffer.alloc(1)},f.item.box),TypeError);
  assert.equal(register(f.source,f.px,f.file,f.crop,{...f.item.box,w:f.item.box.w+1}),false);
  assert.equal(register({...f.source,rgba:Buffer.alloc(f.source.rgba.length)},f.px,f.file,f.crop,f.item.box),false);
  assert.equal(register(f.source,f.px,path.join(f.root,'outside.png'),f.crop,f.item.box),false);
  assert.equal(register(f.source,f.px,'assets/crop.png',f.crop,f.item.box),false);
  assert.throws(()=>register(f.source,f.px,path.join(f.root,'assets/missing.png'),f.crop,f.item.box),{code:'ENOENT'});
 });
});
test('file contents and path identity are checked again at rewrite boundaries',t=>{
 const f=fixture(t);
 const result=capture(f.source,f.root,f.slide,()=>{
  assert.equal(register(f.source,f.px,f.file,f.crop,f.item.box),true);
  const altered={...f.crop,rgba:Buffer.from(f.crop.rgba)};altered.rgba[0]++;
  writePng(f.file,altered);assert.equal(windowForWrite(f.source,f.file,f.item.box),null);
  writePng(f.file,f.crop);
 });
 const other=fs.mkdtempSync(path.join(os.tmpdir(),'source-crop-outside-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));
 const external=path.join(other,'crop.png');writePng(external,f.crop);
 const alias=path.join(f.root,'assets','alias');fs.symlinkSync(other,alias,'junction');
 assert.equal(read(result.token,f.source,other,f.file,f.item.box,f.crop),null);
 assert.equal(read(result.token,f.source,f.root,path.join(alias,'crop.png'),f.item.box,f.crop),null);
 capture(f.source,f.root,f.slide,()=>assert.equal(register(f.source,f.px,path.join(alias,'crop.png'),f.crop,f.item.box),false));
 fs.unlinkSync(f.file);assert.throws(()=>read(result.token,f.source,f.root,f.file,f.item.box,f.crop),{code:'ENOENT'});
});
test('optional registration caps total crop work and leaves oversized legitimate crops supported',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-crop-capacity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const image={width:513,height:512,rgba:Buffer.alloc(513*512*4,255)},slide={widthPt:513,heightPt:512},pixels={x:0,y:0,w:512,h:512},crop=cropPng(image,pixels);
 const tooBig=path.join(root,'assets/large.png');writePng(tooBig,image);
 capture(image,root,slide,()=>{
  assert.equal(register(image,{x:0,y:0,w:513,h:512},tooBig,image,{x:0,y:0,w:513,h:512}),false);
  for(let i=0;i<16;i++){
   const file=path.join(root,'assets',i+'.png');writePng(file,crop);
   assert.equal(register(image,pixels,file,crop,pixels),i<15);
  }
  assert.equal(register(image,pixels,path.join(root,'assets/0.png'),crop,pixels),true,'rewrites do not consume the budget twice');
 });
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-crop-registration.test.js'));
});
test('private registrations survive metadata copies but reject changed source, placement, pixels and serialized tokens',t=>{
 const f=fixture(t),result=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));assert.equal(result.result,true);
 assert.deepEqual(read(result.token,{...f.source,rgba:Buffer.from(f.source.rgba)},f.root,f.file,{...f.item.box},f.crop),f.px);
 for(const mode of ['token','source','box','asset']){
  const token=mode==='token'?structuredClone(result.token):result.token,source={...f.source,rgba:Buffer.from(f.source.rgba)},crop={...f.crop,rgba:Buffer.from(f.crop.rgba)},box={...f.item.box};
  if(mode==='source')source.rgba[0]--;if(mode==='box')box.x++;if(mode==='asset')crop.rgba[0]++;
  assert.equal(read(token,source,f.root,f.file,box,crop),null,mode);
 }
});

test('private registrations reject stale caller pixels when the actual captured file changes',t=>{
 const f=fixture(t),captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 const sourceBefore=Buffer.from(f.source.rgba),cropBefore=Buffer.from(f.crop.rgba);
 for(const mode of ['rgb','alpha','dimensions']){
  const actual=mode==='dimensions'?cropPng(f.source,{...f.px,w:f.px.w-1}):{...f.crop,rgba:Buffer.from(f.crop.rgba)};
  if(mode==='rgb')actual.rgba[0]^=1;
  if(mode==='alpha')actual.rgba[3]=0;
  writePng(f.file,actual);
  assert.equal(read(captured.token,f.source,f.root,f.file,f.item.box,f.crop),null,mode+' must not trust the stale in-memory crop');
  writePng(f.file,f.crop);
  assert.deepEqual(read(captured.token,f.source,f.root,f.file,f.item.box,f.crop),f.px,'restored pixels remain eligible');
 }
 assert.deepEqual(f.source.rgba,sourceBefore);assert.deepEqual(f.crop.rgba,cropBefore);
});

test('private registration reads preserve bounded PNG failures rather than issuing a stale registration',t=>{
 const f=fixture(t),captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 for(const bytes of [Buffer.alloc(0),Buffer.from('invalid captured PNG'),Buffer.alloc(12*1024*1024+1)]){
  fs.writeFileSync(f.file,bytes);
  assert.throws(()=>read(captured.token,f.source,f.root,f.file,f.item.box,f.crop));
 }
 writePng(f.file,f.crop);assert.deepEqual(read(captured.token,f.source,f.root,f.file,f.item.box,f.crop),f.px);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});

test('alpha-only descendants preserve exact crop windows and all ancestors without granting erased paint',t=>{
 const f=fixture(t),captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 const before=fs.readFileSync(f.file),pixels=Buffer.from(f.source.rgba),first=path.join(f.root,'assets/first.png'),second=path.join(f.root,'assets/second.png');
 const a={...f.crop,rgba:Buffer.from(f.crop.rgba)};a.rgba[3]=0;writePng(first,a);
 assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,first),true);
 const b={...a,rgba:Buffer.from(a.rgba)};b.rgba[7]=0;writePng(second,b);
 assert.equal(derive(captured.token,f.source,f.root,first,{...f.item.box},second),true);
 for(const [file,crop]of [[f.file,f.crop],[first,a],[second,b]])assert.deepEqual(read(captured.token,f.source,f.root,file,f.item.box,crop),f.px);
 const detached=snapshot(captured.token,f.source,f.root,second,f.item.box);detached.pixelBox.x++;detached.raster.rgba[0]^=1;
 assert.deepEqual(read(captured.token,f.source,f.root,second,f.item.box,b),f.px);
 assert.equal(derive(captured.token,f.source,f.root,second,f.item.box,f.file),false,'ancestors cannot be rebound');
 assert.equal(derive(captured.token,f.source,f.root,first,f.item.box,first),false,'self registration is not a descendant');
 assert.deepEqual(fs.readFileSync(f.file),before);assert.deepEqual(f.source.rgba,pixels);
});

test('descendants reject RGB changes, partial alpha changes, added opacity and new dimensions',t=>{
 const f=fixture(t);f.crop.rgba[3]=0;f.crop.rgba[7]=127;writePng(f.file,f.crop);
 const captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 const file=path.join(f.root,'assets/derived.png');
 for(const mode of ['red','green','blue','partial','opacity','dimensions']){
  const next=mode==='dimensions'?cropPng(f.source,{...f.px,w:f.px.w-1}):{...f.crop,rgba:Buffer.from(f.crop.rgba)};
  if(mode==='red')next.rgba[0]^=1;if(mode==='green')next.rgba[1]^=1;if(mode==='blue')next.rgba[2]^=1;
  if(mode==='partial')next.rgba[7]=126;if(mode==='opacity')next.rgba[3]=255;writePng(file,next);
  assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,file),false,mode);
  assert.equal(snapshot(captured.token,f.source,f.root,file,f.item.box),null,mode+' must not create provenance');
 }
 const next={...f.crop,rgba:Buffer.from(f.crop.rgba)};next.rgba[7]=0;writePng(file,next);
 assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,file),true,'partially transparent source may only become fully transparent');
});

test('descendants reject forged sessions, changed sources, moves, scaling, copied assets and unsafe paths',t=>{
 const f=fixture(t),captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 const next=path.join(f.root,'assets/next.png');writePng(next,f.crop);
 const source={...f.source,rgba:Buffer.from(f.source.rgba)};source.rgba[0]^=1;
 const copied=path.join(f.root,'assets/copy.png');writePng(copied,f.crop);
 for(const [token,image,old,box]of [[{},f.source,f.file,f.item.box],[null,f.source,f.file,f.item.box],
  [captured.token,source,f.file,f.item.box],[captured.token,f.source,copied,f.item.box],
  [captured.token,f.source,f.file,{...f.item.box,x:f.item.box.x+.001}],
  [captured.token,f.source,f.file,{...f.item.box,w:f.item.box.w+.001}]]){
  assert.equal(derive(token,image,f.root,old,box,next),false);
 }
 for(const file of ['relative.png',path.join(f.root,'outside.png'),'x\0.png'])assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,file),false);
 const external=fs.mkdtempSync(path.join(os.tmpdir(),'crop-derive-outside-'));t.after(()=>fs.rmSync(external,{recursive:true,force:true}));
 writePng(path.join(external,'next.png'),f.crop);const alias=path.join(f.root,'assets/alias');fs.symlinkSync(external,alias,'junction');
 assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,path.join(alias,'next.png')),false);
 assert.equal(snapshot(captured.token,f.source,f.root,next,f.item.box),null);
});

test('missing, invalid and stale descendant files retain bounded failures and original identity',t=>{
 const f=fixture(t),captured=capture(f.source,f.root,f.slide,()=>register(f.source,f.px,f.file,f.crop,f.item.box));
 const next=path.join(f.root,'assets/next.png');
 assert.throws(()=>derive(captured.token,f.source,f.root,f.file,f.item.box,next),{code:'ENOENT'});
 for(const bytes of [Buffer.alloc(0),Buffer.from('invalid'),Buffer.alloc(12*1024*1024+1)]){
  fs.writeFileSync(next,bytes);assert.throws(()=>derive(captured.token,f.source,f.root,f.file,f.item.box,next));
 }
 writePng(next,f.crop);const changed={...f.crop,rgba:Buffer.from(f.crop.rgba)};changed.rgba[0]^=1;writePng(f.file,changed);
 assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,next),false);
 writePng(f.file,f.crop);assert.equal(derive(captured.token,f.source,f.root,f.file,f.item.box,next),true);
 writePng(next,changed);assert.equal(snapshot(captured.token,f.source,f.root,next,f.item.box),null);
 assert.deepEqual(read(captured.token,f.source,f.root,f.file,f.item.box,f.crop),f.px);
});

test('descendants share the original registration capacity and cannot replace an existing independent window',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crop-derive-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const image={width:512,height:512,rgba:Buffer.alloc(512*512*4,255)},box={x:0,y:0,w:512,h:512},slide={widthPt:512,heightPt:512};
 const files=Array.from({length:16},(_,i)=>path.join(root,'assets',i+'.png'));for(const file of files)writePng(file,image);
 const captured=capture(image,root,slide,()=>{for(const file of files.slice(0,15))assert.equal(register(image,box,file,image,box),true);});
 assert.equal(derive(captured.token,image,root,files[0],box,files[15]),false,'descendants do not get a fresh 4M budget');
 assert.equal(snapshot(captured.token,image,root,files[15],box),null);
 for(const file of files.slice(0,15))assert.deepEqual(read(captured.token,image,root,file,box,image),box);
 assert.equal(derive(captured.token,image,root,files[0],box,files[1]),false);
});
