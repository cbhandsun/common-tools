'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractSceneResidualCandidates:extract,RESIDUAL_CANDIDATE_CONSTANTS}=require('../packages/slideclone-core/scene-plan/source-scene-residual-candidates');
const sourceHash='d'.repeat(64);
function page(width,height){
 const rgba=new Uint8Array(width*height*4).fill(255);
 const fill=(x0,y0,w,h)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const o=(y*width+x)*4;rgba[o]=25;rgba[o+1]=35;rgba[o+2]=45;}};
 return {image:{width,height,rgba},fill};
}

test('extractSceneResidualCandidates filters owned and text-covered regions and proposes unowned residual ink',()=>{
 const p=page(200,100);
 p.fill(10,10,20,20); // owned native object
 p.fill(60,10,20,12); // covered by OCR text box
 p.fill(120,40,24,24); // unowned residual icon/graphic
 p.fill(170,80,4,4); // tiny speck (< 36px)
 const out=extract({image:p.image,sourceHash,ownedBoxes:[{x:8,y:8,w:24,h:24}],textBoxes:[{x:58,y:8,w:24,h:16}],round:0,budget:8});
 assert.equal(out.candidates.length,1);
 assert.deepEqual(out.candidates[0].box,{x:120,y:40,w:24,h:24});
 assert.equal(out.candidates[0].sourceAuthorized,false);
 assert.deepEqual(out.locations,[[0,[400,600,640,720]]]);
 assert.equal(out.evidence.round,0);
 assert.equal(out.evidence.nextRound,1);
 assert.equal(out.evidence.maxRounds,1);
 assert.equal(out.evidence.sourceAuthorized,false);
 assert.deepEqual(RESIDUAL_CANDIDATE_CONSTANTS,{MAX_RESIDUAL_ROUNDS:1,MIN_RESIDUAL_AREA_PX:36,OWNED_OVERLAP_RATIO:0.5});
});

test('bounded 1-round hard cap stops immediately at round >= 1 and capacity limits fail safe',()=>{
 const p=page(200,100);p.fill(120,40,24,24);
 const stopped=extract({image:p.image,sourceHash,ownedBoxes:[],textBoxes:[],round:1,budget:8});
 assert.deepEqual(stopped.candidates,[]);
 assert.deepEqual(stopped.locations,[]);
 assert.equal(stopped.evidence.stopped,'round-limit');
 assert.equal(stopped.evidence.sourceAuthorized,false);
 const big={width:2001,height:2000,rgba:new Uint8Array(4)};
 assert.equal(extract({image:big,sourceHash,ownedBoxes:[],textBoxes:[]}).evidence.omitted,'raster-capacity');
});

test('invalid inputs and proxies fail closed',()=>{
 const p=page(80,80);
 assert.throws(()=>extract({image:null,sourceHash,ownedBoxes:[],textBoxes:[]}),/image is invalid/);
 assert.throws(()=>extract({image:p.image,sourceHash:'bad',ownedBoxes:[],textBoxes:[]}),/sourceHash is invalid/);
 assert.throws(()=>extract({image:p.image,sourceHash,ownedBoxes:new Proxy([],{}),textBoxes:[]}),/ownedBoxes are invalid/);
 assert.throws(()=>extract({image:p.image,sourceHash,ownedBoxes:[],textBoxes:[{x:0,y:0,w:0,h:10}]}),/textBoxes are invalid/);
 assert.throws(()=>extract({image:p.image,sourceHash,ownedBoxes:[],textBoxes:[],round:3}),/round is invalid/);
 assert.throws(()=>extract({image:p.image,sourceHash,ownedBoxes:[],textBoxes:[],budget:0}),/budget is invalid/);
});

test('sourceSceneResidualCandidates binds admitted plan objects and textEndpoints with round=0',()=>{
 const {sourceSceneResidualCandidates}=require('../packages/slideclone-core/scene-plan/source-scene-graphic-locations');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:10,y:10,w:20,h:20}}],relations:[]},{sourceHash,widthPx:200,heightPx:100});
 const p=page(200,100);p.fill(10,10,20,20);p.fill(100,40,20,20);
 const res=sourceSceneResidualCandidates({image:p.image,sourceHash,textBoxes:[],plan});
 assert.equal(res.candidates.length,1);
 assert.deepEqual(res.candidates[0].box,{x:100,y:40,w:20,h:20});
 assert.equal(res.evidence.sourceAuthorized,false);
});
