// @ts-check
"use strict";
const {record,list}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-primitive-candidate').Segment} Segment */
/** @typedef {{filled:boolean,segments:Segment[]}} SurfacePath */
/** A single physical container's complete exterior and internal faces. The
 * program proposes geometry only: source paint, glyphs, icons, ports and
 * ownership must still pass the existing full primitive-program verifier.
 * All paths share the original parent part limit; no hidden object inventory.
 * @param {unknown} value @param {boolean} [openOnly] @returns {SurfacePath[]} */
function parseSurfacePaths(value,openOnly=false){
 if(typeof openOnly!=='boolean')throw new TypeError('Native surface path mode is invalid');
 if(!list(value)||value.length<1||value.length>16)throw new TypeError('Native surface paths are invalid');
 let segments=0,points=0;
 return value.map((path,index)=>{
  if(!record(path)||Reflect.ownKeys(path).length!==2||typeof path.filled!=='boolean'||!list(path.segments)
   ||path.segments.length<2||path.segments.length>32||(openOnly?path.filled:index===0&&!path.filled))
   throw new TypeError('Native surface path is invalid');
  const filled=path.filled,rawSegments=path.segments;
  const parsed=rawSegments.map((s,i)=>{
   if(++segments>64||!record(s)||Reflect.ownKeys(s).length!==2||typeof s.type!=='string'||!list(s.points)
    ||!['moveTo','lnTo','cubicBezTo','close'].includes(s.type)||i===0&&s.type!=='moveTo'||i>0&&s.type==='moveTo'
    ||s.type==='close'&&(openOnly||i!==rawSegments.length-1))
    throw new TypeError('Native surface segment is invalid');
   const arity=s.type==='close'?0:s.type==='cubicBezTo'?3:1;
   if(s.points.length!==arity)throw new TypeError('Native surface segment points are invalid');
   const coordinates=s.points.map(p=>{
    if(++points>128||!record(p)||Reflect.ownKeys(p).length!==2||typeof p.x!=='number'||typeof p.y!=='number'
     ||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)
     throw new TypeError('Native surface point is invalid');
    return {x:p.x,y:p.y};
   });
   return {type:/** @type {Segment['type']} */(s.type),points:coordinates};
  });
  if(filled&&parsed.at(-1)?.type!=='close'||parsed.filter(s=>s.type==='lnTo'||s.type==='cubicBezTo').length<1)
   throw new TypeError('Native surface path closure is invalid');
  return {filled,segments:parsed};
 });
}
/** @returns {Record<string,unknown>} */
function surfacePathsSchema(){
 return {type:['array','null'],minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,
  required:['filled','segments'],properties:{filled:{type:'boolean'},segments:{type:'array',minItems:2,maxItems:32,
   items:{type:'object',additionalProperties:false,required:['type','points'],properties:{
    type:{type:'string',enum:['moveTo','lnTo','cubicBezTo','close']},points:{type:'array',maxItems:3,
     items:{type:'object',additionalProperties:false,required:['x','y'],properties:{
      x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}}}}}}}}};
}
/** Reject self-crossing exteriors before source paint can grant a surface.
 * Uses the actual flattened native path and bounded geometry work.
 * @param {{x:number,y:number}[]} input */
function simpleSurfaceBoundary(input){
 const vertices=input.filter((p,i)=>i===0||p.x!==input[i-1]?.x||p.y!==input[i-1]?.y);
 const first=vertices[0],last=vertices.at(-1);
 if(!first||!last||first.x!==last.x||first.y!==last.y||vertices.length<4)return false;
 vertices.pop();let work=0,area=0;
 /** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @param {{x:number,y:number}} c */
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length];if(!a||!b)return false;area+=a.x*b.y-b.x*a.y;
  for(let j=i+1;j<vertices.length;j++){
   if(++work>4000000)return false;
   if(j===i+1||i===0&&j===vertices.length-1)continue;
   const c=vertices[j],d=vertices[(j+1)%vertices.length];if(!c||!d)return false;
   if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
    ||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))continue;
   if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return false;
  }
 }
 return Math.abs(area)>1e-8;
}
const SURFACE_PATH_PROMPT=' For a complete nonstandard physical container, use kind pathSurface and paths:[{filled:boolean,segments:[{type:moveTo/lnTo/cubicBezTo/close,points:[{x,y}]}]}]. All points are finite 0-1 coordinates relative to THIS object box, never atlas/source pixels. moveTo and lnTo take ONE point, cubicBezTo THREE (two controls and endpoint), close NONE. The first path is the complete closed filled exterior; subsequent faces or dividers must stay inside and share the exterior, not detached internal figures. Every path starts with moveTo, has no later moveTo, and a filled path ends with close. Maximum16 paths,64 segments TOTAL,128 points TOTAL; all share the existing parent-part and output budgets. Include every actual face/divider, not an approximate standard template. Use paths:null for kinds other than pathSurface and openPaths. Never put glyphs, pictorial icons, independently meaningful nodes or relation shafts in these paths; preserve their separate original inventories. Paths grant no source paint/ownership: every exposed stroke and whole face must pass the unchanged independent source verifier. For a container REGION that is a transparent open composition with no common closed surface, propose kind openPaths with ALL actual independent paint paths. Every path must have filled:false, no close segment, and remain relative to the complete unchanged member envelope. Keep its container kind, all children, objects, labels, relations and independent inventory counts. This representation cannot be a relation endpoint or supply an opaque body, erasure or ports. It requires complete final source accounting and every original member, not only these paths. Use openPaths only on container regions, never on individual objects or to approximate a closed body.';
module.exports={parseSurfacePaths,surfacePathsSchema,simpleSurfaceBoundary,SURFACE_PATH_PROMPT};
