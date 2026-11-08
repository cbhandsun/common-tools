// @ts-check
"use strict";
// A route with n vertices has n-1 connectors and n-2 internal joints.
// Derive its vertex bound from the unchanged physical-part allowance.
const SOURCE_ROUTE_PART_LIMIT=32;
const SOURCE_ROUTE_VERTEX_LIMIT=Math.floor((SOURCE_ROUTE_PART_LIMIT+3)/2);
/** @typedef {{x:number,y:number}} Point */
/** Topology-preserving thinning of an already charged, isolated source mask.
 * Geometry work shares one 4M check allowance; exhaustion yields no path.
 * @param {Uint8Array} input @param {number} width @param {number} height
 * @param {{checks:number}} work @param {Uint8Array} [terminals] @returns {Uint8Array|null} */
function thinSourceRoute(input,width,height,work,terminals){
 const mask=input.slice(),removed=[],active=[];
 // Thinning only deletes original foreground cells. Enumerate them once;
 // subsequent phases use the same parallel deletion rule and round limit,
 // without repeatedly walking the unchanging empty source window.
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  if(++work.checks>4000000)return null;const i=y*width+x;if(mask[i])active.push(i);
 }
 for(let round=0;round<12;round++){
  let changed=false;
  for(let phase=0;phase<2;phase++){
   removed.length=0;
   for(const i of active){
    if(++work.checks>4000000)return null;
    if(!mask[i]||terminals?.[i])continue;
    const p=[mask[i-width],mask[i-width+1],mask[i+1],mask[i+width+1],mask[i+width],mask[i+width-1],mask[i-1],mask[i-width-1]].map(n=>n??0);
    const count=p.reduce((s,n)=>s+n,0),transitions=p.filter((n,j)=>!n&&p[(j+1)%8]).length;
    if(count<2||count>6||transitions!==1)continue;
    const top=p[0]??0,right=p[2]??0,bottom=p[4]??0,left=p[6]??0;
    if(phase===0?(top*right*bottom||right*bottom*left):(top*right*left||top*bottom*left))continue;
    removed.push(i);
   }
   for(const i of removed)mask[i]=0;
   changed ||=removed.length>0;
  }
  if(!changed)return mask;
 }
 return null;
}
/** @param {number} index @param {number} width @param {number} height */
function adjacent(index,width,height){
 const x=index%width,y=Math.floor(index/width),out=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&y+dy>=0&&x+dx<width&&y+dy<height)out.push((y+dy)*width+x+dx);
 return out;
}
/** Preserve one observed tip per distinct source contact in each connected
 * component. Thick terminal strips are not separate ports; different bodies,
 * components and contact locations remain independent. Never protect a blank
 * pixel or connect components. Private contour hypotheses are supplied by the
 * route measurer and acquire attachment authority only after its final proof.
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {(index:number)=>{index:number,point:Point,distance:number}|null} fromSite
 * @param {(index:number)=>{index:number,point:Point,distance:number}|null} toSite
 * @param {{checks:number}} work @returns {Uint8Array|null} */
