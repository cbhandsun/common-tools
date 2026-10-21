// @ts-check
'use strict';
const {thinSourceRoute,simplifySourceRoute}=require('./source-route-centerline');
const {minimumSourceRoutePolyline}=require('./source-route-minimum-polyline');

/** @param {Uint8Array} skeleton @param {number} width */
const getNb=(skeleton,width)=>n=>{
 const res=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;
  if(dx&&dy&&(skeleton[n+dx]||skeleton[n+dy*width]))continue;
  const k=n+dy*width+dx;
  if(k>=0&&k<skeleton.length&&skeleton[k])res.push(k);
 }
 return res;
};

/** @param {Uint8Array} skeleton @param {Uint8Array} mask @param {number} width @param {number} height @param {number[]} terminals */
function pruneInternalSpurs(skeleton,mask,width,height,terminals){
 const termSet=new Set(terminals);
 const nb=getNb(skeleton,width);
 for(let n=0;n<skeleton.length;n++){
  if(!skeleton[n]||termSet.has(n))continue;
  if(nb(n).length!==1)continue;
  const chain=[n];
  let at=n,before=-1,junction=-1;
  while(chain.length<=6){
   const next=nb(at).filter(k=>k!==before);
   if(next.length!==1)break;
   const k=next[0];
   if(k===undefined||termSet.has(k))break;
   if(nb(k).length>=3){junction=k;break;}
   before=at;at=k;chain.push(k);
  }
  if(junction<0||chain.length>6)continue;
  let internal=true;
  for(const c of chain){
   const cx=c%width,cy=Math.floor(c/width);
   let flankInk=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx||dy){
     const k=(cy+dy)*width+(cx+dx);
     if(k>=0&&k<mask.length&&mask[k])flankInk++;
    }
   }
   if(flankInk<5){internal=false;break;}
  }
  if(internal){
   for(const c of chain)skeleton[c]=0;
  }
 }
}

/** @param {Uint8Array} skeleton @param {number} width @param {number} height @param {number[]} terminals @param {{checks:number}} work */
function breakSkeletonCycles(skeleton,width,height,terminals,work){
 const termSet=new Set(terminals);
 const nb=getNb(skeleton,width);
 for(let iter=0;iter<16;iter++){
  if(++work.checks>4000000)return false;
  const graph=new Map();let totalDegree=0;
  for(let n=0;n<skeleton.length;n++){
   if(!skeleton[n])continue;
   const nbs=nb(n);graph.set(n,nbs);totalDegree+=nbs.length;
  }
  if(!graph.size)return false;
  if(totalDegree/2<=graph.size-1)break;
  const joints=[...graph].filter(([,near])=>near.length!==2).map(([n])=>n);
  const used=new Set();
  /** @type {{from:number,to:number,cells:number[]}[]} */const jointEdges=[];
  for(const from of joints)for(const first of graph.get(from)??[]){
   if(used.has(from+':'+first))continue;
   const cells=[from];let before=from,at=first;
   for(;;){
    if(++work.checks>4000000)return false;
    used.add(before+':'+at);used.add(at+':'+before);cells.push(at);
    if(joints.includes(at))break;
    const next=graph.get(at)?.find(n=>n!==before);
    if(next===undefined)break;
    before=at;at=next;
   }
   jointEdges.push({from,to:at,cells});
  }
  const jAdj=new Map();
  for(const j of joints)jAdj.set(j,[]);
  for(const [edgeIdx,e]of jointEdges.entries()){
   jAdj.get(e.from)?.push({to:e.to,edgeIdx});
   jAdj.get(e.to)?.push({to:e.from,edgeIdx});
  }
  const root=joints[0];if(root===undefined)break;
  const parent=new Map([[root,{node:-1,edgeIdx:-1}]]);
  const queue=[root];
  let backEdge=null;
  search:for(const curr of queue){
   for(const {to,edgeIdx}of jAdj.get(curr)??[]){
    if(edgeIdx===parent.get(curr)?.edgeIdx)continue;
    if(parent.has(to)){
     backEdge={u:curr,v:to,edgeIdx};
     break search;
    }
    parent.set(to,{node:curr,edgeIdx});queue.push(to);
   }
  }
  if(!backEdge)break;
  const cycleEdgeIndices=[backEdge.edgeIdx];
  const uAncestors=new Map();
  let at=backEdge.u;
  while(at!==-1&&parent.has(at)){
   const p=parent.get(at);if(!p||p.node===-1)break;
   uAncestors.set(at,p.edgeIdx);at=p.node;
  }
  at=backEdge.v;let lca=root;
  const vEdges=[];
  while(at!==-1&&parent.has(at)){
   if(at===backEdge.u||uAncestors.has(at)){lca=at;break;}
   const p=parent.get(at);if(!p||p.node===-1)break;
   vEdges.push(p.edgeIdx);at=p.node;
  }
  cycleEdgeIndices.push(...vEdges);
  at=backEdge.u;
  while(at!==lca&&uAncestors.has(at)){
   const eIdx=uAncestors.get(at);
   if(eIdx!==undefined)cycleEdgeIndices.push(eIdx);
   const p=parent.get(at);if(!p)break;
   at=p.node;
  }
  let bestEdge=null,maxLen=-1;
  for(const idx of cycleEdgeIndices){
   const e=jointEdges[idx];if(!e)continue;
   if(e.cells.some((c,i)=>i>0&&i<e.cells.length-1&&termSet.has(c)))continue;
   if(e.cells.length>maxLen){maxLen=e.cells.length;bestEdge=e;}
  }
  if(!bestEdge)return false;
  for(let i=1;i<bestEdge.cells.length-1;i++){
   skeleton[bestEdge.cells[i]]=0;
  }
 }
 return true;
}

