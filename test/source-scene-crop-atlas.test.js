"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {planSceneCropAtlas}=require('../packages/slideclone-core/scene-plan/source-scene-crop-atlas');
const {createSceneCropSheet}=require('../packages/slideclone-core/scene-plan/source-scene-crop-sheet');
test('overlapping context shares pixels while every original target retains its bounded affine mapping',()=>{
 const image={width:600,height:500,rgba:Buffer.alloc(600*500*4)};
 for(let y=0;y<500;y++)for(let x=0;x<600;x++)image.rgba.set([x%256,y%256,(x+y)%256,255],(y*600+x)*4);
 const targets=[{index:100,cropBox:{x:10,y:20,w:300,h:250},candidateBox:{x:20.25,y:15.5,w:100,h:70}},
  {index:7,cropBox:{x:150,y:100,w:300,h:200},candidateBox:{x:5,y:10,w:50,h:30}},
  {index:511,cropBox:{x:35,y:40,w:30,h:25},candidateBox:{x:0,y:0,w:30,h:25}}];
 const before=JSON.stringify(targets),result=createSceneCropSheet({image,targets});
 const atlas=planSceneCropAtlas(targets.map(t=>({index:t.index,...t.cropBox})));
 assert.equal(atlas.tiles.length,1);assert.equal(result.pixels,atlas.width*atlas.height);
 assert.equal(JSON.stringify(targets),before);
 for(const [i,t] of targets.entries()){
  const mapped=result.targets[i];assert.equal(mapped.index,t.index);
  assert.equal(mapped.cropBox.w,t.cropBox.w);assert.equal(mapped.cropBox.h,t.cropBox.h);
  assert.equal(mapped.candidateBox.x-mapped.cropBox.x,t.candidateBox.x);
  assert.equal(mapped.candidateBox.y-mapped.cropBox.y,t.candidateBox.y);
  for(let y=0;y<t.cropBox.h;y++){
   const a=((t.cropBox.y+y)*image.width+t.cropBox.x)*4,b=((mapped.cropBox.y+y)*result.image.width+mapped.cropBox.x)*4;
   assert.deepEqual(result.image.rgba.subarray(b,b+t.cropBox.w*4),image.rgba.subarray(a,a+t.cropBox.w*4));
  }
 }
 for(const a of atlas.annotations)assert.ok(result.targets.every(t=>a.y-7+5<=t.cropBox.y||a.y-7>=t.cropBox.y+t.cropBox.h||a.x+11<=t.cropBox.x||a.x>=t.cropBox.x+t.cropBox.w));
 const {readStructuralObservations}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
 const {sourceBox2D}=require('../packages/slideclone-core/scene-plan/source-scene-coordinate-frame');
 const target=targets[2],outside=result.targets[0].candidateBox;
 const observation=readStructuralObservations({structures:[{index:target.index,kind:'icon',confidence:.99,regionId:'root',
  box_2d:sourceBox2D(outside,result.image)}]},[{index:target.index,objectId:'nested',box:target.cropBox}],
 {width:result.image.width,height:result.image.height,sourceTargets:targets,sheetTargets:result.targets});
 assert.equal(observation[0].rejection,'source-window','a shared tile cannot grant a target its neighbors source window');
});
test('32 nested targets fit without downsampling, removing identities or expanding source windows',()=>{
 const targets=Array.from({length:32},(_,index)=>({index,x:10+index,y:20+index,w:700-index*2,h:600-index*2}));
 const result=planSceneCropAtlas(targets);assert.equal(result.tiles.length,1);
 assert.equal(result.placements.length,32);assert.ok(result.width*result.height<500000);
 assert.deepEqual(result.placements.map(p=>p.index),targets.map(p=>p.index));
 for(const p of result.placements){const t=targets[p.index];assert.equal(p.x-result.placements[0].x,t.x-10);assert.equal(p.y-result.placements[0].y,t.y-20);}
 assert.deepEqual(planSceneCropAtlas(targets),result);
});
test('distant targets remain separate; empty, oversized and hostile inputs fail closed',()=>{
 assert.equal(planSceneCropAtlas([{index:0,x:0,y:0,w:20,h:20},{index:1,x:1000,y:1000,w:20,h:20}]).tiles.length,2);
 let touched=0;const hostile={};Object.defineProperty(hostile,'x',{get(){touched++;throw Error('secret');}});
 const valid={index:0,x:0,y:0,w:20,h:20};
 for(const input of [null,[],new Array(1),new Proxy([valid],{}),[hostile],[new Proxy(valid,{})],[valid,valid],
  [{...valid,x:-1}],[{...valid,x:.5}],[{...valid,h:Infinity}],[{...valid,w:16385}],Array(33).fill(valid)])
  assert.throws(()=>planSceneCropAtlas(input),e=>!e.message.includes('secret'));
 assert.equal(touched,0);
 assert.throws(()=>planSceneCropAtlas([{index:0,x:0,y:0,w:4096,h:1024}]),RangeError);
});
