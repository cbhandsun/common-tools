"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {writePng,readPng}=require('../packages/slideclone-core/png');
const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {compileSourceScene,preflightSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {admitSourcePictorialCrop}=require('../packages/slideclone-core/scene-plan/source-pictorial-crop-admission');
const {completeRegionPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
test('pictorial admission rejects unsafe inputs and preserves bounded dense assets',()=>{
 const raster={width:10,height:10,rgba:Buffer.alloc(400)},box={w:10,h:10},size={widthPt:100,heightPt:100};
 for(let y=1;y<9;y++)for(let x=1;x<9;x++)raster.rgba.set([10,20,30,255],(y*10+x)*4);
 assert.equal(admitSourcePictorialCrop(raster,box,size).tightCropAdmission.opaqueDensity,.64);
 assert.equal(admitSourcePictorialCrop({...raster,rgba:Buffer.alloc(400)},box,size),null);
 const edge=Buffer.from(raster.rgba);edge[3]=32;
 assert.equal(admitSourcePictorialCrop({...raster,rgba:edge},box,size),null);
 for(const invalid of [null,[],{w:'10',h:10},{w:NaN,h:10},{w:Infinity,h:10},{w:0,h:10},Object.create({w:10,h:10})])
  assert.throws(()=>admitSourcePictorialCrop(raster,invalid,size),TypeError);
 let touched=false;const getter={get w(){touched=true;return 10;},h:10};
 const proxy=new Proxy(box,{get(){touched=true;throw Error('unsafe read');}});
 for(const invalid of [getter,proxy])assert.throws(()=>admitSourcePictorialCrop(raster,invalid,size),TypeError);
 assert.equal(touched,false);
 assert.throws(()=>admitSourcePictorialCrop(raster,box,{widthPt:4001,heightPt:100}),TypeError);
 assert.throws(()=>admitSourcePictorialCrop({...raster,rgba:Buffer.alloc(399)},box,size),TypeError);
 assert.equal(admitSourcePictorialCrop(raster,{w:19,h:10},size),null);
 assert.equal(admitSourcePictorialCrop(raster,{w:5,h:10},size),null);
 assert.equal(admitSourcePictorialCrop({width:513,height:512,rgba:Buffer.alloc(513*512*4)},box,size),null);
});
test('region crop receipts require a unique surviving image and cannot repair unresolved ownership',()=>{
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:240,regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:240}}],objects:[{id:'icon',regionId:'root',kind:'icon',box:{x:90,y:70,w:34,h:34}}],relations:[],
  regionPrograms:[{regionId:'root',objects:['icon'],relations:[],labels:[]}]};
 const image={id:'crop',source:{sceneInventoryId:'icon'}};
 const input={plan,slideSize:{widthPt:240,heightPt:240},preflight:false,objects:new Map([['icon',['crop']]]),relations:new Map(),
  interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{rejected:[]}};
 const check=(images,shapes=[],extra={})=>completeRegionPrograms({...input,page:{images,shapes,textBoxes:[]},...extra}).evidence;
 assert.equal(check([image]).completed,1);
 for(const evidence of [check([]),check([image,image]),check([image],[{id:'crop'}]),check([image],[],{objects:new Map()}),check([image],[],{unresolved:[{id:'icon',reason:'source-ownership'}]})]){
  assert.equal(evidence.completed,0);assert.ok(evidence.rejected[0].missing.includes('icon'));
 }
});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-pictorial-crop-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:240,height:240,rgba:Buffer.alloc(240*240*4,255)};
 for(let y=70;y<104;y++)for(let x=90;x<124;x++)if(x<94||x>=120||y<74||y>=100)image.rgba.set([22,78,140,255],(y*240+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 return {root,image,sourceFile,request:{image,box:{x:90,y:70,w:34,h:34},id:'icon',regionId:'root',root,slideSize:{widthPt:240,heightPt:240},textBoxes:[],budget:{used:0}}};
}
test('pictorial source preference retains original color pixels and alpha at original resolution',t=>{
 const {root,image,request}=fixture(t),before=Buffer.from(image.rgba);
 const options={preflight:false,nativePictorial:true,parentObjectId:'',preferSourceCrop:true};
 const preflight=compileSceneIcon({...request,budget:{used:0}},{...options,preflight:true});
 assert.equal(preflight.failure,null);assert.deepEqual(preflight.shapes,[]);assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const result=compileSceneIcon(request,options);assert.equal(result.failure,null);assert.deepEqual(result.shapes,[]);
 assert.equal(result.icon.source.editable,false);assert.equal(result.icon.source.protectedMinimumUnit,true);
 const raster=readPng(path.join(root,result.icon.assetPath));assert.equal(raster.width,result.icon.box.w);assert.equal(raster.height,result.icon.box.h);
 let ink=0,transparent=0;for(let n=0;n<raster.width*raster.height;n++){
  const alpha=raster.rgba[n*4+3];if(alpha===0){transparent++;continue;}ink++;
  const sx=Math.round(result.icon.box.x)+n%raster.width,sy=Math.round(result.icon.box.y)+Math.floor(n/raster.width);
  assert.deepEqual([...raster.rgba.subarray(n*4,n*4+3)],[...image.rgba.subarray((sy*image.width+sx)*4,(sy*image.width+sx)*4+3)]);
 }
 assert.ok(ink>0&&transparent>0);assert.deepEqual(image.rgba,before);
 assert.throws(()=>compileSceneIcon({...request,id:'bad-control'},{...options,preferSourceCrop:'yes'}),TypeError);
});
test('source crop preference cannot rasterize a relation endpoint or bypass text and source isolation',t=>{
 const {root,request}=fixture(t),options={preflight:false,nativePictorial:true,parentObjectId:'',preferSourceCrop:true};
 const endpoint=compileSceneIcon({...request,budget:{used:0}},{...options,relationEndpoint:true});
 assert.ok(endpoint.shapes.length>0);assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const text=compileSceneIcon({...request,budget:{used:0},textBoxes:[{text:'label',box:{x:90,y:70,w:34,h:34}}]},options);
 assert.equal(text.failure,'icon-isolation');assert.equal(text.icon,null);assert.deepEqual(text.shapes,[]);
 const empty={...request.image,rgba:Buffer.alloc(240*240*4,255)};
 const absent=compileSceneIcon({...request,image:empty,budget:{used:0}},options);assert.equal(absent.icon,null);assert.deepEqual(absent.shapes,[]);
 assert.throws(()=>compileSceneIcon({...request,budget:{used:4000000}},options),RangeError);
});
test('composed scene records admitted crop identities and complete programs without pretending they are native paths',t=>{
 const {root,sourceFile}=fixture(t),sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan={version:1,sourceHash,widthPx:240,heightPx:240,regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:240}}],
  objects:[{id:'icon',regionId:'root',kind:'icon',box:{x:90,y:70,w:34,h:34}}],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:1,relations:0}],regionPrograms:[{regionId:'root',objects:['icon'],relations:[],labels:[]}]};
 const input={page:{shapes:[],textBoxes:[],images:[]},plan,sourceFile,root,slideSize:{widthPt:240,heightPt:240},pictorialMode:'source-crop'};
 const preflight=preflightSourceScene(input);assert.equal(preflight.evidence.regionPrograms.staged,1);assert.equal(fs.existsSync(path.join(root,'assets')),false);
 const result=compileSourceScene(input);assert.equal(result.page.images.length,1);assert.equal(result.page.shapes.length,0);assert.equal(result.evidence.regionPrograms.completed,1);
 const icon=result.page.images[0];assert.equal(icon.source.sceneInventoryId,'icon');assert.equal(icon.source.editable,false);
 assert.ok(fs.existsSync(path.join(root,icon.assetPath)));
 assert.throws(()=>compileSourceScene({...input,pictorialMode:'invalid'}),/pictorial mode/);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});
