"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {insidePolygon}=require('../packages/slideclone-core/scene-plan/source-scene-band-geometry');
const {createMeasuredScenePortFrame,measuredSceneContourPort,measuredSceneProjectedPort,verifyMeasuredScenePort}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {measureSceneRelationDetailed:measure}=require('../packages/slideclone-core/scene-plan/source-scene-relation');
function fixture(vertical=false,varyColor=false){
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},a={x:20,y:20,w:60,h:120},b={x:120,y:20,w:60,h:120};
 let points=[[0,0],[1,0],[1,1/6],[14/15,1/6],[14/15,1/3],[1,1/3],[1,1],[0,1]],rectangle=[[0,0],[1,0],[1,1],[0,1]];
 const vertices=points.map(([x,y])=>({x:a.x+x*a.w,y:a.y+y*a.h}));
 for(let y=0;y<180;y++)for(let x=0;x<200;x++)if(insidePolygon({x:x+.5,y:y+.5},vertices)||x>=120&&x<180&&y>=20&&y<140)image.rgba.set([210,230,245,255],(y*200+x)*4);
 for(let x=76;x<120;x++){
  const value=varyColor?Math.round((x-76)*1.5):0,color=[30+value,60+value,90+value,255];
  for(let y=49;y<=51;y++)image.rgba.set(color,(y*200+x)*4);
  if(x>=114)for(let y=50-(119-x);y<=50+(119-x);y++)image.rgba.set(color,(y*200+x)*4);
 }
 let shaftBox={x:77,y:43,w:42,h:14};
 if(vertical){
  const original=Buffer.from(image.rgba);image.width=180;image.height=200;
  for(let y=0;y<180;y++)for(let x=0;x<200;x++)image.rgba.set(original.subarray((y*200+x)*4,(y*200+x+1)*4),(x*180+y)*4);
  const swap=box=>({x:box.y,y:box.x,w:box.h,h:box.w});Object.assign(a,swap(a));Object.assign(b,swap(b));shaftBox=swap(shaftBox);
  points=points.map(([x,y])=>[y,x]);rectangle=rectangle.map(([x,y])=>[y,x]);
 }
 const segments=list=>list.map(([x,y],i)=>({type:i?'lnTo':'moveTo',points:[{x,y}]})).concat([{type:'close',points:[]}]);
 const from={id:'a',box:a,portFrame:createMeasuredScenePortFrame(image,{box:a,fill:'#D2E6F5',segments:segments(points)})};
 const to={id:'b',box:b,portFrame:createMeasuredScenePortFrame(image,{box:b,fill:'#D2E6F5',segments:segments(rectangle)})};
 return {image,from,to,shaftBox,direction:'forward',textMasks:[],budget:{used:0}};
}
test('a measured contour site preserves the original 2px contact gate without using the envelope as its site',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical),side=vertical?'bottom':'right',point=vertical?{x:50,y:76}:{x:76,y:50};
  assert.deepEqual(measuredSceneContourPort(f.image,f.from.portFrame,f.from.box,50,side),point);
  assert.equal(measuredSceneProjectedPort(f.image,f.from.portFrame,f.from.box,50,side),null,'legacy envelope proof stays unchanged');
  const input={image:f.image,token:f.from.portFrame,box:f.from.box,point,side,color:'#1E3C5A',textMasks:[],budget:{used:0}};
  assert.equal(verifyMeasuredScenePort(input),true);
  const distant={...point};distant[vertical?'y':'x']+=3;
  assert.equal(verifyMeasuredScenePort({...input,point:distant}),false,'3px still fails');
 }
});
test('straight source shafts bind to recessed freeform sites in both axes and directions',()=>{
 for(const vertical of [false,true])for(const varyColor of [false,true])for(const reverse of [false,true]){
  const f=fixture(vertical,varyColor),before=Buffer.from(f.image.rgba);
  if(reverse){[f.from,f.to]=[f.to,f.from];f.direction='backward';}
  const result=measure(f);assert.ok(result.fit,JSON.stringify({vertical,varyColor,reverse,result}));
  const fit=result.fit,offset=reverse?fit.endOffset:fit.startOffset;
  assert.deepEqual(offset,vertical?{x:0,y:-4}:{x:-4,y:0});assert.equal(fit.support,1);assert.equal(fit.widthPx,3);
  assert.deepEqual(reverse?fit.end:fit.start,vertical?{x:50,y:76}:{x:76,y:50});
  assert.ok(f.budget.used<=4000000);assert.deepEqual(f.image.rgba,before);
 }
});
test('contour recovery retains identity, direction, continuity, ownership and failure gates',()=>{
 const changes=[f=>{f.from.portFrame={};},f=>{f.from.portFrame=structuredClone(f.from.portFrame);},
  f=>{f.from.portFrame=new Proxy(f.from.portFrame,{});},f=>{f.image={...f.image,rgba:Buffer.from(f.image.rgba)};},
  f=>{f.direction='backward';},f=>{f.direction='both';},f=>{f.direction='unknown';},
  f=>{f.textMasks=[{x:74,y:49,w:4,h:4}];},f=>{f.textMasks=[{x:92,y:49,w:3,h:3}];},
  f=>{for(let y=38;y<63;y++)f.image.rgba.fill(255,(y*200+99)*4,(y*200+100)*4);},
  f=>{for(let y=38;y<63;y++)for(let x=76;x<81;x++)f.image.rgba.fill(255,(y*200+x)*4,(y*200+x+1)*4);},
  f=>{f.shaftBox={x:77,y:145,w:42,h:8};},f=>{f.image.rgba.fill(255);}];
 for(const change of changes){const f=fixture();change(f);assert.equal(measure(f).fit,null);}
 const full=fixture();full.budget.used=4000000;assert.throws(()=>measure(full),RangeError);assert.equal(full.budget.used,4000000);
});
test('unknown, empty, copied, cross-source and unsafe contour sites never gain authority',()=>{
 const f=fixture();
 for(const token of [undefined,null,{},structuredClone(f.from.portFrame),new Proxy({}, {})])
  assert.equal(measuredSceneContourPort(f.image,token,f.from.box,50,'right'),null);
 assert.equal(measuredSceneContourPort({...f.image,rgba:Buffer.from(f.image.rgba)},f.from.portFrame,f.from.box,50,'right'),null);
 for(const [axis,side]of [[NaN,'right'],[Infinity,'right'],[200,'right'],[50,'other']])assert.equal(measuredSceneContourPort(f.image,f.from.portFrame,f.from.box,axis,side),null);
 assert.equal(measuredSceneContourPort(f.image,f.from.portFrame,{...f.from.box,x:21},50,'right'),null);
 const token=createMeasuredScenePortFrame(f.image,{box:f.from.box,fill:'#D2E6F5',segments:[]});
 assert.equal(measuredSceneContourPort(f.image,token,f.from.box,50,'right'),null);assert.equal(f.budget.used,0);
});