/** Topology only; no source ownership, head, paint or attachment authority.
 * Keep all original skeleton cells, including every branch. Compression is
 * through degree-two chains, never by dropping inconvenient graph vertices.
 * @param {{mask:Uint8Array,width:number,height:number,terminals:number[],work:{checks:number}}} input */
function sourceSharedShaftTree({mask,width,height,terminals,work}){
 if(!(mask instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<3||height<3
  ||width*height>262144||mask.length!==width*height||terminals.length<3||terminals.length>32
  ||new Set(terminals).size!==terminals.length||terminals.some(n=>!Number.isSafeInteger(n)||n<0||n>=mask.length||!mask[n])
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>=4000000)return null;
 const protectedCells=new Uint8Array(mask.length);for(const n of terminals)protectedCells[n]=1;
 const skeleton=thinSourceRoute(mask,width,height,work,protectedCells);if(!skeleton)return null;

 pruneInternalSpurs(skeleton,mask,width,height,terminals);
 if(!breakSkeletonCycles(skeleton,width,height,terminals,work))return null;

 /** @type {Map<number,number[]>} */const graph=new Map();
 for(let n=0;n<skeleton.length;n++){
  if(!skeleton[n])continue;if(++work.checks>4000000)return null;
  const x=n%width,y=Math.floor(n/width),neighbours=[];
  if(!x||!y||x===width-1||y===height-1)return null;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;if(++work.checks>4000000)return null;
   if(dx&&dy&&(skeleton[n+dx]||skeleton[n+dy*width]))continue;
   const k=n+dy*width+dx;if(skeleton[k])neighbours.push(k);
  }
  if(neighbours.length<1||neighbours.length>4||neighbours.length===1!==terminals.includes(n))return null;
  graph.set(n,neighbours);
 }
 const root=terminals[0];if(root===undefined)return null;
 const visited=new Set([root]),queue=[root];let degree=0;
 for(const n of queue){for(const next of graph.get(n)??[]){if(++work.checks>4000000)return null;degree++;
  if(!visited.has(next)){visited.add(next);queue.push(next);}}}
 if(visited.size!==graph.size||degree/2!==graph.size-1)return null;
 const joints=[...graph].filter(([,near])=>near.length!==2).map(([n])=>n);
 if(joints.length<4||joints.length>33)return null;
 const used=new Set();
 /** @type {{from:number,to:number,cells:number[],points:{x:number,y:number}[]}[]} */const edges=[];
 for(const from of joints)for(const first of graph.get(from)??[]){
  if(used.has(from+':'+first))continue;
  const cells=[from];let before=from,at=first;
  for(;;){
   if(++work.checks>4000000)return null;
   used.add(before+':'+at);used.add(at+':'+before);cells.push(at);
   if(joints.includes(at))break;
   const next=graph.get(at)?.find(n=>n!==before);if(next===undefined||cells.length>512)return null;
   before=at;at=next;
  }
  const points=simplifySourceRoute(cells.map(n=>({x:n%width,y:Math.floor(n/width)})),work);if(!points)return null;
  edges.push({from,to:at,cells,points});
 }
 const jointParts=joints.filter(n=>!terminals.includes(n)).length;
 const maxParts=Math.max(32,(terminals.length-1)*20);
 let partCount=edges.reduce((n,e)=>n+(e.points.length-1)*2-1,0)+jointParts;
 if(partCount>maxParts){
  const sorted=[...edges].sort((a,b)=>b.points.length-a.points.length);
  for(const edge of sorted){
   if(work.checks>3850000)break;
   const points=minimumSourceRoutePolyline({points:edge.cells.map(n=>({x:n%width,y:Math.floor(n/width)})),work});
   if(points&&points.length<edge.points.length){
    partCount-=(edge.points.length-points.length)*2;
    edge.points=points;
   }
  }
 }
 if(edges.length!==joints.length-1||partCount>maxParts)return null;
 return {joints,edges,skeleton,partCount};
}
module.exports={sourceSharedShaftTree};
