// @ts-check
"use strict";
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{kind:'polyline',dash:'solid',vertices:Point[]}} PathProgram */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @param {number} width @param {number} height @returns {value is Box} */
function validBox(value,width,height){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=width&&Number(value.y)+Number(value.h)<=height;}
/** This is a bounded observation proposal, never paint or attachment proof.
 * Every path reuses one existing relation slot and at most 16 vertices, so its
 * real connector/control expansion still fits the original 32-part ceiling.
 * Unsupported representations fail explicitly instead of silently vanishing.
 * @param {unknown} value
 * @param {{widthPx:number,heightPx:number,coordinateSpace:string,owner:Box,shaftBox?:Box}} frame
 * @returns {PathProgram|undefined} */
function parseScenePathProgram(value,frame){
 if(value===undefined)return undefined;
 if(!record(frame)||![frame.widthPx,frame.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||frame.widthPx*frame.heightPx>40000000||!validBox(frame.owner,frame.widthPx,frame.heightPx)
  ||frame.shaftBox!==undefined&&!validBox(frame.shaftBox,frame.widthPx,frame.heightPx)
  ||!['source-pixels','normalized-1000','compiled-source-pixels'].includes(frame.coordinateSpace))
  throw new TypeError('Scene path program frame is invalid');
 if(!record(value)||Object.keys(value).length!==3||value.kind!=='polyline'||value.dash!=='solid')
  throw new TypeError('Scene path program representation is unsupported');
 const raw=value.vertices;
 if(!list(raw)||raw.length<2||raw.length>16)throw new TypeError('Scene path program collection is invalid');
 const normalized=frame.coordinateSpace==='normalized-1000',compiled=frame.coordinateSpace==='compiled-source-pixels';
 const vertices=raw.map(p=>{
  if(!record(p)||Object.keys(p).length!==2||!['x','y'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&(compiled||Number.isSafeInteger(p[k]))))
   throw new TypeError('Scene path program vertex is invalid');
  const x=Number(p.x)*(normalized?frame.widthPx/1000:1),y=Number(p.y)*(normalized?frame.heightPx/1000:1);
  const b=frame.owner;
  if(x<0||y<0||x>frame.widthPx||y>frame.heightPx||x<b.x||y<b.y||x>b.x+b.w||y>b.y+b.h
   ||frame.shaftBox&&(x<frame.shaftBox.x||y<frame.shaftBox.y||x>frame.shaftBox.x+frame.shaftBox.w||y>frame.shaftBox.y+frame.shaftBox.h))
   throw new TypeError('Scene path program scope is invalid');
  return {x,y};
 });
 if(vertices.some((p,i)=>i>0&&p.x===vertices[i-1]?.x&&p.y===vertices[i-1]?.y))
  throw new TypeError('Scene path program contains an empty segment');
 return {kind:'polyline',dash:'solid',vertices};
}
/** Geometry narrows which independently observed complete source route is
 * being proposed. Keep the original outline's 1.5px bound, and debit each
 * distance calculation to the existing route geometry work allowance.
 * @param {Point[]} path @param {PathProgram} program @param {{checks:number}} work */
function sourceRouteMatchesProgram(path,program,work){
 for(const p of path){
  let distance=Infinity;
  for(let i=1;i<program.vertices.length;i++){
   if(++work.checks>4000000)return false;
   const a=program.vertices[i-1],b=program.vertices[i];if(!a||!b)return false;
   const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
   const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
   distance=Math.min(distance,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
  }
  if(distance>1.5)return false;
 }
 // A source path must also cover every declared turn. A shorter straight
 // arrow cannot impersonate a proposed return loop with the same endpoints.
 for(const vertex of program.vertices){
  let distance=Infinity;
  for(const p of path){if(++work.checks>4000000)return false;distance=Math.min(distance,Math.hypot(p.x-vertex.x,p.y-vertex.y));}
  if(distance>1.5)return false;
 }
 return true;
}
/** A contextual window may contain unrelated marks. Only the complete target
 * ink component can supply ownership. It must be wholly inside the ORIGINAL
 * observation window; a clipped branch cannot disappear behind a path hint.
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {Point[]} path @param {{checks:number}} work */
function sourceRouteComponentIsComplete(mask,width,height,path,work){
 const first=path[0];if(!first)return false;
 const seed=first.y*width+first.x,seen=new Uint8Array(mask.length),pending=[seed];seen[seed]=1;
 for(let k=0;k<pending.length;k++){
  const cell=pending[k];if(cell===undefined)return false;const x=cell%width,y=Math.floor(cell/width);
  if(x===0||y===0||x===width-1||y===height-1)return false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return false;
   const xx=x+dx,yy=y+dy,n=yy*width+xx;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[n]&&!seen[n]){seen[n]=1;pending.push(n);}
  }
 }
 return true;
}
module.exports={parseScenePathProgram,sourceRouteMatchesProgram,sourceRouteComponentIsComplete};
