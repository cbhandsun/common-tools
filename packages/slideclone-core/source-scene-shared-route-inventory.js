// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {sceneRouteEndpointSurvives,readSceneRouteEndpoints}=require('./source-scene-route-endpoints');
/** @typedef {{id:string,endpointId:string|null,nativeId:string}} Vertex */
/** @typedef {{id:string,from:string,to:string,memberId:string,direction:'forward'|'backward'|'both'|'undirected'}} Edge */
/** @typedef {{relationId:string,edges:{id:string,reversed:boolean}[]}} LogicalPath */
/** @typedef {{id:string,regionId:string,sourceHash:string,nodes:Vertex[],edges:Edge[],paths:LogicalPath[]}} SharedGraph */
/** @typedef {{id:string,regionId:string,kind:string,fromId?:string,toId?:string,direction?:string,members?:import('./source-scene-inventory-materialization').Member[]}} Unit */
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** @param {unknown} value @returns {value is string} */
const nativeId=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(value);
/** @param {unknown} value @param {string[]} keys */
const exact=(value,keys)=>record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
/** @param {unknown} value @param {number} maximum @returns {value is unknown[]} */
const bounded=(value,maximum)=>list(value)&&value.length<=maximum;
/** @param {unknown} value @returns {value is Edge['direction']} */
const direction=value=>typeof value==='string'&&['forward','backward','both','undirected'].includes(value);
/** @param {unknown} value @returns {value is import('./source-scene-inventory-materialization').Member[]} */
const unitMembers=value=>bounded(value,10000)&&value.every(m=>record(m)&&(m.type==='shape'||m.type==='image')&&nativeId(m.id));
/** @param {Edge} edge @param {string} node */
function arrowAt(edge,node){return edge.direction==='both'||edge.direction===(node===edge.from?'backward':'forward');}
/** Versioned final-output identity contract only. Serialized graphs grant no
 * source pixels, attachment, erasure, observations, completion or extra slots.
 * Physical segments and junction controls have exactly one graph owner; each
 * logical relation cites a contiguous directed sequence in that same tree.
 * @param {unknown} value @param {Unit[]} units @param {string} sourceHash
 * @param {import('./source-scene-route-endpoints').RouteEndpoint[]} [endpoints]
 * @returns {SharedGraph[]} */
