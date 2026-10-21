// @ts-check
"use strict";
const {types}=require("node:util");
const {sourceShaftProfile}=require("./source-shaft-profile");
const {measureSourceArrowBody}=require("./source-arrow-body");
const {hasCompleteSourceArrowHead}=require("./source-complete-arrow-head");
const {recoverSourceRelationAxis,deeperSourceRelationFailure}=require("./source-scene-relation-recovery");
const {verifyMeasuredScenePort,measuredScenePortFill}=require("./source-scene-port-evidence");
const {measuredScenePortAxis}=require("./source-scene-port-axis");
const {sceneRelationContourEnds,sceneRelationEndpointColor}=require('./source-scene-relation-contour-ports');
const {sceneRelationWithinAnchor}=require('./source-scene-relation-identity');
const {withSceneFillRasterCache,readSceneFillRaster}=require("./source-scene-fill-raster-cache");
const {sceneRelationBoundaryProfile}=require('./source-scene-relation-boundary-profile');
const {hasSceneInkPort}=require('./source-scene-ink-port');
/** @typedef {import("./source-scene-plan").Box} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** @typedef {{start:{x:number,y:number},end:{x:number,y:number},startSide:string,endSide:string,color:string,widthPx:number,support:number,startPosition?:number,endPosition?:number,startOffset?:{x:number,y:number},endOffset?:{x:number,y:number}}} RelationFit */
/** Verify a straight shaft AND its tapered arrowheads in the original gap.
 * Midpoint sites or independently measured source-boundary ports are supported.
 * Unaligned, curved, ambiguous or occluded relations remain unresolved.
 * @param {{image:import("./png").PngImage,from:{id:string,box:Box,portFrame?:unknown},to:{id:string,box:Box,portFrame?:unknown},direction:string,textMasks:Box[],budget:{used:number},shaftBox?:Box}} input
 * @returns {{fit:RelationFit|null,reason:string|null}} */
function measureSceneRelationDetailed(input){
 if(!record(input)||!record(input.image)||!record(input.budget))throw new TypeError("Scene relation input is invalid");
 return withSceneFillRasterCache(input.image,input.budget,()=>{
  /** A valid neighbouring shaft is not this relation. Reject it INSIDE the
   * bounded measurement so the original recovery probes can inspect the
   * intended anchor. Final compiler validation retains the same anchor gate.
   * @param {number|undefined} offset @param {{horizontal:boolean,axis:number}|null} axis */
  const measure=(offset,axis)=>{
   const result=measureAtAxis(input,offset,axis);
   return result.fit&&!sceneRelationWithinAnchor(input,result.fit)?{fit:null,reason:'relation-anchor'}:result;
  };
  const first=measure(undefined,null);
  if(first.fit)return first;
  const recoverable=['shaft-window-boundary','shaft-support','arrow-direction','relation-anchor'].includes(first.reason??'');
  const portAxis=first.reason==='node-axis-alignment'||input.shaftBox&&recoverable?measuredScenePortAxis(input):null;
  if(!portAxis&&!recoverable)return first;
  let reason=portAxis?null:first.reason;
  const recovered=recoverSourceRelationAxis(offset=>{const result=measure(offset,portAxis);
   if(!result.fit)reason=reason===null?result.reason:deeperSourceRelationFailure(reason,result.reason);return result;});
  return recovered??{fit:null,reason:reason??first.reason};
 });
}
/** @param {Parameters<typeof measureSceneRelationDetailed>[0]} input @param {number|undefined} [offset]
 * @param {{horizontal:boolean,axis:number}|null} [portAxis]
 * @param {boolean} [contourPorts]
 * @returns {{fit:RelationFit|null,reason:string|null}} */
