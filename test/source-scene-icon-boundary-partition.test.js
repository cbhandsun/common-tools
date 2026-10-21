'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createIconBoundaryPartition:create,deferIconBoundaryComponent:defer,sealIconBoundaryPartition:seal}=require('../packages/slideclone-core/source-scene-icon-boundary-partition');
const {measureSourceSceneVisibleGap}=require('../packages/slideclone-core/source-scene-visible-gap');
const {compileSourceSceneVisibleGap}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {measureSceneNativeIconDetailed}=require('../packages/slideclone-core/source-scene-icon');
function fixture(){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0},ink=new Set();
 const put=(x,y,rgb)=>image.rgba.set([...rgb,255],(y*240+x)*4);
 const from={id:'a',box:{x:20,y:40,w:50,h:40}},to={id:'b',box:{x:170,y:40,w:50,h:40}};
 for(const node of [from,to])for(let y=node.box.y;y<node.box.y+node.box.h;y++)for(let x=node.box.x;x<node.box.x+node.box.w;x++)put(x,y,[210,230,245]);
 for(let x=74;x<=165;x++)for(let y=59;y<=61;y++){put(x,y,[30,60,90]);ink.add(y*240+x);}
 for(let x=159;x<=165;x++)for(let y=60-(165-x);y<=60+(165-x);y++){put(x,y,[30,60,90]);ink.add(y*240+x);}
 const cache=createSceneMeasurementCache(image,[],budget);cache.fill(from.box);cache.fill(to.box);
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 const measured=measureSourceSceneVisibleGap({image,from,to,direction:'forward',textMasks:[],otherNodes:[],budget});assert.ok(measured.fit,measured.reason);
 const output=compileSourceSceneVisibleGap({fit:measured.fit,relation:{id:'relation-test',regionId:'region-test',fromId:'object-a',toId:'object-b',direction:'forward'},
  fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
 const token=create(image),frame={x:0,y:0,w:240,h:180},queue=Int32Array.from(ink);
 return {image,budget,output,token,frame,queue};
}
test('joint adoption requires every deferred cell in real unchanged connector source paint',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),spent=f.budget.used;
 assert.equal(defer(f.token,f.image,f.frame,f.queue,f.queue.length),true);
 assert.equal(seal(f.token,f.image,[f.output]),true);
 assert.equal(seal(f.token,f.image,[f.output]),false,'sealed partitions cannot be reused');
 assert.equal(defer(f.token,f.image,f.frame,f.queue,1),false);
 assert.equal(f.budget.used,spent);assert.deepEqual(f.image.rgba,before);
});
test('empty, copied, edited, absent and foreign-source connector outputs never seal a partition',()=>{
 for(const change of [f=>[],f=>[structuredClone(f.output)],f=>[{...f.output}],f=>{f.output.box.x++;return [f.output];}]){
  const f=fixture();assert.equal(defer(f.token,f.image,f.frame,f.queue,f.queue.length),true);assert.equal(seal(f.token,f.image,change(f)),false);
  assert.equal(seal(f.token,f.image,[f.output]),false,'a rejected attempt is not refundable');
 }
 const f=fixture();assert.equal(seal(f.token,f.image,[f.output]),false,'an empty pending partition grants nothing');
 const g=fixture();defer(g.token,g.image,g.frame,g.queue,g.queue.length);
 assert.equal(seal(g.token,{...g.image,rgba:Buffer.from(g.image.rgba)},[g.output]),false);
 for(const token of [null,{},structuredClone(g.token),new Proxy(g.token,{get(){throw Error('untrusted');}})]){
  assert.equal(defer(token,g.image,g.frame,g.queue,1),false);assert.equal(seal(token,g.image,[g.output]),false);
 }
});
test('one uncovered original cell rejects the entire dependency set without geometric dilation',()=>{
 const f=fixture(),queue=Int32Array.from([...f.queue,0]);
 assert.equal(defer(f.token,f.image,f.frame,queue,queue.length),true);assert.equal(seal(f.token,f.image,[f.output]),false);
});
test('deferred source isolation keeps all independent details and never edits source or rescues the clipped principal component',()=>{
 const image={width:120,height:120,rgba:Buffer.alloc(120*120*4,255)};
 const paint=(x,y,w,h)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set([30,60,90,255],(row*120+col)*4);};
 paint(30,30,20,20);paint(51,31,3,4);paint(55,47,30,3);
 const request={image,box:{x:30,y:30,w:30,h:22},id:'symbol',regionId:'owner',root:'unused',slideSize:{widthPt:120,heightPt:120},textBoxes:[],budget:{used:0}};
 assert.equal(measureSceneNativeIconDetailed(request).reason,'icon-source-clipped-component');
 const original=Buffer.from(image.rgba),token=create(image),result=measureSceneNativeIconDetailed({...request,boundaryPartition:token});
 assert.ok(result.measurement);assert.ok(result.measurement.pixelBox.x+result.measurement.pixelBox.w>=54,'detached icon details survive');
 assert.equal(seal(token,image,[]),false);assert.deepEqual(image.rgba,original);
 paint(45,43,40,3);
 assert.equal(measureSceneNativeIconDetailed({...request,boundaryPartition:create(image)}).measurement,null,'a clipped principal arm cannot be replaced by detached details');
 assert.throws(()=>measureSceneNativeIconDetailed({...request,budget:{used:4000000},boundaryPartition:create(image)}),RangeError);
});