function readSharedSceneRouteGraphs(value,units,sourceHash,endpoints=[]){
 if(typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(sourceHash)||!bounded(value,24)
  ||!bounded(units,176)||units.some(u=>!record(u)||!identity(u.id)||!identity(u.regionId)||typeof u.kind!=='string')
  ||new Set(units.map(u=>u.id)).size!==units.length)
  throw new TypeError('Scene shared route graph collection is invalid');
 endpoints=readSceneRouteEndpoints(endpoints,units);
 const graphIds=new Set(),relationIds=new Set(),physicalIds=new Set(),externalIds=new Set(),externalBindings=new Map();
 for(const raw of value){
  if(!exact(raw,['id','regionId','sourceHash','nodes','edges','paths'])||!record(raw)||!identity(raw.id)||!identity(raw.regionId)
   ||raw.sourceHash!==sourceHash||graphIds.has(raw.id)||units.some(u=>u.id===raw.id)
   ||!bounded(raw.nodes,128)||!bounded(raw.edges,128)||!bounded(raw.paths,48)
   ||!list(raw.nodes)||!list(raw.edges)||!list(raw.paths)||raw.nodes.length<4||raw.edges.length!==raw.nodes.length-1||raw.paths.length<2)
   throw new TypeError('Scene shared route graph binding is invalid');
  graphIds.add(raw.id);const nodeIds=new Set(),edgeIds=new Set();
  for(const node of raw.nodes){
   if(!exact(node,['id','endpointId','nativeId'])||!record(node)||!identity(node.id)||nodeIds.has(node.id)||!nativeId(node.nativeId)
    ||node.endpointId!==null&&!identity(node.endpointId))throw new TypeError('Scene shared route graph vertex is invalid');
   nodeIds.add(node.id);
   if(node.endpointId===null){if(physicalIds.has(node.nativeId))throw new TypeError('Scene shared route graph ownership is invalid');physicalIds.add(node.nativeId);}
   else{const unit=units.find(u=>u.id===node.endpointId),endpoint=endpoints.find(e=>e.id===node.endpointId);
    if(!(unit&&['container','icon'].includes(unit.kind)&&unitMembers(unit.members)&&unit.members.some(m=>m.id===node.nativeId)
      ||endpoint&&endpoint.members.some(m=>m.id===node.nativeId))
     ||externalBindings.has(node.nativeId)&&externalBindings.get(node.nativeId)!==node.endpointId)
     throw new TypeError('Scene shared route graph endpoint is invalid');
    externalBindings.set(node.nativeId,node.endpointId);externalIds.add(node.nativeId);
   }
  }
  for(const edge of raw.edges){
   if(!exact(edge,['id','from','to','memberId','direction'])||!record(edge)||!identity(edge.id)||edgeIds.has(edge.id)
    ||!nodeIds.has(edge.from)||!nodeIds.has(edge.to)||edge.from===edge.to||!nativeId(edge.memberId)||physicalIds.has(edge.memberId)
    ||!direction(edge.direction))throw new TypeError('Scene shared route graph edge is invalid');
   edgeIds.add(edge.id);physicalIds.add(edge.memberId);
  }
  const graph=/** @type {SharedGraph} */(raw),degree=new Map(graph.nodes.map(n=>[n.id,0])),visited=new Set();
  for(const edge of graph.edges){degree.set(edge.from,(degree.get(edge.from)??0)+1);degree.set(edge.to,(degree.get(edge.to)??0)+1);}
  const queue=[graph.nodes[0]?.id];
  while(queue.length){const at=queue.pop();if(at===undefined||visited.has(at))continue;visited.add(at);
   for(const edge of graph.edges)if(edge.from===at)queue.push(edge.to);else if(edge.to===at)queue.push(edge.from);
  }
  if(visited.size!==graph.nodes.length||!graph.nodes.some(n=>(degree.get(n.id)??0)>2)
   ||graph.nodes.some(n=>n.endpointId===null?(degree.get(n.id)??0)<2:degree.get(n.id)!==1)
   ||graph.edges.length+graph.nodes.filter(n=>n.endpointId===null).length>Math.max(32,graph.paths.length*20)
   ||graph.edges.some(e=>[e.from,e.to].some(id=>arrowAt(e,id)&&graph.nodes.find(n=>n.id===id)?.endpointId===null)))
   throw new TypeError('Scene shared route graph topology is invalid');
  const usedEdges=new Set();
  for(const path of graph.paths){
   if(!exact(path,['relationId','edges'])||!identity(path.relationId)||relationIds.has(path.relationId)
    ||!bounded(path.edges,15)||path.edges.length<2)throw new TypeError('Scene shared route graph path is invalid');
   const relation=units.find(u=>u.id===path.relationId),seenEdges=new Set(),seenNodes=new Set();
   if(!relation||relation.kind!=='relation'||relation.regionId!==graph.regionId||!identity(relation.fromId)||!identity(relation.toId)
    ||relation.fromId===relation.toId||!direction(relation.direction))
    throw new TypeError('Scene shared route graph relation is invalid');
   /** @type {string|undefined} */let previous;
   /** @type {string|undefined} */let first;
   /** @type {string|undefined} */let last;
   for(const ref of path.edges){
    if(!exact(ref,['id','reversed'])||!identity(ref.id)||typeof ref.reversed!=='boolean'||seenEdges.has(ref.id))
     throw new TypeError('Scene shared route graph path is invalid');
    const edge=graph.edges.find(e=>e.id===ref.id);if(!edge)throw new TypeError('Scene shared route graph path is invalid');
    const from=ref.reversed?edge.to:edge.from,to=ref.reversed?edge.from:edge.to;
    if(previous!==undefined&&previous!==from||seenNodes.has(to))throw new TypeError('Scene shared route graph path is invalid');
    first??=from;last=to;previous=to;seenNodes.add(from);seenNodes.add(to);seenEdges.add(ref.id);usedEdges.add(ref.id);
   }
   const start=graph.nodes.find(n=>n.id===first),end=graph.nodes.find(n=>n.id===last),head=graph.edges.find(e=>e.id===path.edges[0]?.id),tail=graph.edges.find(e=>e.id===path.edges.at(-1)?.id);
   if(first===undefined||last===undefined||start?.endpointId!==relation.fromId||end?.endpointId!==relation.toId||!head||!tail
    ||arrowAt(head,first)!==['backward','both'].includes(relation.direction)
    ||arrowAt(tail,last)!==['forward','both'].includes(relation.direction))throw new TypeError('Scene shared route graph direction is invalid');
   relationIds.add(path.relationId);
  }
  if(usedEdges.size!==graph.edges.length)throw new TypeError('Scene shared route graph coverage is invalid');
 }
 if([...externalIds].some(id=>physicalIds.has(id)))throw new TypeError('Scene shared route graph ownership is invalid');
 return /** @type {SharedGraph[]} */(value);
}
/** @param {SharedGraph} graph */
function sharedSceneRouteMembers(graph){return [...graph.nodes.filter(n=>n.endpointId===null).map(n=>n.nativeId),...graph.edges.map(e=>e.memberId)];}
/** Match the actual writer enum, never a truthy unknown object.
 * @param {unknown} value @returns {boolean|null} */