function measureAtAxis(input,offset,portAxis,contourPorts=false){
 /** @param {string} reason @returns {{fit:null,reason:string}} */
 const reject=reason=>({fit:null,reason});
 if(!record(input)||!record(input.image)||!record(input.from)||!record(input.to)||!record(input.budget)
  ||!box(input.from.box)||!box(input.to.box)||typeof input.from.id!=="string"||typeof input.to.id!=="string"
  ||input.from.id===input.to.id||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0
  ||input.shaftBox!==undefined&&!box(input.shaftBox)
  ||!Array.isArray(input.textMasks)||types.isProxy(input.textMasks)||input.textMasks.length>10000
  ||Object.getPrototypeOf(input.textMasks)!==Array.prototype||Reflect.ownKeys(input.textMasks).length!==input.textMasks.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.textMasks)).some(p=>!("value" in p))||!input.textMasks.every(box))throw new TypeError("Scene relation input is invalid");
 const {image,from,to,direction,textMasks,budget}=input;
 if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1
  ||image.width>16384||image.height>16384||image.width*image.height>40000000||types.isProxy(image.rgba)||!Buffer.isBuffer(image.rgba)
  ||Object.getPrototypeOf(image.rgba)!==Buffer.prototype||Object.hasOwn(image.rgba,"length")
  ||image.rgba.length!==image.width*image.height*4||!["forward","backward","both","unknown","undirected"].includes(direction)
  ||[from.box,to.box,...(input.shaftBox?[input.shaftBox]:[])].some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError("Scene relation source is invalid");
 if(direction==="unknown")return reject('direction-unknown');
 const a=from.box,b=to.box,ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
 const horizontal=portAxis?.horizontal??Math.abs(ay-by)<=2,vertical=portAxis?!portAxis.horizontal:Math.abs(ax-bx)<=2;
 if(horizontal===vertical)return reject('node-axis-alignment');
 const increasing=horizontal?bx>ax:by>ay;
 const start=horizontal?{x:increasing?a.x+a.w:a.x,y:ay}:{x:ax,y:increasing?a.y+a.h:a.y};
 const end=horizontal?{x:increasing?b.x:b.x+b.w,y:by}:{x:bx,y:increasing?b.y:b.y+b.h};
 if(contourPorts){
  if(!portAxis)return reject('node-axis-alignment');
  const ends=sceneRelationContourEnds({...input,horizontal,increasing,axis:Math.round(portAxis.axis)+(offset??0)});
  if(!ends)return reject('node-axis-alignment');Object.assign(start,ends.start);Object.assign(end,ends.end);
 }
 const first=horizontal?start.x:start.y,last=horizontal?end.x:end.y;
 const lo=Math.ceil(Math.min(first,last))+1,hi=Math.floor(Math.max(first,last))-1;
 if((last-first)*(increasing?1:-1)<=0||hi-lo<8||hi-lo>512)return reject('source-gap');
 const axis=Math.round(portAxis?.axis??(horizontal?(ay+by)/2:(ax+bx)/2))+(offset??0),radius=offset===undefined?Math.min(12,Math.max(5,Math.floor((hi-lo)/3))):12;
 const window=horizontal?{x:lo,y:axis-radius,w:hi-lo+1,h:radius*2+1}:{x:axis-radius,y:lo,w:radius*2+1,h:hi-lo+1};
 if(window.x<0||window.y<0||window.x+window.w>image.width||window.y+window.h>image.height
  ||textMasks.some(t=>Math.min(t.x+t.w,window.x+window.w)>Math.max(t.x,window.x)&&Math.min(t.y+t.h,window.y+window.h)>Math.max(t.y,window.y)))return reject('source-window-ownership');
 const samples=window.w*window.h;
 if(budget.used+samples>4000000){if(offset!==undefined)return reject('source-scan-budget');throw new RangeError("Scene relation scan exceeds the pixel budget");}
 const raster=readSceneFillRaster(image,window,budget);
 /** @param {number} along @param {number} across */
 const rgb=(along,across)=>{const x=horizontal?along:across,y=horizontal?across:along,i=((y-window.y)*raster.width+x-window.x)*4;
  return [raster.rgba[i]??0,raster.rgba[i+1]??0,raster.rgba[i+2]??0];};
 /** @param {number} along @param {number} across */
 const opaque=(along,across)=>{const x=horizontal?along:across,y=horizontal?across:along;return (raster.rgba[((y-window.y)*raster.width+x-window.x)*4+3]??0)>=240;};
 if(!opaque(lo,axis-radius)||!opaque(hi,axis-radius)||!opaque(lo,axis+radius)||!opaque(hi,axis+radius))return reject('source-window-alpha');
 const background=[0,1,2].map(c=>{const values=[rgb(lo,axis-radius),rgb(hi,axis-radius),rgb(lo,axis+radius),rgb(hi,axis+radius)]
  .map(v=>v[c]??0).sort((x,y)=>x-y);return ((values[1]??0)+(values[2]??0))/2;});
 const alongOrigin=horizontal?window.x:window.y,acrossOrigin=horizontal?window.y:window.x;
 const profileInput={image:raster,horizontal,lo:lo-alongOrigin,hi:hi-alongOrigin,axis:axis-acrossOrigin,radius,background,centerColor:offset!==undefined};
 let profile=sourceShaftProfile(profileInput);
 // Keep successful measurements unchanged. Reuse the same already charged
 // raster only when a body-colored fringe censored the shaft window. Provider
 // boxes/colors and cloned tokens grant no exclusion authority; all shaft,
 // taper, attachment, ownership and budget checks below remain unchanged.
 if(profile.reason==='shaft-window-boundary'){
  const bodyColors=[measuredScenePortFill(image,from.portFrame,a),measuredScenePortFill(image,to.portFrame,b)]
   .filter((color)=>color!==null);
  if(bodyColors.length)profile=sourceShaftProfile({...profileInput,bodyColors});
 }
 if(profile.reason==='shaft-window-boundary')profile=sceneRelationBoundaryProfile(input,window,profileInput)??profile;
 if(profile.reason)return reject(profile.reason);
 const {widths,colors,centers}=profile;
 const support=widths.filter(w=>w>0).length/widths.length;
 if(support<.9)return reject('shaft-support');
 const firstInk=widths.findIndex(w=>w>0),lastInk=widths.length-1-[...widths].reverse().findIndex(w=>w>0);
 if(widths.slice(firstInk,lastInk+1).some(w=>w===0))return reject('shaft-discontinuity');
 const central=widths.slice(Math.floor(widths.length*.3),Math.ceil(widths.length*.7)).sort((x,y)=>x-y);
 let shaft=central[Math.floor(central.length/2)]??0;
 // Preserve ordinary accepted profiles. A short head can occupy the central
 // interval; use a jointly proven body only when that interval is too thick.
 const body=shaft>5?measureSourceArrowBody({widths,
  rightArrow:increasing?direction==='forward'||direction==='both':direction==='backward'||direction==='both',
  leftArrow:increasing?direction==='backward'||direction==='both':direction==='forward'||direction==='both'}):null;
 if(body)shaft=body.widthPx;
 if(shaft<1||shaft>5)return reject('shaft-width');
 /** A triangle must widen toward its base and narrow toward its tip; a
  * thick mark, border, straight line or detached dots cannot prove direction.
  * @param {boolean} right */
 const arrow=right=>{
  const ordered=right?[...widths].reverse():widths;
  const tip=ordered.findIndex(w=>w>0);if(tip<0||tip>2)return false;
  const section=ordered.slice(tip,tip+Math.min(12,Math.floor(widths.length/2)));
  const peak=Math.max(...section),base=section.indexOf(peak);
  if(peak<shaft*2+2||base<2||base>9)return false;
  for(let i=1;i<=base;i++)if((section[i]??0)+1<(section[i-1]??0))return false;
  return (section[0]??0)<=shaft+2;
 };
 const rightArrow=arrow(true)||hasCompleteSourceArrowHead({widths,shaft,right:true});
 const leftArrow=arrow(false)||hasCompleteSourceArrowHead({widths,shaft,right:false});
 const endArrow=increasing?rightArrow:leftArrow,startArrow=increasing?leftArrow:rightArrow;
 if(endArrow!==(direction==="forward"||direction==="both")||startArrow!==(direction==="backward"||direction==="both"))return reject('arrow-direction');
 const color="#"+[0,1,2].map(c=>{const values=colors.map(v=>v[c]??0).sort((x,y)=>x-y);
  return (values[Math.floor(values.length/2)]??0).toString(16).padStart(2,"0");}).join("").toUpperCase();
 /** @type {Pick<RelationFit,'startPosition'|'endPosition'|'startOffset'|'endOffset'>} */let sites={};
 // A pictorial envelope can have empty corners or deep concavities even at
 // its midpoint. The ordinary rectangle shortcut grants no pictorial port.
 const pictorial=hasSceneInkPort(image,from.portFrame,a)||hasSceneInkPort(image,to.portFrame,b);
 if(offset!==undefined||pictorial){
  const centralCenters=centers.slice(body?.firstBody??Math.floor(widths.length*.3),body?body.lastBody+1:Math.ceil(widths.length*.7))
   .filter((value)=>value!==null).sort((x,y)=>x-y);
  const center=centralCenters[Math.floor(centralCenters.length/2)],observedAxis=center===undefined?undefined:Math.round(center+acrossOrigin);
  if(observedAxis===undefined)return reject('node-axis-alignment');
  const midpointAligned=Math.abs(observedAxis-(horizontal?ay:ax))<=2&&Math.abs(observedAxis-(horizontal?by:bx))<=2;
  if(horizontal){start.y=observedAxis;end.y=observedAxis;sites={startPosition:(observedAxis-a.y)/a.h,endPosition:(observedAxis-b.y)/b.h};}
  else{start.x=observedAxis;end.x=observedAxis;sites={startPosition:(observedAxis-a.x)/a.w,endPosition:(observedAxis-b.x)/b.w};}
  if(contourPorts){
   const ends=sceneRelationContourEnds({...input,horizontal,increasing,axis:observedAxis});
   if(!ends||Math.abs((horizontal?ends.start.x:ends.start.y)-first)>2||Math.abs((horizontal?ends.end.x:ends.end.y)-last)>2)return reject('node-axis-alignment');
   Object.assign(start,ends.start);Object.assign(end,ends.end);
   sites={startPosition:ends.startPosition,endPosition:ends.endPosition,startOffset:ends.startOffset,endOffset:ends.endOffset};
  }
  if([sites.startPosition,sites.endPosition].some(position=>position!==undefined&&(position<0||position>1)))return reject('source-gap');
  if((portAxis||!midpointAligned||pictorial)&&(!verifyMeasuredScenePort({image,token:from.portFrame,box:a,point:start,side:horizontal?(increasing?'right':'left'):(increasing?'bottom':'top'),
   color:contourPorts?sceneRelationEndpointColor(colors,true,increasing,color):color,textMasks,budget})
   ||!verifyMeasuredScenePort({image,token:to.portFrame,box:b,point:end,side:horizontal?(increasing?'left':'right'):(increasing?'top':'bottom'),
   color:contourPorts?sceneRelationEndpointColor(colors,false,increasing,color):color,textMasks,budget}))){
   // Preserve every already accepted fit. Re-measure the same axis against
   // actual contour sites only after the envelope attachment fails. The
   // original five offsets, source ledger and all shaft gates remain shared.
   return portAxis&&!contourPorts?measureAtAxis(input,offset,portAxis,true):reject('node-axis-alignment');
  }
 }
 return {fit:{start,end,startSide:horizontal?(increasing?"right":"left"):(increasing?"bottom":"top"),
  endSide:horizontal?(increasing?"left":"right"):(increasing?"top":"bottom"),color,widthPx:shaft,support,...sites},reason:null};
}
/** Preserve the existing geometry-only API and exact scan behavior.
 * @param {Parameters<typeof measureSceneRelationDetailed>[0]} input @returns {RelationFit|null} */
function measureSceneRelation(input){return measureSceneRelationDetailed(input).fit;}
module.exports={measureSceneRelation,measureSceneRelationDetailed};
