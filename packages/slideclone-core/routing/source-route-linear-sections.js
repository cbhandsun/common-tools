// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** Map independently simplified straight runs back to their original samples.
 * Recheck every intervening point against the original finite-segment .75px
 * bound. Missing head vertices do not create sections; short bevels retain
 * the caller's original local frame. No source point is moved or removed.
 * @param {unknown} input */
function sourceRouteLinearSections(input){
 if(!record(input)||![input.path,input.points].every(ps=>list(ps)&&ps.length>=2&&ps.length<=512
  &&ps.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)))
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0
  ||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true)throw new TypeError('Source linear sections are invalid');
 const path=/** @type {Point[]} */(input.path),points=/** @type {Point[]} */(input.points),work=/** @type {{checks:number}} */(input.work);
 /** @type {Map<string,number>} */const indices=new Map();
 for(const [i,p]of path.entries()){
  if(++work.checks>4000000)return null;
  const key=p.x+':'+p.y;if(indices.has(key))return null;indices.set(key,i);
 }
 /** @type {{low:number,high:number,direction:Point}[]} */const sections=[];
 for(let i=1;i<points.length;i++){
  if(++work.checks>4000000)return null;
  const a=points[i-1],b=points[i];if(!a||!b)return null;
  const low=indices.get(a.x+':'+a.y),high=indices.get(b.x+':'+b.y);
  if(low===undefined||high===undefined)continue;
  if(high<=low)return null;if(high-low<4)continue;
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)return null;
  for(let k=low+1;k<high;k++){
   if(++work.checks>4000000)return null;const p=path[k];if(!p)return null;
   const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));
   if((p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2>.75*.75)return null;
  }
  sections.push({low,high,direction:{x:dx,y:dy}});
 }
 return sections;
}
module.exports={sourceRouteLinearSections};
