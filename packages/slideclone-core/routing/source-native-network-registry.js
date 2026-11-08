// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {hasSharedSourceRoute}=require('./source-shared-route-measurement');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {wholeRouteCurves,joinWholeRouteGeometry}=require('./source-whole-route-geometry');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** @typedef {import('../scene-plan/source-scene-shared-route-inventory').SharedGraph} Graph */
/** @typedef {import('./source-shared-route-output-snapshot').Work} Work */
/** @typedef {{graph:Graph,parts:Item[],originals:Map<string,string>,members:Item[],slideSize:{widthPt:number,heightPt:number},
 * endpoints:{id:string,box:{x:number,y:number,w:number,h:number}}[]}} Entry */
/** @typedef {{status:'absent'|'invalid'|'verified',groups:{graph:Graph,parts:Item[],members:Item[]}[]}} ReadResult */
const invalid=()=>new TypeError('Native network output binding is invalid');
/** @param {Work} work @param {number} n */function charge(work,n){
 if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
}
/** Bind rendering only; portable source metadata and group annotation may be
 * compacted after source erasure. This never renews a source paint receipt.
 * @param {Item} part @param {Work} work */
function renderSnapshot(part,work){
 if(!record(part)||!record(part.style))throw invalid();charge(work,32);
 const style=Object.fromEntries(['fill','stroke','strokeWidthPt','lineCap','strokeGradient','strokeDash','strokeDashPattern','dash',
  'startAnchor','endAnchor','startArrow','endArrow','startArrowWidth','startArrowLength','endArrowWidth','endArrowLength',
  ...(part.style.opacity!==undefined&&part.style.opacity!==1?['opacity']:[])].filter(k=>part.style?.[k]!==undefined).map(k=>[k,part.style?.[k]]));
 const curves=wholeRouteCurves(part),value=sharedRouteOutputSnapshot({id:part.id,type:part.type,box:part.box,style,source:{curves}},work);
 if(value===null){charge(work,0);throw invalid();}return value;
}
/** One compiler instance owns both publishers and readers. A token carries
 * output geometry only: no source pixels, erasure, inventory or Office proof.
 * Capturing reuses the ORIGINAL bounded paint snapshots. The independent
 * final output phase supplies its own ledger explicitly; no source reset.
 */
