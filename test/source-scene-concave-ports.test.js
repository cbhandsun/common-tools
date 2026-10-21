"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {insidePolygon}=require('../packages/slideclone-core/source-scene-band-geometry');
const {createMeasuredScenePortFrame,verifyMeasuredScenePort}=require('../packages/slideclone-core/source-scene-port-evidence');
function fixture(side='left',concave=true){
 const box={x:10,y:10,w:40,h:40},vertical=side==='top'||side==='bottom';
 let points=concave?[[0,0],[.35,0],[.35,.7],[.65,.7],[.65,0],[1,0],[1,1],[0,1]]:[[0,0],[1,0],[1,1],[0,1]];
 if(vertical)points=points.map(([x,y])=>[y,x]);
 const vertices=points.map(([x,y])=>({x:box.x+x*box.w,y:box.y+y*box.h}));
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4,255)};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(insidePolygon({x:x+.5,y:y+.5},vertices))image.rgba.set([205,239,255,255],(y*64+x)*4);
 const low=side==='left'||side==='top',boundary=low?10:50,point=vertical?{x:20,y:boundary}:{x:boundary,y:20};
 for(const distance of [1,2])for(const offset of [-1,0,1]){
  const along=boundary+(low?-distance:distance),x=vertical?20+offset:along,y=vertical?along:20+offset;
  image.rgba.set([18,52,86,255],(y*64+x)*4);
 }
 const segments=points.map(([x,y],i)=>({type:i?'lnTo':'moveTo',points:[{x,y}]})).concat([{type:'close',points:[]}]);
 const token=createMeasuredScenePortFrame(image,{box,segments,fill:'#CDEFFF'});
 return {image,token,box,point,side,color:'#123456',textMasks:[],budget:{used:0}};
}
test('a remote concavity must not invalidate a source-supported outer port on any side',()=>{
 for(const side of ['left','right','top','bottom']){
  const control=fixture(side,false),input=fixture(side);
  assert.equal(verifyMeasuredScenePort(control),true,side+' rectangle');
  assert.equal(verifyMeasuredScenePort(input),true,side+' concave');
  assert.equal(input.budget.used,control.budget.used,'same local source budget');
 }
});
test('concave ports retain the original geometry, paint, text protection and resource gates',()=>{
 for(const side of ['left','right','top','bottom']){
  const distant=fixture(side),axis=side==='left'||side==='right'?'x':'y';distant.point[axis]+=(side==='left'||side==='top'?-3:3);
  assert.equal(verifyMeasuredScenePort(distant),false,'original 2px gate');
  const wrongColor=fixture(side);wrongColor.color='#FF0000';assert.equal(verifyMeasuredScenePort(wrongColor),false);
  const text=fixture(side);text.textMasks=[{x:0,y:0,w:64,h:64}];assert.equal(verifyMeasuredScenePort(text),false);
  const full=fixture(side);full.budget.used=4000000;assert.equal(verifyMeasuredScenePort(full),false);assert.equal(full.budget.used,4000000);
 }
});
test('missing, forged, copied, cross-source and nonfinite port identities remain rejected',()=>{
 for(const token of [null,undefined,{},new Proxy({}, {get(){throw Error('must not inspect unknown token');}})])assert.equal(verifyMeasuredScenePort({...fixture(),token}),false);
 const other=fixture();assert.equal(verifyMeasuredScenePort({...other,image:{...other.image,rgba:Buffer.from(other.image.rgba)}}),false);
 const moved=fixture();moved.box={...moved.box,x:11};assert.equal(verifyMeasuredScenePort(moved),false);
 const invalid=fixture();invalid.point.y=NaN;assert.equal(verifyMeasuredScenePort(invalid),false);
 const empty=fixture();empty.token=createMeasuredScenePortFrame(empty.image,{box:empty.box,segments:[],fill:'#CDEFFF'});assert.equal(verifyMeasuredScenePort(empty),false);
});
