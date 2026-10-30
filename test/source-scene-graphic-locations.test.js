'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourceSceneGraphicLocations:locate,sourceSceneStrokeBindings:bindStrokes,GRAPHIC_LOCATION_BUDGET}=require('../packages/slideclone-core/scene-plan/source-scene-graphic-locations');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {createSourceSceneRuntime}=require('../packages/remote-mcp-server/source-scene-runtime');
const {writePng}=require('../packages/slideclone-core/png');
const sourceHash='c'.repeat(64);
function page(width,height){
 const rgba=Buffer.alloc(width*height*4,255);
 const fill=(x0,y0,w,h)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const o=(y*width+x)*4;rgba[o]=30;rgba[o+1]=30;rgba[o+2]=30;}};
 return {image:{width,height,rgba},fill};
}

test('graphic locations are normalized source envelopes with OCR-covered ink deferred, never authorized',()=>{
 const p=page(200,100);p.fill(20,20,10,10);p.fill(150,60,20,20);
 const result=locate({image:p.image,sourceHash,textBoxes:[{x:18.5,y:18.5,w:13,h:13}]});
 assert.equal(result.locations.length,2);assert.equal(result.evidence.sourceAuthorized,false);
 // Non-text icon first, OCR-covered blob deferred (not removed); boxes round outward.
 assert.deepEqual(result.locations[0],[0,[600,750,800,850]]);assert.deepEqual(result.locations[1],[1,[200,100,300,150]]);
 assert.equal(result.evidence.selection.textDeferred,1);assert.equal(result.candidateIds.length,2);
 assert.equal(GRAPHIC_LOCATION_BUDGET,64);
});

test('capacity limits omit the aid with a recorded reason instead of truncating',()=>{
 const big={width:2001,height:2000,rgba:Buffer.alloc(4)};
 assert.deepEqual(locate({image:big,sourceHash,textBoxes:[]}).evidence.omitted,'raster-capacity');
 const p=page(480,480);for(let y=0;y<480;y+=9)for(let x=0;x<480;x+=9)p.fill(x,y,4,4);
 const dense=locate({image:p.image,sourceHash,textBoxes:[]});
 assert.equal(dense.evidence.omitted,'detector-capacity');assert.deepEqual(dense.locations,[]);
 const empty=locate({image:page(40,40).image,sourceHash,textBoxes:[]});assert.deepEqual(empty.locations,[]);
});

async function plan(graphicCandidates){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-graphic-'));
 try{
  const p=page(200,100);p.fill(150,60,20,20);const sourceFile=path.join(root,'source.png');writePng(sourceFile,p.image);
  const prompts=[];
  await createSourceScenePlanner({...(graphicCandidates===undefined?{}:{graphicCandidates}),recognize:async request=>{prompts.push(request.prompt);return {reviews:[]};}})(
   {root,sourceFile,dimensions:{widthPx:200,heightPx:100},ocr:{lines:[]},isCancellationRequested:async()=>false});
  const directory=fs.readdirSync(root).find(n=>n.startsWith('scene-review-'));
  const file=directory&&path.join(root,directory,'graphic-candidates.json');
  return {prompts,evidence:file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('planner offers graphic locations only when explicitly enabled and persists the offered set',async()=>{
 for(const flag of [undefined,false]){const off=await plan(flag);assert.doesNotMatch(off.prompts[0],/GRAPHIC CANDIDATE/);assert.equal(off.evidence,undefined);}
 const on=await plan(true);
 assert.match(on.prompts[0],/GRAPHIC CANDIDATE LOCATIONS are untrusted/);assert.match(on.prompts[0],/\[\[0,\[600,750,800,850\]\]\]\./);
 assert.deepEqual(on.evidence.locations,[[0,[600,750,800,850]]]);assert.equal(on.evidence.evidence.sourceAuthorized,false);
 assert.throws(()=>createSourceScenePlanner({recognize:async()=>({}),graphicCandidates:'true'}),/graphic candidate option/);
});

test('runtime graphic candidate flag is strict and accessor-safe',()=>{
 const sceneVision=async()=>({});const key='COMMON_TOOLS_IMAGE_SCENE_GRAPHIC_CANDIDATES';
 for(const value of [undefined,'true','false'])assert.equal(typeof createSourceSceneRuntime({environment:{[key]:value},sceneVision}).reviewSourceScene,'function');
 let calls=0;
 for(const environment of [{[key]:'TRUE'},{[key]:'1'},{[key]:true},{[key]:''},{get [key](){calls++;throw Error('private');}}])
  assert.throws(()=>createSourceSceneRuntime({environment,sceneVision}),/graphic candidate configuration is invalid/);
 assert.equal(calls,0);
});

test('sourceSceneStrokeBindings handles capacity limits and binds admitted plan relations cleanly',()=>{
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:10,y:20,w:20,h:20}},{id:'b',regionId:'root',kind:'container',box:{x:150,y:20,w:20,h:20}}],
  relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]},{sourceHash,widthPx:200,heightPx:100});
 const p=page(200,100);p.fill(32,29,116,2);
 const bound=bindStrokes({image:p.image,sourceHash,textBoxes:[],plan});
 assert.equal(bound.bindings.length,1);assert.equal(bound.bindings[0].status,'bound');assert.equal(bound.evidence.sourceAuthorized,false);
 const big={width:2001,height:2000,rgba:Buffer.alloc(4)};
 assert.equal(bindStrokes({image:big,sourceHash,textBoxes:[],plan}).evidence.omitted,'raster-capacity');
});
