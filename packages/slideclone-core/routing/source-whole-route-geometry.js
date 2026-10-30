// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {readNativeFreeformSegments,encodeNativeFreeformPath}=require('../scene-plan/native-freeform-path');
const {nativeElbowVertices,nativeElbowConnector}=require('./source-route-native-elbow');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** Read the actual writer geometry, never source.nativeRoutePoints. This
 * geometry-only transform cannot issue a source-paint or erasure receipt.
 * @param {Item} part @returns {Point[][]} */
function wholeRouteCurves(part){
 if(!record(part)||!record(part.box)||!record(part.style))throw new TypeError('Whole route member is invalid');
 const b=part.box,s=part.style;
 if(![b.x,b.y,b.w,b.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
  ||s.fill!=='none'||[s.rotationDeg,s.rotation,s.flipH,s.flipV].some(v=>v!==undefined))throw new TypeError('Whole route geometry is invalid');
 if(part.type==='line'){
  if(s.connectorType!==undefined&&(typeof s.connectorType!=='string'||!/^elbow-[3-5]$/u.test(s.connectorType))
   ||[s.freeformPath,s.freeformSegments,s.connectorPath].some(v=>v!==undefined))throw new TypeError('Whole route preset is invalid');
  if(s.connectorFrame!==undefined){const frame=s.connectorFrame;
   if(!record(frame)||![frame.x,frame.y,frame.w,frame.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
    ||Number(frame.w)<0||Number(frame.h)<0||![0,90,180,270].includes(Number(frame.rotationDeg))
    ||typeof frame.flipH!=='boolean'||typeof frame.flipV!=='boolean'
    ||s.connectorAdjustments!==undefined&&(!list(s.connectorAdjustments)||s.connectorAdjustments.length>3
     ||!s.connectorAdjustments.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=2000000)))throw new TypeError('Whole route frame is invalid');
  }
  const points=s.connectorFrame===undefined?[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}]
   :nativeElbowVertices(/** @type {NonNullable<ReturnType<typeof nativeElbowConnector>>} */(s));
  return points.slice(1).flatMap((p,i)=>{const a=/** @type {Point} */(points[i]);return Math.hypot(p.x-a.x,p.y-a.y)<1e-8?[]:[[a,p]];});
 }
 if(part.type!=='freeform'||s.closed!==false||s.connectorFrame!==undefined||b.w<=0||b.h<=0)throw new TypeError('Whole route geometry is invalid');
 const rows=readNativeFreeformSegments(s);if(!list(rows)||rows.length<2||rows.length>120)throw new TypeError('Whole route path is invalid');
 /** @type {Point[][]} */const curves=[];/** @type {Point|undefined} */let previous;
 for(const row of rows){
  if(!record(row)||!list(row.points)||!row.points.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))throw new TypeError('Whole route path is invalid');
  const points=/** @type {Point[]} */(row.points).map(p=>({x:b.x+p.x*b.w,y:b.y+p.y*b.h}));
  if(!previous&&row.type==='moveTo'&&points.length===1){previous=points[0];continue;}
  if(!previous||row.type!=='lnTo'&&row.type!=='cubicBezTo'||points.length!==(row.type==='lnTo'?1:3))throw new TypeError('Whole route path is invalid');
  curves.push([previous,...points]);previous=points.at(-1);
 }
 if(!curves.length)throw new TypeError('Whole route path is invalid');return curves;
}
/** One connected open path with at most the existing 120 commands. Reversal
 * reverses both cubic controls. No new bridge can hide disconnected parts.
 * @param {{part:Item,reversed:boolean}[]} members */
function joinWholeRouteGeometry(members){
 if(!list(members)||members.length<1||members.length>128)throw new TypeError('Whole route members are invalid');
 /** @type {Point[][]} */const curves=[];
 for(const member of members){
  if(!record(member)||typeof member.reversed!=='boolean')throw new TypeError('Whole route members are invalid');
  const piece=wholeRouteCurves(member.part),oriented=member.reversed?piece.slice().reverse().map(c=>c.slice().reverse()):piece;
  const before=curves.at(-1)?.at(-1),after=oriented[0]?.[0];
  if(before&&after&&Math.hypot(before.x-after.x,before.y-after.y)>1e-6)throw new TypeError('Whole route members are disconnected');
  if(curves.length+oriented.length>119)throw new TypeError('Whole route command budget is invalid');
  curves.push(...oriented);
 }
 return {curves,...wholeRouteDrawing(curves)};
}
/** @param {Point[][]} curves */
function wholeRouteDrawing(curves){
 if(!list(curves)||!curves.length||curves.length>119||!curves.every(c=>list(c)&&(c.length===2||c.length===4)
  &&c.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000))))throw new TypeError('Whole route command budget is invalid');
 const start=/** @type {Point} */(curves[0]?.[0]),end=/** @type {Point} */(curves.at(-1)?.at(-1));
 if(Math.hypot(start.x-end.x,start.y-end.y)<1e-6)throw new TypeError('Whole route endpoints are invalid');
 const points=[start,...curves.map(c=>/** @type {Point} */(c.at(-1)))];
 const simple=points.filter((p,i)=>{const a=points[i-1],b=points[i+1];return !a||!b||Math.abs((p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x))>1e-7
  ||(p.x-a.x)*(b.x-p.x)+(p.y-a.y)*(b.y-p.y)<0;});
 const connector=curves.every(c=>c.length===2)?nativeElbowConnector(simple):null;
 if(connector)return {type:'line',box:{x:start.x,y:start.y,w:end.x-start.x,h:end.y-start.y},style:connector,points};
 const all=curves.flat(),x=Math.min(...all.map(p=>p.x)),y=Math.min(...all.map(p=>p.y)),w=Math.max(...all.map(p=>p.x))-x,h=Math.max(...all.map(p=>p.y))-y;
 if(w<=0||h<=0)throw new TypeError('Whole route bounds are invalid');
 /** @param {Point} p */const normalize=p=>({x:(p.x-x)/w,y:(p.y-y)/h});
 return {type:'freeform',box:{x,y,w,h},points,style:{closed:false,freeformPath:encodeNativeFreeformPath([
  {type:'moveTo',points:[normalize(start)]},...curves.map(c=>({type:c.length===2?'lnTo':'cubicBezTo',points:c.slice(1).map(normalize)}))])}};
}
module.exports={wholeRouteCurves,joinWholeRouteGeometry,wholeRouteDrawing};
