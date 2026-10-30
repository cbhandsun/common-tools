// @ts-check
'use strict';
const {parseBandBackground}=require('./source-scene-band-geometry');
const {observeSceneSourceCage}=require('./source-scene-cage-observation');
const {parseSceneNativeGeometry}=require('./source-scene-native-geometry');
const {record}=require('./source-scene-group-containment');
/** Validate even an empty proposal, before allocating a session or reading.
 * @param {unknown} input */
function parseInitialSourceTopologyControls(input){
 if(!record(input)||!record(input.image))throw new TypeError('Source topology controls are invalid');
 const parsed=parseBandBackground({image:input.image,hint:{x:0,y:0,w:input.image.width,h:input.image.height},textMasks:input.textMasks,budget:{used:0},owners:[]});
 return {image:parsed.image,textMasks:parsed.textMasks};
}
/** Generate a proposal, never a paint/glyph/port/group capability. Center
 * strips locate caps/dividers; a unique complete connected cage independently
 * verifies the face count. Only a NEW initial admission may use this proposal.
 * @param {unknown} input */
function proposeSourceCylinderTopology(input){
 if(!record(input)||!record(input.object))throw new TypeError('Source topology input is invalid');
 const object=input.object,geometry=parseSceneNativeGeometry(object.nativeGeometry);
 if(!geometry||geometry.kind!=='cylinder')return {failure:'topology-not-cylinder'};
 if(object.kind!=='container'||typeof object.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(object.id))throw new TypeError('Source topology owner is invalid');
 const controls=parseBandBackground({image:input.image,hint:object.box,textMasks:input.textMasks,budget:input.budget,owners:[]}),{image,hint:box,budget,textMasks}=controls;
 const observed=observeSceneSourceCage({image,hint:box,budget,textMasks,owners:[]});
 if(observed.failure!==null||!observed.cage||!observed.raster)return {failure:observed.failure??'cage-source-isolation'};
 const {cage,raster}=observed;
 if(textMasks.some(m=>m.x<cage.box.x+cage.box.w&&m.y<cage.box.y+cage.box.h&&m.x+m.w>cage.box.x&&m.y+m.h>cage.box.y))return {failure:'cage-source-text'};
 const left=Math.max(0,Math.ceil(box.x+box.w*.42)),right=Math.min(image.width,Math.floor(box.x+box.w*.58));
 const y0=Math.max(0,Math.floor(box.y-4)),y1=Math.min(image.height,Math.ceil(box.y+box.h+4));
 if(right-left<6)return {failure:'topology-strip-capacity'};
 /** @type {number[]} */const values=[];
 /** @param {number} x @param {number} y */const intensity=(x,y)=>{const c=raster.pixel(x,y);return c?Math.max(...c):null;};
 // Unknown alpha anywhere in the proposed unit prevents a topology rewrite.
 for(let y=cage.box.y;y<cage.box.y+cage.box.h;y++)for(let x=cage.box.x;x<cage.box.x+cage.box.w;x++)if(!raster.pixel(x,y))return {failure:'cage-source-alpha'};
 for(let y=y0;y<y1;y++)for(let x=left;x<right;x++){const v=intensity(x,y);if(v===null)return {failure:'cage-source-alpha'};values.push(v);}
 values.sort((a,b)=>a-b);const fill=values[Math.floor(values.length*.6)];if(fill===undefined)return {failure:'topology-strip-empty'};
 const threshold=fill-42;
 /** @type {{start:number,end:number,center:number}[]} */const bands=[];let start=null;
 for(let y=y0;y<=y1;y++){
  let hits=0;if(y<y1)for(let x=left;x<right;x++){const v=intensity(x,y);if(v!==null&&v<threshold)hits++;}
  const stroke=hits/(right-left)>=.8;
  if(stroke&&start===null)start=y;
  if(!stroke&&start!==null){if(y-start<=box.h*.15)bands.push({start,end:y,center:(start+y-1)/2});start=null;}
 }
 const first=bands[0],last=bands[bands.length-1],second=bands[1];
 if(bands.length<3||!first||!last||!second||Math.abs(first.center-box.y)>4||Math.abs(last.center-box.y-box.h)>4)return {failure:'topology-strip-incomplete'};
 const top=first.center,h=last.center-top,capHeight=second.center-top,capRatio=capHeight/h;
 const seams=bands.slice(2,-1).map(b=>(b.center-top-capHeight/2)/h);
 if(!Number.isFinite(capRatio)||capRatio<=0||capRatio>.5||seams.some((v,i)=>v<=capRatio||v>=1-capRatio/2||i>0&&v<=(seams[i-1]??Infinity)))return {failure:'topology-strip-geometry'};
 if(cage.holes.length!==seams.length+2)return {failure:'topology-face-disagreement'};
 const proposal={box:{...box,y:top,h},nativeGeometry:{kind:'cylinder',capRatio,seams}};
 if(!parseSceneNativeGeometry(proposal.nativeGeometry))return {failure:'topology-strip-geometry'};
 return {failure:/** @type {null} */(null),proposal,observedFaces:cage.holes.length,bands,authorityGranted:false};
}
module.exports={proposeSourceCylinderTopology,parseInitialSourceTopologyControls};
