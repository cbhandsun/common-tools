// @ts-check
'use strict';
const {thinSourceRoute,simplifySourceRoute}=require('./source-route-centerline');
const {minimumSourceRoutePolyline}=require('./source-route-minimum-polyline');
/** @typedef {{joints:number[],edges:{from:number,to:number,cells:number[],points:{x:number,y:number}[]}[],skeleton:Uint8Array,partCount:number,cycleCount?:number}} SharedShaftTree */

/** @param {Uint8Array} skeleton @param {number} width */
const getNb=(skeleton,width)=>(/** @type {number} */n)=>{
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

/** Topology only; no source ownership, head, paint or attachment authority.
 * Keep all original skeleton cells, including every branch. Compression is
 * through degree-two chains. A cycle needs a network/path contract; deleting
 * one of its arms cannot turn the original source into a proven tree.
 * @param {{mask:Uint8Array,width:number,height:number,terminals:number[],work:{checks:number}}} input @param {boolean} allowCycles
 * @returns {{tree:SharedShaftTree|null,reason:string}} */
function inspectShaftTopology({mask,width,height,terminals,work},allowCycles){
 /** @param {string} [reason] @returns {{tree:null,reason:string}} */const reject=(reason='shared-shaft-topology')=>({tree:null,reason});
 if(!(mask instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<3||height<3
  ||width*height>262144||mask.length!==width*height||terminals.length<3||terminals.length>32
  ||new Set(terminals).size!==terminals.length||terminals.some(n=>!Number.isSafeInteger(n)||n<0||n>=mask.length||!mask[n])
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>=4000000)return reject();
 const maxParts=Math.max(32,(terminals.length-1)*20);
 // Shared units already have an aggregate part allowance. Applying the
 // single-relation 32-part cap to EACH edge rejects otherwise valid graphs.
 // Reserve two of the writer's 120 vertices for independently proved heads;
 // the complete graph's exact physical count is still checked below.
 const maxEdgeVertices=Math.min(118,Math.floor((maxParts+3)/2));
 const protectedCells=new Uint8Array(mask.length);for(const n of terminals)protectedCells[n]=1;
 const skeleton=thinSourceRoute(mask,width,height,work,protectedCells);if(!skeleton)return reject();

 pruneInternalSpurs(skeleton,mask,width,height,terminals);

 /** @type {Map<number,number[]>} */const graph=new Map();
 for(let n=0;n<skeleton.length;n++){
  if(!skeleton[n])continue;if(++work.checks>4000000)return reject();
  const x=n%width,y=Math.floor(n/width),neighbours=[];
  if(!x||!y||x===width-1||y===height-1)return reject();
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;if(++work.checks>4000000)return reject();
   if(dx&&dy&&(skeleton[n+dx]||skeleton[n+dy*width]))continue;
   const k=n+dy*width+dx;if(skeleton[k])neighbours.push(k);
  }
  if(neighbours.length<1||neighbours.length>4||neighbours.length===1!==terminals.includes(n))return reject();
  graph.set(n,neighbours);
 }
 const root=terminals[0];if(root===undefined)return reject();
 const visited=new Set([root]),queue=[root];let degree=0;
 for(const n of queue){for(const next of graph.get(n)??[]){if(++work.checks>4000000)return reject();degree++;
  if(!visited.has(next)){visited.add(next);queue.push(next);}}}
 if(visited.size!==graph.size)return reject();
 const cycleCount=degree/2-graph.size+1;
 if(cycleCount>0&&!allowCycles)return reject('shared-shaft-cycle');
 if(cycleCount<0||cycleCount>4)return reject('shared-shaft-cycle-capacity');
 const joints=[...graph].filter(([,near])=>near.length!==2).map(([n])=>n);
 if(joints.length<4||joints.length>33)return reject();
 const used=new Set();
 /** @type {{from:number,to:number,cells:number[],points:{x:number,y:number}[]}[]} */const edges=[];
 for(const from of joints)for(const first of graph.get(from)??[]){
  if(used.has(from+':'+first))continue;
  const cells=[from];let before=from,at=first;
  for(;;){
   if(++work.checks>4000000)return reject();
   used.add(before+':'+at);used.add(at+':'+before);cells.push(at);
   if(joints.includes(at))break;
   const next=graph.get(at)?.find(n=>n!==before);if(next===undefined||cells.length>512)return reject();
   before=at;at=next;
  }
  const points=simplifySourceRoute(cells.map(n=>({x:n%width,y:Math.floor(n/width)})),work,maxEdgeVertices);if(!points)return reject();
  edges.push({from,to:at,cells,points});
 }
 const jointParts=joints.filter(n=>!terminals.includes(n)).length;
 let partCount=edges.reduce((n,e)=>n+(e.points.length-1)*2-1,0)+jointParts;
 if(partCount>32){
  const sorted=[...edges].sort((a,b)=>b.points.length-a.points.length);
  for(const edge of sorted){
   if(work.checks>3850000)break;
   const points=minimumSourceRoutePolyline({points:edge.cells.map(n=>({x:n%width,y:Math.floor(n/width)})),work,maxVertices:maxEdgeVertices});
   if(points&&points.length<edge.points.length){
    partCount-=(edge.points.length-points.length)*2;
    edge.points=points;
   }
  }
 }
 // This stage proves topology only. A network may later keep a whole source
 // edge in one native path. Enforce its minimum physical-member capacity
 // here; measured paint/geometry planning enforces the exact output capacity.
 const requiredParts=cycleCount?edges.length+jointParts:partCount;
 if(edges.length!==joints.length-1+cycleCount||requiredParts>maxParts)return reject();
 return {tree:{joints,edges,skeleton,partCount,...(cycleCount?{cycleCount}:{})},reason:'shared-shaft-confirmed'};
}
/** Strict compatibility path. A cyclic source never receives a tree receipt.
 * @param {Parameters<typeof inspectShaftTopology>[0]} input */
function inspectSourceSharedShaftTree(input){return inspectShaftTopology(input,false);}
/** Physical network only. Every cycle arm is preserved; independent edge,
 * paint, full coverage and unique logical path proofs remain mandatory.
 * @param {Parameters<typeof inspectShaftTopology>[0]} input */
function inspectSourceSharedShaftNetwork(input){return inspectShaftTopology(input,true);}
/** Compatibility API for callers requiring a tree or null.
 * @param {Parameters<typeof inspectSourceSharedShaftTree>[0]} input */
function sourceSharedShaftTree(input){return inspectSourceSharedShaftTree(input).tree;}
module.exports={sourceSharedShaftTree,inspectSourceSharedShaftTree,inspectSourceSharedShaftNetwork};
