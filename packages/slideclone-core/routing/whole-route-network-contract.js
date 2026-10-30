// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {wholeRouteCurves}=require('./source-whole-route-geometry');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,reversed:boolean}} Ref */
/** @typedef {{id:string,endpointId:string|null}} Node */
/** @typedef {{id:string,from:string,to:string,memberId:string,points:Point[],width:number}} Edge */
/** @typedef {{from:string,to:string,refs:Ref[],points:Point[],widthPx:number}} Chain */
/** @typedef {{relationId:string,edges:Ref[]}} Path */
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(value);
/** Lossless combinatorial contraction, with geometry read from drawing commands.
 * Every physical edge survives exactly once, including unused cycle arms.
 * Ordered logical paths must traverse WHOLE chains; no set-based deduplication
 * may hide a reversal, missing edge or partial-chain path. No source authority.
 * @param {unknown} input */
function contractWholeRouteNetwork(input){
 const invalid=()=>new TypeError('Whole route network is invalid');
 if(!record(input)||!sharedOutputWork(input.work))throw invalid();const {work}=input;
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @param {unknown} v @returns {Record<string,unknown>} */const obj=v=>{if(!sharedOutputRecord(v,work)){charge(0);throw invalid();}return v;};
 /** @param {unknown} v @param {number} min @param {number} max @returns {unknown[]} */
 const array=(v,min,max)=>{if(types.isProxy(v)||!Array.isArray(v)||v.length<min||v.length>max||!sharedOutputList(v,work)){charge(0);throw invalid();}return v;};
 const graph=obj(input.graph),rawNodes=array(graph.nodes,2,128),rawEdges=array(graph.edges,1,128),rawPaths=array(graph.paths,1,48);
 /** @type {Map<string,Node>} */const nodes=new Map();
 /** @type {Map<string,Edge>} */const edges=new Map();
 /** @type {Map<string,Record<string,unknown>>} */const parts=new Map();
 for(const raw of array(input.parts,1,128)){const part=obj(raw);if(!identity(part.id)||parts.has(part.id))throw invalid();parts.set(part.id,part);}
 for(const raw of rawNodes){const n=obj(raw);if(!identity(n.id)||nodes.has(n.id)||n.endpointId!==null&&!identity(n.endpointId))throw invalid();
  nodes.set(n.id,{id:n.id,endpointId:/** @type {string|null} */(n.endpointId)});}
 /** @type {Map<string,Point>} */const joints=new Map();let samples=0;
 /** @param {string} id @param {Point} p */const joint=(id,p)=>{const prior=joints.get(id);if(prior&&Math.hypot(prior.x-p.x,prior.y-p.y)>1e-6)throw invalid();joints.set(id,{...p});};
 const usedParts=new Set();
 for(const raw of rawEdges){
  const e=obj(raw);if(!identity(e.id)||edges.has(e.id)||!identity(e.from)||!identity(e.to)||!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to
   ||!identity(e.memberId)||usedParts.has(e.memberId))throw invalid();
  const part=parts.get(e.memberId);if(!part)throw invalid();const style=obj(part.style);obj(part.box);
  if(typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0||style.strokeWidthPt>100
   ||style.freeformPath!==undefined&&(typeof style.freeformPath!=='string'||style.freeformPath.length>262144))throw invalid();
  charge((typeof style.freeformPath==='string'?style.freeformPath.length:1920)+32);
  const curves=wholeRouteCurves(/** @type {import('./source-shared-route-output-paint').Item} */(part));
  /** @type {Point[]} */const points=[];
  for(const curve of curves){const a=curve[0],d=curve.at(-1);if(!a||!d)throw invalid();charge(curve.length*8);
   const length=curve.slice(1).reduce((s,p,i)=>{const q=curve[i];if(!q)throw invalid();return s+Math.hypot(p.x-q.x,p.y-q.y);},0);
   const steps=curve.length===2?1:Math.max(2,Math.ceil(length/2));samples+=steps+(points.length?0:1);
   if(samples>4096)return null;charge((steps+1)*16);
   for(let i=points.length?1:0;i<=steps;i++){const t=i/steps,u=1-t;
    if(curve.length===2)points.push({x:u*a.x+t*d.x,y:u*a.y+t*d.y});
    else{const b=curve[1],c=curve[2];if(!b||!c)throw invalid();points.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
     y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});}}
  }
  const a=points[0],b=points.at(-1);if(!a||!b)throw invalid();joint(e.from,a);joint(e.to,b);usedParts.add(e.memberId);
  edges.set(e.id,{id:e.id,from:e.from,to:e.to,memberId:e.memberId,points,width:style.strokeWidthPt});
 }
 if(parts.size!==edges.size||joints.size!==nodes.size)throw invalid();
 /** @type {Map<string,Edge[]>} */const adjacent=new Map();
 for(const id of nodes.keys())adjacent.set(id,[]);
 for(const e of edges.values()){adjacent.get(e.from)?.push(e);adjacent.get(e.to)?.push(e);}
 /** @type {Path[]} */const paths=[];const relationIds=new Set();
 const retained=new Set([...nodes.values()].filter(n=>n.endpointId!==null||adjacent.get(n.id)?.length!==2).map(n=>n.id));
 for(const raw of rawPaths){const p=obj(raw);if(!identity(p.relationId)||relationIds.has(p.relationId))throw invalid();
  const seen=new Set(),visited=new Set();/** @type {Ref[]} */const refs=[];/** @type {string|undefined} */let previous;
  for(const r of array(p.edges,1,128)){const ref=obj(r);if(!identity(ref.id)||typeof ref.reversed!=='boolean'||seen.has(ref.id))throw invalid();
   const edge=edges.get(ref.id);if(!edge)throw invalid();const from=ref.reversed?edge.to:edge.from,to=ref.reversed?edge.from:edge.to;
   if(previous!==undefined&&previous!==from||visited.has(to))throw invalid();if(previous===undefined){retained.add(from);visited.add(from);}
   visited.add(to);previous=to;seen.add(ref.id);refs.push({id:ref.id,reversed:ref.reversed});}
  if(previous===undefined)throw invalid();retained.add(previous);relationIds.add(p.relationId);paths.push({relationId:p.relationId,edges:refs});
 }
 // Keep the endpoints of every unused arm explicit. Final output must retain
 // its existing physical member identity rather than inventing a merged arm.
 const usedEdges=new Set(paths.flatMap(p=>p.edges.map(r=>r.id)));
 for(const edge of edges.values())if(!usedEdges.has(edge.id)){retained.add(edge.from);retained.add(edge.to);}
 // Reject detached physical components instead of quietly dropping them.
 const start=nodes.keys().next().value,visited=new Set(),queue=start?[start]:[];
 while(queue.length){const id=queue.pop();if(id===undefined||visited.has(id))continue;visited.add(id);charge(edges.size+1);
  for(const e of adjacent.get(id)??[])queue.push(e.from===id?e.to:e.from);}
 if(visited.size!==nodes.size)throw invalid();
 /** @returns {Chain[]} */const build=()=>{
  const seen=new Set();/** @type {Chain[]} */const chains=[];
  for(const id of retained)for(const first of adjacent.get(id)??[]){if(seen.has(first.id))continue;
   /** @type {Ref[]} */const refs=[];/** @type {Point[]} */const points=[];let from=id,edge=first,widthPx=0;
   /** @type {string} */let to;
   for(;;){charge(1+edge.points.length);if(seen.has(edge.id))throw invalid();seen.add(edge.id);const reversed=edge.to===from;
    refs.push({id:edge.id,reversed});const own=reversed?edge.points.slice().reverse():edge.points;points.push(...(points.length?own.slice(1):own));
    widthPx=Math.max(widthPx,edge.width);to=reversed?edge.from:edge.to;if(retained.has(to))break;
    const next=adjacent.get(to)?.find(e=>e.id!==edge.id);if(!next)throw invalid();from=to;edge=next;}
   chains.push({from:id,to,refs,points,widthPx});}
  if(seen.size!==edges.size)throw invalid();return chains;
 };
 // A loop returning to one retained junction must keep its interior vertices;
 // otherwise contraction would create an unsupported self-edge and erase it.
 if(!retained.size)for(const id of nodes.keys())retained.add(id);
 let chains=build();const loops=chains.filter(c=>c.from===c.to);
 if(loops.length){for(const c of loops)for(const ref of c.refs){const e=edges.get(ref.id);if(e){retained.add(e.from);retained.add(e.to);}}chains=build();}
 /** @type {Map<string,number>} */const owner=new Map();chains.forEach((c,i)=>c.refs.forEach(r=>owner.set(r.id,i)));
 const logical=paths.map(path=>{
  /** @type {{index:number,reversed:boolean}[]} */const refs=[];
  for(let i=0;i<path.edges.length;){const ref=path.edges[i];if(!ref)throw invalid();const index=owner.get(ref.id),chain=index===undefined?undefined:chains[index];
   if(index===undefined||!chain||refs.some(r=>r.index===index))throw invalid();const head=chain.refs[0],tail=chain.refs.at(-1);
   const reversed=tail?.id===ref.id&&tail.reversed!==ref.reversed;
   if(!reversed&&(head?.id!==ref.id||head.reversed!==ref.reversed))throw invalid();
   const expected=reversed?chain.refs.slice().reverse().map(r=>({id:r.id,reversed:!r.reversed})):chain.refs;
   for(const [j,r]of expected.entries()){charge(1);const actual=path.edges[i+j];if(!actual||actual.id!==r.id||actual.reversed!==r.reversed)throw invalid();}
   refs.push({index,reversed});i+=expected.length;}
  return {relationId:path.relationId,chains:refs};});
 return {nodes:[...retained].map(id=>/** @type {Node} */(nodes.get(id))),chains,logical,joints,
  physicalEdgeCount:edges.size,cycleRank:edges.size-nodes.size+1,sourceOwnershipGranted:false};
}
module.exports={contractWholeRouteNetwork};