function sourceRouteTerminalMask(mask,width,height,fromSite,toSite,work){
 const terminals=new Uint8Array(mask.length),seen=new Uint8Array(mask.length),queue=new Uint32Array(mask.length);
 for(let seed=0;seed<mask.length;seed++){
  if(++work.checks>4000000)return null;if(!mask[seed]||seen[seed])continue;
  let head=0,tail=1;queue[0]=seed;seen[seed]=1;
  /** @type {{anchor:Point,chosen:{index:number,point:Point,distance:number}}[][]} */const groups=[[],[]];
  while(head<tail){
   const cell=queue[head++]??0;
   for(const [side,site] of [fromSite,toSite].entries()){
    const candidate=site(cell);if(work.checks>4000000)return null;if(!candidate)continue;
    const contacts=groups[side];if(!contacts)return null;
    const previous=contacts.find(p=>Math.hypot(p.anchor.x-candidate.point.x,p.anchor.y-candidate.point.y)<=2);
    work.checks+=contacts.length+1;if(work.checks>4000000)return null;
    if(!previous)contacts.push({anchor:{...candidate.point},chosen:candidate});
    else if(candidate.distance<previous.chosen.distance)previous.chosen=candidate;
   }
   for(const next of adjacent(cell,width,height)){
    if(++work.checks>4000000)return null;
    if(mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
   }
  }
  for(const contacts of groups)for(const site of contacts)terminals[site.chosen.index]=1;
 }
 return terminals;
}
/** Only sites in the same observed skeleton component are path hypotheses.
 * Unrelated boundary fringe must not spend the 32-pair authority capacity.
 * Labeling and enumeration remain inside the original geometry work cap.
 * @template {{index:number}} T
 * @template {{index:number}} U
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {T[]} starts @param {U[]} ends @param {{checks:number}} work
 * @returns {[T,U][]|null} */
function sourceRouteConnectedPairs(mask,width,height,starts,ends,work){
 const labels=new Uint32Array(mask.length),queue=new Uint32Array(mask.length);let label=0;
 for(let seed=0;seed<mask.length;seed++){
  if(++work.checks>4000000)return null;if(!mask[seed]||labels[seed])continue;
  label++;let head=0,tail=1;queue[0]=seed;labels[seed]=label;
  while(head<tail){
   const cell=queue[head++]??0;
   for(const next of adjacent(cell,width,height)){
    if(++work.checks>4000000)return null;
    if(mask[next]&&!labels[next]){labels[next]=label;queue[tail++]=next;}
   }
  }
 }
 /** @type {Map<number,U[]>} */const byComponent=new Map();
 for(const end of ends){
  if(++work.checks>4000000)return null;const id=labels[end.index];if(!id)continue;
  const list=byComponent.get(id)??[];list.push(end);byComponent.set(id,list);
 }
 /** @type {[T,U][]} */const pairs=[];
 for(const start of starts)for(const end of byComponent.get(labels[start.index]??0)??[]){
  if(++work.checks>4000000||pairs.length>=32)return null;pairs.push([start,end]);
 }
 return pairs;
}
/** Find an actual continuous path. Diagonal corner shortcuts retain their
 * exact source cells; no gap closing, inferred edge or extra relation occurs.
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {number} start @param {number} end @param {{checks:number}} work
 * @returns {Point[]|null} */
function sourceRoutePath(mask,width,height,start,end,work){
 const queue=new Uint32Array(mask.length),previous=new Int32Array(mask.length).fill(-1);
 let head=0,tail=1;queue[0]=start;previous[start]=start;
 while(head<tail){
  if(++work.checks>4000000)return null;
  const i=queue[head++]??0;if(i===end)break;
  for(const n of adjacent(i,width,height))if(mask[n]&&previous[n]===-1){previous[n]=i;queue[tail++]=n;}
 }
 if(previous[end]===-1)return null;
 const result=[];let i=end;
 for(let count=0;count<512;count++){
  result.push({x:i%width,y:Math.floor(i/width)});
  if(i===start)return result.reverse();
  i=previous[i]??-1;if(i<0)return null;
 }
 return null;
}
/** Exact source polyline simplification. Every intervening point remains
 * within .75px of its finite segment. At most 17 vertices fit the existing
 * 32-part physical-unit capacity (segments plus explicit route controls).
 * A shared graph may supply its independently bounded aggregate capacity;
 * the single-relation default never changes. This creates no source proof.
 * @param {Point[]} points @param {{checks:number}} work @param {number} [vertexLimit] @returns {Point[]|null} */
function simplifySourceRoute(points,work,vertexLimit=SOURCE_ROUTE_VERTEX_LIMIT){
 if(!Number.isSafeInteger(vertexLimit)||vertexLimit<2||vertexLimit>120)throw new TypeError('Source route vertex capacity is invalid');
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){
  const [lo,hi]=stack.pop()??[],a=points[lo??-1],b=points[hi??-1];if(!a||!b)return null;
  let far=-1,maximum=.75*.75;const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  for(let i=(lo??0)+1;i<(hi??0);i++){
   if(++work.checks>4000000)return null;
   const p=points[i];if(!p)return null;
   const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
   const d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;if(d>maximum){maximum=d;far=i;}
  }
  if(far>=0){keep.add(far);if(keep.size>vertexLimit)return minimumSourceRoute(points,work,vertexLimit);stack.push([lo??0,far],[far,hi??0]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>/** @type {Point} */(points[i]));
}
/** Greedy splits do not prove that the physical part capacity is impossible.
 * Search the acyclic graph of original source vertices only after that fast
 * path overflows. Every edge certifies ALL intervening points against the
 * same finite-segment .75px bound. Dynamic programming minimizes segments;
 * no smoothing, new point, enlarged tolerance or separate work budget occurs.
 * @param {Point[]} points @param {{checks:number}} work @param {number} vertexLimit @returns {Point[]|null} */
function minimumSourceRoute(points,work,vertexLimit){
 if(points.length<2||points.length>512||work.checks>4000000)return null;
 const counts=new Uint16Array(points.length).fill(65535),previous=new Int32Array(points.length).fill(-1);counts[0]=0;
 for(let hi=1;hi<points.length;hi++)for(let lo=0;lo<hi;lo++){
  if(++work.checks>4000000)return null;
  const before=counts[lo]??65535;
  if(before>=vertexLimit-1||before+1>=(counts[hi]??65535))continue;
  const a=points[lo],b=points[hi];if(!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let valid=true;
  for(let i=lo+1;i<hi;i++){
   if(++work.checks>4000000)return null;
   const p=points[i];if(!p)return null;
   const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
   if((p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2>.75*.75){valid=false;break;}
  }
  if(valid){counts[hi]=before+1;previous[hi]=lo;}
 }
 if((counts[points.length-1]??65535)>vertexLimit-1)return null;
 const result=[];let at=points.length-1;
 while(at>=0){
  if(++work.checks>4000000)return null;
  const point=points[at];if(!point)return null;result.push(point);
  if(at===0)return result.reverse();at=previous[at]??-1;
 }
 return null;
}
/** A shortest source path must not discard a connected branch, loop or symbol.
 * Inspect its entire connected ink component. Tapered heads alone can extend
 * beyond the measured shaft radius, inside the existing 12px terminal section.
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {Point[]} path @param {number} shaft @param {boolean} startArrow @param {boolean} endArrow
 * @param {{checks:number}} work */
function sourceRouteCoversComponent(mask,width,height,path,shaft,startArrow,endArrow,work){
 const first=path[0];if(!first)return false;
 // Exact local nearest-point queries avoid comparing every component cell
 // with the whole path. Any accepted cell is within this original maximum
 // radius. Preserve earliest-index ties: they decide terminal-head ownership.
 const radius=Math.max(12,shaft/2+.75);
 /** @type {Map<string,number[]>} */const buckets=new Map();
 for(let k=0;k<path.length;k++){
  if(++work.checks>4000000)return false;
  const p=path[k];if(!p)return false;
  const key=`${Math.floor(p.x/radius)}:${Math.floor(p.y/radius)}`,indices=buckets.get(key)??[];
  indices.push(k);buckets.set(key,indices);
 }
 const visited=new Uint8Array(mask.length),queue=new Uint32Array(mask.length),seed=first.y*width+first.x;
 let head=0,tail=1;queue[0]=seed;visited[seed]=1;
 while(head<tail){
  const i=queue[head++]??0,x=i%width,y=Math.floor(i/width);let nearest=-1,distance=Infinity;
  const bx=Math.floor(x/radius),by=Math.floor(y/radius);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return false;
   for(const k of buckets.get(`${bx+dx}:${by+dy}`)??[]){
    if(++work.checks>4000000)return false;
    const p=path[k];if(!p)return false;const d=(x-p.x)**2+(y-p.y)**2;
    if(d<distance||d===distance&&(nearest<0||k<nearest)){distance=d;nearest=k;}
   }
  }
  const headInk=startArrow&&nearest<12||endArrow&&nearest>=path.length-12;
  if(distance>(headInk?12:(shaft/2+.75))**2)return false;
  for(const n of adjacent(i,width,height))if(mask[n]&&!visited[n]){visited[n]=1;queue[tail++]=n;}
 }
 return true;
}
module.exports={thinSourceRoute,sourceRouteTerminalMask,sourceRouteConnectedPairs,sourceRoutePath,simplifySourceRoute,sourceRouteCoversComponent,
 SOURCE_ROUTE_PART_LIMIT,SOURCE_ROUTE_VERTEX_LIMIT};
