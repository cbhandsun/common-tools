// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** Fixed, source-independent constants (pre-registered; never tuned per image). */
const MIN_EDGE_PX=20,ATTACH_PX=24;
/** @param {[number,number]} p @param {Box} b */
const boundaryDistance=(p,b)=>{
 const dx=Math.max(b.x-p[0],0,p[0]-(b.x+b.w)),dy=Math.max(b.y-p[1],0,p[1]-(b.y+b.h));
 // Inside the box: distance to the nearest side (a shaft ending just inside still attaches).
 if(dx===0&&dy===0)return Math.min(p[0]-b.x,b.x+b.w-p[0],p[1]-b.y,b.y+b.h-p[1]);
 return Math.hypot(dx,dy);
};
/** Bind proposed relations to physical skeleton strokes: ONE stroke edge must
 * run from near the source box boundary to near the target box boundary, and
 * no other edge may do the same (ambiguity stays unresolved). Arrowhead
 * candidates at either end report whether the drawn direction agrees with the
 * proposal. This is EVIDENCE for diagonal/unaligned connectors the straight
 * aligned-shaft fitter cannot measure; it grants no relation, route, owner or
 * erase permission and never overrides compiler validation.
 * @param {{graph:unknown,objects:unknown,relations:unknown}} input */
function bindSceneStrokeRelations({graph,objects,relations}){
 if(!record(graph)||!list(graph.edges)||!list(graph.nodes)||!list(graph.arrowheads))throw new TypeError('Scene stroke binding graph is invalid');
 if(!list(objects)||objects.length>256||!list(relations)||relations.length>128)throw new TypeError('Scene stroke binding input is invalid');
 /** @type {Map<string,Box>} */const boxes=new Map();
 for(const o of objects){if(!record(o)||typeof o.id!=='string'||!box(o.box)||boxes.has(o.id))throw new TypeError('Scene stroke binding object is invalid');boxes.set(o.id,{...o.box});}
 /** @type {Map<string,string[]>} */const heads=new Map();
 for(const a of graph.arrowheads){if(!record(a)||typeof a.shaftEdgeId!=='string'||typeof a.nodeId!=='string')throw new TypeError('Scene stroke binding graph is invalid');
  const ends=heads.get(a.shaftEdgeId)??[];ends.push(a.nodeId);heads.set(a.shaftEdgeId,ends);}
 const edges=graph.edges.map(e=>{
  if(!record(e)||typeof e.id!=='string'||typeof e.from!=='string'||typeof e.to!=='string'||typeof e.lengthPx!=='number'||!list(e.points)||e.points.length<2
   ||e.points.some(p=>!list(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v))))throw new TypeError('Scene stroke binding graph is invalid');
  const pts=/** @type {[number,number][]} */(e.points);
  return {id:e.id,from:e.from,to:e.to,lengthPx:e.lengthPx,start:pts[0]??[0,0],end:pts[pts.length-1]??[0,0],heads:heads.get(e.id)??[]};
 }).filter(e=>e.lengthPx>=MIN_EDGE_PX);
 return relations.map(r=>{
  if(!record(r)||typeof r.id!=='string'||typeof r.fromId!=='string'||typeof r.toId!=='string'||typeof r.direction!=='string')throw new TypeError('Scene stroke binding relation is invalid');
  const from=boxes.get(r.fromId),to=boxes.get(r.toId);
  if(!from||!to)return {relationId:r.id,status:'unbound',reason:'endpoint-missing'};
  const matches=[];
  for(const e of edges){
   const forward=boundaryDistance(e.start,from)<=ATTACH_PX&&boundaryDistance(e.end,to)<=ATTACH_PX;
   const reverse=boundaryDistance(e.end,from)<=ATTACH_PX&&boundaryDistance(e.start,to)<=ATTACH_PX;
   if(forward!==reverse)matches.push({e,fromNode:forward?e.from:e.to,toNode:forward?e.to:e.from});
  }
  if(!matches.length)return {relationId:r.id,status:'unbound',reason:'no-stroke'};
  if(matches.length>1)return {relationId:r.id,status:'ambiguous',reason:'multiple-strokes',edgeIds:matches.map(m=>m.e.id).sort()};
  const [m]=matches;if(!m)throw new TypeError('Scene stroke binding is invalid');
  const headAtTo=m.e.heads.includes(m.toNode),headAtFrom=m.e.heads.includes(m.fromNode);
  const expected={forward:[false,true],backward:[true,false],both:[true,true],undirected:[false,false]}[r.direction];
  const observed=headAtFrom||headAtTo;
  const direction=!observed?'unobserved':!expected?'unknown-proposal':expected[0]===headAtFrom&&expected[1]===headAtTo?'agrees':'contradicts';
  return {relationId:r.id,status:'bound',edgeId:m.e.id,headAtFrom,headAtTo,direction,sourceAuthorized:false};
 });
}
module.exports={bindSceneStrokeRelations,STROKE_BINDING_CONSTANTS:Object.freeze({MIN_EDGE_PX,ATTACH_PX})};
