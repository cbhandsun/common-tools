// @ts-check
"use strict";
const {record,list,box:validBox}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @returns {never} */
function fail(){throw new TypeError('Native route attachment proposal is invalid');}
/** @param {unknown} input */
function endpoint(input){
 if(!record(input)||Object.keys(input).some(k=>!['id','box','side'].includes(k))
  ||typeof input.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(input.id)
  ||!validBox(input.box)||Object.keys(input.box).length!==4||Object.values(input.box).some(v=>typeof v!=='number'||v>100000)
  ||typeof input.side!=='string'||!['top','right','bottom','left'].includes(input.side))return fail();
 return {id:input.id,box:input.box,side:String(input.side)};
}
/** Produce an exact logical port for a proposed route, never evidence of ink
 * contact. Outward gaps and inward contour sites are distinct. No tangential
 * displacement or distant virtual owner can be smuggled in as a port.
 * @param {ReturnType<typeof endpoint>} owner @param {Point} p */
function port(owner,p){
 const b=owner.box,vertical=owner.side==='left'||owner.side==='right';
 const position=vertical?(p.y-b.y)/b.h:(p.x-b.x)/b.w;
 if(position<0||position>1)return null;
 const edge=vertical?b.x+(owner.side==='right'?b.w:0):b.y+(owner.side==='bottom'?b.h:0);
 const offset=(vertical?p.x:p.y)-edge;
 if(Math.abs(offset)>Math.min(24,Math.min(b.w,b.h)*.5))return null;
 const outward=offset*(owner.side==='left'||owner.side==='top'?-1:1)>0;
 return {elementId:owner.id,side:owner.side,position,dxPt:vertical?offset:0,dyPt:vertical?0:offset,
  ...(outward?{siteOffsetKind:'source-visible-gap'}:{})};
}
/** Geometric compilation ONLY. Candidates have no source rights and must pass
 * source/render and real Office checks before a caller accepts their attachment.
 * Curves and unsupported bends stay unchanged; they are never silently snapped.
 * @param {unknown} input */
function proposeNativeRouteAttachment(input){
 if(!record(input)||Object.keys(input).some(k=>!['from','to','commands'].includes(k)))fail();
 const from=endpoint(input.from),to=endpoint(input.to),commands=input.commands;
 if(from.id===to.id||!list(commands)||commands.length<2||commands.length>120
  ||Array.from({length:commands.length},(_,i)=>i).some(i=>!Object.hasOwn(commands,i)))fail();
 const points=commands.map((command,i)=>{
  if(!list(command)||!Number.isSafeInteger(command[0])||![0,1,2,3].includes(Number(command[0]))
   ||command.length!==[3,3,7,5][Number(command[0])]||i===0&&command[0]!==0||i>0&&command[0]===0
   ||command.slice(1).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000))return fail();
  return {x:Number(command.at(-2)),y:Number(command.at(-1))};
 });
 if(commands.slice(1).some(c=>!Array.isArray(c)||c[0]!==1))return null;
 const start=points[0],end=points.at(-1);if(!start||!end||Math.hypot(start.x-end.x,start.y-end.y)<.01)return null;
 const close=(/** @type {Point|undefined} */a,/** @type {Point} */b)=>a!==undefined&&Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
 let connectorType=null;
 if(points.length===2)connectorType='straight';
 else if(points.length===3&&close(points[1],{x:end.x,y:start.y}))connectorType='elbow-2';
 else if(points.length===4&&close(points[1],{x:(start.x+end.x)/2,y:start.y})&&close(points[2],{x:(start.x+end.x)/2,y:end.y}))connectorType='elbow-3';
 if(!connectorType)return null;
 const startAnchor=port(from,start),endAnchor=port(to,end);if(!startAnchor||!endAnchor)return null;
 return {type:'line',box:{x:start.x,y:start.y,w:end.x-start.x,h:end.y-start.y},
  style:{connectorType,startAnchor,endAnchor},sourceProvenanceVerified:false};
}
module.exports={proposeNativeRouteAttachment};
