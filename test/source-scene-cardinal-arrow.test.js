'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
function fixture({vertical=false,reverse=false,gap=0,slant=0}={}){
 const image={width:256,height:256,rgba:Buffer.alloc(256*256*4,255)},budget={used:0},oracle=new Set();
 const put=(x,y,rgb=[25,90,180])=>{if(vertical)[x,y]=[y,x];image.rgba.set([...rgb,255],(y*256+x)*4);};
 const nodes=[{id:'a',box:{x:20,y:80,w:40,h:40}},{id:'b',box:{x:190,y:80,w:40,h:40}}];
 for(const n of nodes)for(let y=80;y<120;y++)for(let x=n.box.x;x<n.box.x+40;x++)put(x,y,[210,230,245]);
 for(let x=60+gap;x<190-gap;x++)for(let y=75;y<=125;y++){
  const half=x<154-gap?4:(190-gap-x)*25/36;
  if(Math.abs(y+.5-100-slant*(x-60))>half)continue;put(x,y);oracle.add(vertical?x*256+y:y*256+x);
 }
 if(vertical)for(const n of nodes)n.box={x:n.box.y,y:n.box.x,w:40,h:40};
 const cache=createSceneMeasurementCache(image,[],budget);for(const n of nodes){cache.fill(n.box);n.portFrame=cache.portFrame(n.box);}
 const [from,to]=reverse?[nodes[1],nodes[0]]:nodes;
 return {image,budget,from,to,oracle,put,sourceInk:true,direction:reverse?'backward':'forward',textMasks:[],otherNodes:[],
  shaftBox:vertical?{x:75,y:60,w:50,h:130}:{x:60,y:75,w:130,h:50}};
}
test('whole-source cardinal arrows retain exact ink and distinguish physical contact from visible gaps',()=>{
 for(const vertical of [false,true])for(const reverse of [false,true])for(const gap of [0,10]){
  const f=fixture({vertical,reverse,gap}),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
  assert.equal(result.fit.physical===true,gap===0);assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);
  const relation={id:'relation-cardinal',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:f.direction};
  const output=compile({fit:result.fit,relation,fromId:f.from.id,toId:f.to.id,width:256,height:256,slideSize:{widthPt:256,heightPt:256}});
  assert.equal(output.source.sourcePhysicalAttachment,gap===0);assert.deepEqual(f.image.rgba,before);
 }
});
test('cardinal source observation rejects incomplete, foreign, obstructed or ambiguous ink',()=>{
 for(const mode of ['empty','break','branch','text','foreign','direction','budget']){
  const f=fixture();
  if(mode==='empty')for(const n of f.oracle)f.put(n%256,Math.floor(n/256),[255,255,255]);
  if(mode==='break')for(let y=75;y<=125;y++)f.put(100,y,[255,255,255]);
  if(mode==='branch')for(let y=100;y<=120;y++)f.put(110,y);
  if(mode==='text')f.textMasks=[{x:100,y:90,w:10,h:20}];
  if(mode==='foreign')f.to.portFrame={};
  if(mode==='direction')f.direction='both';
  if(mode==='budget')f.budget.used=4000000;
  assert.equal(measure(f).fit,null,mode);assert.ok(f.budget.used<=4000000);
 }
});

test('partial boundary slabs do not turn a flat source endpoint into a pointed tail',()=>{
 for(const vertical of [false,true])for(const slant of [-.02,.02]){
  const f=fixture({vertical,slant}),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
 }
 const {sourceFilledArrowSlices}=require('../packages/slideclone-core/routing/source-filled-arrow-slices');
 const cells=[];for(let y=10;y<18;y++)for(let x=10;x<40;x++)cells.push(y*64+x);
 const slices=sourceFilledArrowSlices({cells,width:64,horizontal:true,slope:.02,intercept:13,work:{checks:0}});assert.ok(slices);
 assert.equal(slices[0].complete,false);assert.equal(slices.at(-1).complete,false);
 assert.ok(slices.slice(1,-1).every(s=>s.complete));assert.ok(slices.every(s=>s.gaps===0));
});