function arrow(value){return value===undefined||value==='none'?false:typeof value==='string'&&['triangle','arrow','openArrow'].includes(value)?true:null;}
/** @param {Record<string,unknown>} shape */
function invisibleControl(shape){return shape.type==='rect'&&record(shape.box)&&record(shape.style)
 &&[shape.box.x,shape.box.y,shape.box.w,shape.box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Math.abs(Number(shape.box.w)-.1)<1e-8&&Math.abs(Number(shape.box.h)-.1)<1e-8
 &&shape.style.fill==='none'&&shape.style.stroke==='none'&&shape.style.strokeWidthPt===0;}
/** @param {unknown} value */
function anchor(value){return record(value)&&nativeId(value.elementId)&&typeof value.side==='string'
 &&['top','bottom','left','right'].includes(value.side)&&typeof value.position==='number'&&Number.isFinite(value.position)&&value.position>=0&&value.position<=1
 &&[value.dxPt,value.dyPt].every(n=>n===undefined||typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);}
/** Check CURRENT output, including unique identities, real connector targets
 * and arrow direction. Missing physical members invalidate dependent paths;
 * an unclaimed replacement or stale count cannot satisfy a graph receipt.
 * @param {SharedGraph[]} graphs @param {unknown} shapes @param {unknown} images
 * @param {{id:string,members?:import('./source-scene-inventory-materialization').Member[]}[]} [units]
 * @param {import('./source-scene-route-endpoints').RouteEndpoint[]} [endpoints] @param {unknown} [textBoxes]
 * @returns {Map<string,string[]>|null} */
function survivingSharedSceneRoutes(graphs,shapes,images,units=[],endpoints=[],textBoxes=[]){
 if(!bounded(shapes,10000)||!bounded(images,10000)||!bounded(textBoxes,10000)||!list(shapes)||!list(images)||!list(textBoxes)
  ||shapes.length+images.length+textBoxes.length>10000)return null;
 /** @type {Map<string,Record<string,unknown>[]>} */const actual=new Map();
 for(const value of [...shapes,...images,...textBoxes]){
  if(!record(value)||value.source!==undefined&&!record(value.source))return null;
  if(typeof value.id!=='string')continue;const found=actual.get(value.id)??[];found.push(value);actual.set(value.id,found);
 }
 const result=new Map();
 for(const graph of graphs){
  const validNodes=new Set(),validEdges=new Set();
  for(const node of graph.nodes){const rows=actual.get(node.nativeId),shape=rows?.[0];
   if(rows?.length!==1||!shape||!record(shape.source))continue;
   if(node.endpointId===null){if(!shapes.includes(shape)||shape.source.sceneInventoryId!==graph.id||!invisibleControl(shape))continue;}
   else{const unit=units.find(u=>u.id===node.endpointId),endpoint=endpoints.find(e=>e.id===node.endpointId);
    if(endpoint){if(!endpoint.members.some(m=>m.id===node.nativeId)||!sceneRouteEndpointSurvives(endpoint,shapes,textBoxes))continue;}
    else if(!unit||!unitMembers(unit.members)||!unit.members.length||!unit.members.some(m=>m.id===node.nativeId)
     ||unit.members.some(m=>{const found=actual.get(m.id),item=found?.[0];return found?.length!==1||!item||!record(item.source)
      ||item.source.sceneInventoryId!==node.endpointId||!(m.type==='shape'?shapes:images).includes(item);}))continue;
   }
   validNodes.add(node.id);
  }
  for(const edge of graph.edges){
   const rows=actual.get(edge.memberId),shape=rows?.[0],from=graph.nodes.find(n=>n.id===edge.from),to=graph.nodes.find(n=>n.id===edge.to);
   if(rows?.length!==1||!shape||!shapes.includes(shape)||shape.type!=='line'||!record(shape.source)||shape.source.sceneInventoryId!==graph.id
    ||!record(shape.style)||!record(shape.style.startAnchor)||!record(shape.style.endAnchor)||!anchor(shape.style.startAnchor)||!anchor(shape.style.endAnchor)
    ||shape.style.startAnchor.elementId!==from?.nativeId||shape.style.endAnchor.elementId!==to?.nativeId
    ||arrow(shape.style.startArrow)!==arrowAt(edge,edge.from)
    ||arrow(shape.style.endArrow)!==arrowAt(edge,edge.to))continue;
   validEdges.add(edge.id);
  }
  for(const path of graph.paths){
   const edges=path.edges.map(ref=>graph.edges.find(edge=>edge.id===ref.id));
   if(edges.some(edge=>!edge||!validEdges.has(edge.id)||!validNodes.has(edge.from)||!validNodes.has(edge.to)))continue;
   const nodes=graph.nodes.filter(node=>node.endpointId===null&&edges.some(edge=>edge?.from===node.id||edge?.to===node.id));
   result.set(path.relationId,[...nodes.map(node=>node.nativeId),...edges.flatMap(edge=>edge?[edge.memberId]:[])]);
  }
 }
 return result;
}
module.exports={readSharedSceneRouteGraphs,sharedSceneRouteMembers,survivingSharedSceneRoutes};
