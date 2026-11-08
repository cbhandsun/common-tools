// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** Recenter digital thinning spurs on their original observed cross sections.
 * Only original ink cells may appear in the result; every connecting cell is
 * checked. Keep physical contacts, original heads, 512 cells and shared work.
 * Full coverage, paint, direction and simplification remain separate proofs.
 * @param {Point[]} path @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {string} direction @param {{checks:number}} work @returns {Point[]|null} */
function centerSourceRoute(path,mask,width,height,direction,work){
 if(path.length<2||path.length>512)return null;
 const centered=[];
 for(const [i,p]of path.entries()){
  if(++work.checks>4000000)return null;
  if(i===0||i===path.length-1||['backward','both'].includes(direction)&&i<12||['forward','both'].includes(direction)&&i>=path.length-12){centered.push(p);continue;}
  const q=path[i+2]??path[i-2];if(!q)return null;
  const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(!length){centered.push(p);continue;}
  /** @param {number} d */const ink=d=>{
   if(++work.checks>4000000)return false;
   const x=Math.round(p.x-dy/length*d),y=Math.round(p.y+dx/length*d);
   return x>=0&&y>=0&&x<width&&y<height&&!!mask[y*width+x];
  };
  let low=0,high=0;while(low>-12&&ink(low-1))low--;while(high<12&&ink(high+1))high++;
  if(work.checks>4000000)return null;
  const d=(low+high)/2,x=Math.round(p.x-dy/length*d),y=Math.round(p.y+dx/length*d);
  centered.push(low===-12||high===12||!mask[y*width+x]?p:{x,y});
 }
 const first=centered[0];if(!first)return null;
 const result=[first],seen=new Set([first.y*width+first.x]);
 for(let i=1;i<centered.length;i++){
  const p=centered[i-1],q=centered[i];if(!p||!q)return null;
  const steps=Math.max(Math.abs(q.x-p.x),Math.abs(q.y-p.y));
  for(let k=1;k<=steps;k++){
   if(++work.checks>4000000)return null;
   const x=Math.round(p.x+(q.x-p.x)*k/steps),y=Math.round(p.y+(q.y-p.y)*k/steps),cell=y*width+x;
   if(x<0||x>=width||y<0||y>=height||!mask[cell]||seen.has(cell)||result.length>=512)return null;
   seen.add(cell);result.push({x,y});
  }
 }
 return result;
}
module.exports={centerSourceRoute};
