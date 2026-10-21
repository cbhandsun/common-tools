// @ts-check
'use strict';
const {types}=require('node:util');
const {insidePolygon}=require('./source-scene-band-geometry');
/** Only private opaque source-body tokens explain an interrupted rail. No
 * inferred gap is drawn or made into a physical connector attachment.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} tokens
 * @param {{checks:number,exhausted:boolean}} work */
function sceneFrameGapCoverage(image,tokens,work){
 if(tokens===undefined)tokens=[];
 if(!Array.isArray(tokens)||types.isProxy(tokens)||Object.getPrototypeOf(tokens)!==Array.prototype||tokens.length>88
  ||Reflect.ownKeys(tokens).length!==tokens.length+1||Object.values(Object.getOwnPropertyDescriptors(tokens)).some(p=>!('value' in p)))
  throw new TypeError('Scene frame occlusion controls are invalid');
 // Resolve lazily: the port module also consumes patterned geometry tokens.
 const {measuredSceneOpaqueSurface}=require('./source-scene-port-evidence');
 const polygons=tokens.map(token=>measuredSceneOpaqueSurface(image,token)).filter(p=>p!==null);
 /** Visible strokes above an opaque body are not its background paint.
  * @param {number} x @param {number} y @param {number[]} [color] */
 const owns=(x,y,color)=>!work.exhausted&&polygons.some(({vertices,fill})=>{
  work.checks+=vertices.length;if(work.checks>4000000){work.exhausted=true;return false;}
  return (!color||color.length>=3&&fill.every((v,i)=>Math.abs(v-(color[i]??Infinity))<=18))&&insidePolygon({x,y},vertices);
 });
 /** The occluded core covers the full stroke band, continuously. Uncovered
  * ends retain only the existing source dash-gap allowance, never an interior
  * hole. A partial cover or a proposal's bounding box is insufficient.
  * Geometry work shares the existing four-million-check ceiling.
  * @param {number} side @param {number} start @param {number} end
  * @param {number} track @param {number} thickness @param {number} [allowance] */
 const covered=(side,start,end,track,thickness,allowance=0)=>{
  const limit=side<2?image.width:image.height,cross=side<2?image.height:image.width;
  if(!polygons.length||!Number.isInteger(side)||side<0||side>3||![start,end,track,thickness,allowance].every(Number.isFinite)
   ||start<0||end>limit||end<=start||track<0||track>=cross||thickness<=0||thickness>12
   ||!Number.isSafeInteger(allowance)||allowance<0||allowance>limit)return false;
  let seen=false,tail=0,prefix=0;
  for(let axis=Math.floor(start);axis<Math.ceil(end);axis++){
   let full=true;
   for(let across=Math.floor(track-thickness/2-1.5);across<=Math.ceil(track+thickness/2+1.5);across++){
    const point=side<2?{x:axis+.5,y:across+.5}:{x:across+.5,y:axis+.5};
    if(!owns(point.x,point.y)){full=false;break;}
   }
   if(work.exhausted)return false;
   if(full){if(tail)return false;seen=true;}
   else if(seen){if(++tail>allowance)return false;}
   else if(++prefix>allowance)return false;
  }
  return seen;
 };
 return Object.assign(covered,{owns});
}
module.exports={sceneFrameGapCoverage};
