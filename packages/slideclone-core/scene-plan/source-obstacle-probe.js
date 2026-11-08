// @ts-check
'use strict';
/** Exact local rectangle queries under the observer's existing work ledger.
 * Indexing only removes impossible comparisons; half-open membership and all
 * obstacles remain unchanged. An exhausted index fails closed for all probes.
 * Inputs are internal, after the enclosing source observer's boundary checks.
 * @param {import('./source-scene-plan').Box[]} obstacles
 * @param {import('./source-scene-plan').Box} window @param {{checks:number}} work */
function createSourceObstacleProbe(obstacles,window,work){
 const size=32;
 /** @type {Map<string,import('./source-scene-plan').Box[]>} */const buckets=new Map();let exhausted=false;
 for(const box of obstacles){
  if(++work.checks>4000000){exhausted=true;break;}
  const left=Math.max(box.x,window.x),top=Math.max(box.y,window.y),right=Math.min(box.x+box.w,window.x+window.w),bottom=Math.min(box.y+box.h,window.y+window.h);
  if(left>=right||top>=bottom)continue;
  for(let y=Math.floor(top/size);y<=Math.floor(bottom/size);y++)for(let x=Math.floor(left/size);x<=Math.floor(right/size);x++){
   if(++work.checks>4000000){exhausted=true;break;}
   const key=`${x}:${y}`,list=buckets.get(key)??[];list.push(box);buckets.set(key,list);
  }
  if(exhausted)break;
 }
 /** @param {{x:number,y:number}} point */
 return point=>{
  if(exhausted||++work.checks>4000000)return true;
  // Outside the observation, retain exact comparisons. No unindexed source
  // point acquires an empty-space certificate merely by leaving the window.
  const candidates=point.x<window.x||point.y<window.y||point.x>=window.x+window.w||point.y>=window.y+window.h
   ?obstacles:buckets.get(`${Math.floor(point.x/size)}:${Math.floor(point.y/size)}`)??[];
  return candidates.some(box=>++work.checks>4000000||point.x>=box.x&&point.x<box.x+box.w&&point.y>=box.y&&point.y<box.y+box.h);
 };
}
module.exports={createSourceObstacleProbe};
