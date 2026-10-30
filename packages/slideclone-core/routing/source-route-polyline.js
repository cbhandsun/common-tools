// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {encodeNativeFreeformPath}=require('../scene-plan/native-freeform-path');
/** One open native path through the exact measured vertices. This geometry
 * helper grants no source ownership or automatic endpoint rerouting. No
 * corner, sample, physical arm or paint witness is removed by compaction.
 * @param {unknown} input */
function sourceRoutePolyline(input){
 if(!record(input)||!list(input.points)||input.points.length<2||input.points.length>120
  ||!input.points.every(p=>record(p)&&[p.x,p.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000))
  ||![input.sx,input.sy].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=100000))throw new TypeError('Source polyline geometry is invalid');
 const points=/** @type {{x:number,y:number}[]} */(input.points),sx=/** @type {number} */(input.sx),sy=/** @type {number} */(input.sy);
 const route=points.map(p=>({x:p.x*sx,y:p.y*sy})),xs=route.map(p=>p.x),ys=route.map(p=>p.y);
 const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(w<=0||h<=0||Math.hypot((route[0]?.x??0)-(route.at(-1)?.x??0),(route[0]?.y??0)-(route.at(-1)?.y??0))<1e-6)return null;
 const segments=route.map((p,i)=>({type:i?'lnTo':'moveTo',points:[{x:(p.x-x)/w,y:(p.y-y)/h}]}));
 return {box:{x,y,w,h},style:{closed:false,freeformPath:encodeNativeFreeformPath(segments)},route};
}
module.exports={sourceRoutePolyline};
