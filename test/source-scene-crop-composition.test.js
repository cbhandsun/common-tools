'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');

async function compose(t,offset,residual){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crop-composition-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 const body={x:30+offset,y:30,w:180,h:170},icon={x:95+offset,y:115,w:38,h:38};
 const put=(x,y,c)=>image.rgba.set([...c,255],(y*400+x)*4);
 for(let y=body.y;y<body.y+body.h;y++)for(let x=body.x;x<body.x+body.w;x++)
  put(x,y,x<body.x+2||x>=body.x+body.w-2||y<body.y+2||y>=body.y+body.h-2?[20,60,100]:[230,240,250]);
 for(let y=icon.y;y<icon.y+icon.h;y++)for(let x=icon.x;x<icon.x+icon.w;x++)
  if(Math.hypot(x-icon.x-19,y-icon.y-19)<15)put(x,y,[200,40,80]);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:400,heightPx:300,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
  objects:[{id:'body',regionId:'region',kind:'container',box:body,pictorialContent:'present'},
   {id:'picture',regionId:'region',kind:'icon',parentObjectId:'body',box:icon}],relations:[]};
 let compilation,residualCalls=0;
 const rebuild=createRawImageNativeRebuilder({preserveLocalFidelityImages:true,
  reviewSourceScene:async request=>({plan,ocr:request.ocr,evidence:{},graphics:[]}),
  compileSourceScene:input=>{compilation=compileSourceScene(input);return compilation;},
  ...(residual?{createFullSlideResidual:async({objects,outputFile})=>{
   residualCalls++;writePng(outputFile,image);return {erasedObjects:objects.length};
  }}:{}),
  rebuildDeckFromWorkDir:work=>{
   const deck=JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));
   deck.pages[0].shapes=[];deck.pages[0].images=[];return deck;
  }});
 const result=await rebuild({root,metadata:{inputFile:sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:400,heightPx:300}},
  ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.ok(compilation);return {result,compilation,residualCalls};
}

test('raw composition retains measured picture membership with a later residual in distinct layouts',async t=>{
 for(const offset of [0,150]){
  const {result,compilation,residualCalls}=await compose(t,offset,true);
  assert.equal(residualCalls,1);assert.equal(compilation.evidence.assembledInteriorGroups,1);
  const picture=result.deck.pages[0].images.find(i=>i.id==='scene-icon-picture');
  assert.ok(picture);assert.equal(picture.source.nativeComponentGroupId,'scene-unit-body');
  assert.equal(picture.source.editable,false);
  assert.ok(result.deck.pages[0].images.some(i=>i.source?.fullSlideResidual));
 }
});

test('without a later residual the actual compiler assembles the measured card and its isolated picture',async t=>{
 for(const offset of [0,150]){
  const {compilation,residualCalls}=await compose(t,offset,false);
  assert.equal(residualCalls,0);
  assert.equal(compilation.evidence.assembledInteriorGroups,1);
  const picture=compilation.page.images.find(i=>i.id==='scene-icon-picture');
  assert.equal(picture.source.nativeComponentGroupId,'scene-unit-body');assert.equal(picture.source.editable,false);
 }
});

test('crop composition regressions are discovered by the unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.endsWith('source-scene-crop-composition.test.js')));
});