function createSourceNativeNetworkRegistry(){
 /** @type {WeakMap<object,Entry>} */const outputs=new WeakMap();
 /** @type {WeakMap<object,Entry[]>} */const receipts=new WeakMap();
 /** Only the measured compiler calls this after paint/group capture succeeds.
  * @param {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
  * image:import('../png').PngImage,graph:Graph,parts:Item[],members:Item[],snapshots:Map<Item,string>,slideSize:Entry['slideSize'],work:Work}} input */
 function capture(input){
  if(!record(input)||!sharedOutputWork(input.work)||!hasSharedSourceRoute(input.fit,input.image)||!record(input.graph)
   ||!list(input.parts)||!list(input.members)||input.parts.length>256||input.members.length>256||types.isProxy(input.snapshots)
   ||Object.getPrototypeOf(input.snapshots)!==Map.prototype)throw invalid();
  const {graph,work}=input;
  /** @param {unknown} value @returns {value is string} */const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(value);
  if(![graph.nodes,graph.edges,graph.paths].every(a=>list(a)&&a.length<=128&&a.every(record))||graph.nodes.length<2||graph.edges.length<1||graph.paths.length<1||graph.paths.length>48
   ||!identity(graph.id)||!identity(graph.regionId)||typeof graph.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(graph.sourceHash)
   ||graph.nodes.some(n=>!identity(n.id)||!identity(n.nativeId)||n.endpointId!==null&&!identity(n.endpointId))
   ||graph.edges.some(e=>![e.id,e.from,e.to,e.memberId].every(identity)||!['forward','backward','both','undirected'].includes(e.direction))
   ||graph.paths.some(p=>!identity(p.relationId)||!list(p.edges)||p.edges.length<1||p.edges.length>128||!p.edges.every(r=>record(r)&&identity(r.id)&&typeof r.reversed==='boolean'))
   ||!list(graph.renderedPaths)||graph.renderedPaths.length!==graph.paths.length
   ||!graph.renderedPaths.every(p=>record(p)&&identity(p.relationId)&&identity(p.memberId))
   ||!record(input.slideSize)||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
   ||!input.parts.every(record)||!input.members.every(record))throw invalid();
  charge(work,graph.nodes.length*5+graph.edges.length*6+graph.paths.reduce((n,p)=>n+p.edges.length*3+2,0)+input.parts.length+input.members.length*2);
  const saved={...graph,nodes:graph.nodes.map(n=>({...n})),edges:graph.edges.map(e=>({...e})),paths:graph.paths.map(p=>({...p,edges:p.edges.map(r=>({...r}))})),
   ...(graph.renderedPaths?{renderedPaths:graph.renderedPaths.map(p=>({...p}))}:{})};
  for(const n of saved.nodes)Object.freeze(n);for(const e of saved.edges)Object.freeze(e);
  for(const p of saved.paths){for(const r of p.edges)Object.freeze(r);Object.freeze(p.edges);Object.freeze(p);}
  Object.freeze(saved.nodes);Object.freeze(saved.edges);Object.freeze(saved.paths);
  if(saved.renderedPaths){for(const p of saved.renderedPaths)Object.freeze(p);Object.freeze(saved.renderedPaths);}Object.freeze(saved);
  /** @type {Map<string,string>} */const originals=new Map();
  for(const part of input.members){const value=input.snapshots.get(part);if(typeof part.id!=='string'||typeof value!=='string'||value.length>262144||originals.has(part.id))throw invalid();originals.set(part.id,value);}
  const sx=input.slideSize.widthPt/input.image.width,sy=input.slideSize.heightPt/input.image.height;
  const endpoints=input.fit.nodes.map(n=>({id:n.id,box:{x:n.box.x*sx,y:n.box.y*sy,w:n.box.w*sx,h:n.box.h*sy}}));
  const edgeIds=new Set(graph.edges.map(e=>e.memberId)),parts=input.parts.filter(p=>typeof p.id==='string'&&edgeIds.has(p.id));
  if(parts.length!==graph.edges.length)throw invalid();
  const entry={graph:saved,parts,members:input.members.slice(),originals,slideSize:{...input.slideSize},endpoints};
  for(const part of input.members)outputs.set(part,entry);
 }
 /** Explicit side channel from compiler to composition root. Serializable
  * page copies cannot create entries in this registry.
  * @param {unknown} page */
 function seal(page){
  if(!record(page)||!list(page.shapes)||page.shapes.length>10000||!page.shapes.every(record))throw invalid();
  const entries=[...new Set(page.shapes.flatMap(p=>{const entry=outputs.get(p);return entry?[entry]:[];}))];
  const token=Object.freeze(Object.create(null));receipts.set(token,entries);return token;
 }
 /** Revalidate every original whole drawing, external endpoint box and ordered
  * physical path before returning a geometry input. No partial group is read.
  * @param {unknown} input @returns {ReadResult} */
 function read(input){
  if(!record(input)||!sharedOutputWork(input.work)||!record(input.page)||!record(input.slideSize))throw invalid();
  const {page,work,slideSize}=input;
  if(![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(record)))throw invalid();
  const entries=input.receipt&&typeof input.receipt==='object'&&!types.isProxy(input.receipt)?receipts.get(input.receipt):undefined;
  if(!entries)return {status:/** @type {const} */('absent'),groups:[]};
  const all=[.../** @type {Item[]} */(page.shapes),.../** @type {Item[]} */(page.images),.../** @type {Item[]} */(page.textBoxes)];
  if(all.length>10000)throw invalid();charge(work,all.length*3);
  /** @type {Map<string|undefined,Item[]>} */const byId=new Map();
  for(const part of all){const bucket=byId.get(part.id)??[];bucket.push(part);byId.set(part.id,bucket);}
  const source=record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene:null;
  /** @type {{graph:Graph,parts:Item[],members:Item[]}[]} */const groups=[];
  for(const entry of entries){
   if(source?.sourceHash!==entry.graph.sourceHash||slideSize.widthPt!==entry.slideSize.widthPt||slideSize.heightPt!==entry.slideSize.heightPt)return {status:/** @type {const} */('invalid'),groups:[]};
   if(entry.endpoints.some(n=>{const found=byId.get(n.id),p=found?.[0];return found?.length!==1||!p||!record(p.box)
    ||!['x','y','w','h'].every(k=>{const key=/** @type {'x'|'y'|'w'|'h'} */(k);return typeof p.box[key]==='number'&&Math.abs(p.box[key]-n.box[key])<=1e-6;});}))return {status:/** @type {const} */('invalid'),groups:[]};
   /** @type {Item[]} */const members=[];/** @type {Map<string,Item>} */const originals=new Map();
   for(const member of entry.members){const saved=entry.originals.get(/** @type {string} */(member.id)),found=byId.get(member.id),actual=found?.[0];
    if(!saved||found?.length!==1||!actual||!/** @type {unknown[]} */(page.shapes).includes(actual))return {status:/** @type {const} */('invalid'),groups:[]};
    charge(work,saved.length);const original=/** @type {Item} */(JSON.parse(saved));originals.set(/** @type {string} */(member.id),original);
    if(member.type==='rect'){
     // Invisible controls remain part of the exact roster. They must not be
     // moved or made visible before the output representation transaction.
     if(sharedRouteOutputSnapshot({...actual,source:{}},work)!==sharedRouteOutputSnapshot({...original,source:{}},work))return {status:/** @type {const} */('invalid'),groups:[]};
    }else if(renderSnapshot(original,work)!==renderSnapshot(actual,work))return {status:/** @type {const} */('invalid'),groups:[]};
    members.push(actual);
   }
   const physical=new Map(entry.parts.map(p=>[p.id,p]));
   for(const path of entry.graph.paths){charge(work,path.edges.length*16);
    const curves=joinWholeRouteGeometry(path.edges.map(ref=>{const edge=entry.graph.edges.find(e=>e.id===ref.id),part=edge&&physical.get(edge.memberId);if(!part)throw invalid();return {part,reversed:ref.reversed};})).curves;
    const mapping=entry.graph.renderedPaths?.find(p=>p.relationId===path.relationId),part=mapping&&originals.get(mapping.memberId);if(!part)throw invalid();const actual=wholeRouteCurves(part);
    if(curves.length!==actual.length||curves.some((c,i)=>{const q=actual[i];return !q||c.length!==q.length||c.some((p,j)=>{const r=q[j];return !r||Math.hypot(p.x-r.x,p.y-r.y)>1e-6;});}))return {status:/** @type {const} */('invalid'),groups:[]};
   }
   const parts=entry.parts.map(part=>{const saved=sharedRouteOutputSnapshot({...part,source:{}},work);if(saved===null){charge(work,0);throw invalid();}
    charge(work,saved.length);return /** @type {Item} */(JSON.parse(saved));});
   groups.push({graph:entry.graph,parts,members});
  }
  return {status:/** @type {const} */('verified'),groups};
 }
 return {capture,seal,read};
}
module.exports={createSourceNativeNetworkRegistry};
