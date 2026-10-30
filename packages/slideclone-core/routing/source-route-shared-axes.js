// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** Reconcile axis constraints for a measured geometry candidate. Only an
 * existing single-leg graph edge joins coordinates: proximity never joins
 * parallel buses. This internal transform grants no pixel/erasure proof.
 * Fixed ports and each joint's incident stroke scale bound the solve.
 * @param {{original:Map<number,Point>,proposed:Map<number,Point>,fixed:Set<number>,
 * edges:{from:number,to:number,widthPx:number}[],legs:({axis:'h'|'v'}[]|null)[],charge:(count:number)=>void}} input
 * @returns {Map<number,Point>|null} */
function reconcileSourceRouteAxes({original,proposed,fixed,edges,legs,charge}){
 charge(original.size*8+edges.length*3);
 const widths=new Map();
 for(const edge of edges)for(const id of [edge.from,edge.to])widths.set(id,Math.max(widths.get(id)??2,edge.widthPx));
 const result=new Map([...proposed].map(([id,p])=>[id,{...p}]));
 for(const coordinate of /** @type {const} */(['x','y'])){
  const parents=new Map([...original.keys()].map(id=>[id,id]));
  /** @param {number} id @returns {number} */
  const root=id=>{let at=id;while(parents.get(at)!==at){charge(1);const next=parents.get(at);if(next===undefined)throw new TypeError('Native route joint is invalid');at=next;}return at;};
  for(const [i,edge]of edges.entries()){
   charge(1);const own=legs[i];if(own?.length!==1||own[0]?.axis!==(coordinate==='x'?'v':'h'))continue;
   const a=root(edge.from),b=root(edge.to);parents.set(Math.max(a,b),Math.min(a,b));
  }
  /** @type {Map<number,number[]>} */const groups=new Map();
  for(const id of original.keys()){charge(1);const at=root(id),group=groups.get(at)??[];group.push(id);groups.set(at,group);}
  for(const ids of groups.values()){
   if(ids.length<2)continue;charge(ids.length*4);
   const anchors=ids.filter(id=>fixed.has(id)).map(id=>/** @type {Point} */(original.get(id))[coordinate]);
   // Two distinct fixed ports cannot define one orthogonal bus. Keep the
   // original measured paths rather than moving a port or adding a tiny jog.
   if(anchors.some(value=>value!==anchors[0]))return null;
   const values=ids.map(id=>/** @type {Point} */(proposed.get(id))[coordinate]).sort((a,b)=>a-b);
   const target=anchors[0]??/** @type {number} */(values[Math.floor(values.length/2)]);
   for(const id of ids){const p=result.get(id);if(!p)throw new TypeError('Native route joint is invalid');p[coordinate]=target;}
  }
 }
 for(const [id,p]of result){
  charge(1);const before=original.get(id);if(!before)throw new TypeError('Native route joint is invalid');
  if(fixed.has(id)&&(p.x!==before.x||p.y!==before.y)||Math.hypot(p.x-before.x,p.y-before.y)>Math.max(16,(widths.get(id)??2)*5))return null;
 }
 return result;
}
module.exports={reconcileSourceRouteAxes};
