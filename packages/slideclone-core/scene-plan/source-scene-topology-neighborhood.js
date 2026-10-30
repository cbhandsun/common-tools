// @ts-check
'use strict';
/** A source anchor selects a spatial neighbourhood, not every node in a page
 * ancestor. Keep original physical bodies (including a containing icon body)
 * and the nearest facing surfaces on each side. This nominates review only;
 * no distance threshold, attachment permission or source scan is introduced.
 * Unanchored legacy proposals retain their complete scope.
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {import('./source-scene-plan').Relation} relation
 * @param {{id:string,box:import('./source-scene-plan').Box}[]} pool */
function sceneTopologyNeighborhood(plan,relation,pool){
 const anchor=relation.shaftBox;if(!anchor)return pool;
 const selected=new Set();
 for(const id of [relation.fromId,relation.toId]){
  const entity=[...plan.objects,...plan.regions,...(plan.textEndpoints??[])].find(e=>e.id===id);if(!entity)continue;
  for(const e of pool)if(e.id===id||e.box.x<=entity.box.x&&e.box.y<=entity.box.y
   &&e.box.x+e.box.w>=entity.box.x+entity.box.w&&e.box.y+e.box.h>=entity.box.y+entity.box.h
   ||plan.textEndpoints?.some(t=>t.id===e.id)&&e.box.x>=entity.box.x&&e.box.y>=entity.box.y
    &&e.box.x+e.box.w<=entity.box.x+entity.box.w&&e.box.y+e.box.h<=entity.box.y+entity.box.h)selected.add(e.id);
 }
 const horizontal=anchor.w>=anchor.h;
 const start=horizontal?anchor.x:anchor.y,end=start+(horizontal?anchor.w:anchor.h);
 const crossStart=horizontal?anchor.y:anchor.x,crossEnd=crossStart+(horizontal?anchor.h:anchor.w);
 const rows=pool.map(e=>{
  const a=horizontal?e.box.x:e.box.y,b=a+(horizontal?e.box.w:e.box.h);
  const c=horizontal?e.box.y:e.box.x,d=c+(horizontal?e.box.h:e.box.w);
  return {e,a,b,c,d};
 }).filter(r=>r.c<=crossEnd&&r.d>=crossStart);
 for(const r of rows)if(r.a<=end&&r.b>=start)selected.add(r.e.id);
 for(const before of [true,false]){
  const candidates=rows.filter(r=>before?r.b<start:r.a>end);
  const distance=before?Math.min(...candidates.map(r=>start-r.b)):Math.min(...candidates.map(r=>r.a-end));
  for(const r of candidates)if((before?start-r.b:r.a-end)===distance)selected.add(r.e.id);
 }
 return pool.filter(e=>selected.has(e.id));
}
module.exports={sceneTopologyNeighborhood};
