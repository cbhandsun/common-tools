// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {fitWholeRouteNativeNetwork}=require('./whole-route-network-fit');
const {reflowWholeRouteNativeNetwork}=require('./whole-route-network-reflow');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {reframeSourceRouteGradient}=require('./source-route-native-gradient');
const {inspectWholeRouteNetworkPaths}=require('./whole-route-network-paths');
const {inspectWholeRouteNetworkTopology}=require('./whole-route-network-topology');
/** @typedef {import('./source-shared-route-output-paint').Item & {rotation?:unknown}} Item */
/** @typedef {{x:number,y:number}} Point */
const invalid=()=>new TypeError('Native network page reflow is invalid');
/** @param {unknown} v @returns {v is string} */
const id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(v);
/** Copy-on-write EDIT transaction, never a source-pixel authority. The host
 * explicitly supplies original graph/parts and the complete output roster.
 * Terminal coordinates come only from CURRENT node boxes + retained anchors.
 * Any mismatch or unsupported layout publishes no page. No Office event hook.
 * @param {unknown} input */
function reflowNativeNetworkPage(input){
 if(!record(input)||!record(input.page)||!sharedOutputWork(input.work)||input.approximation!=='semantic-native')throw invalid();
 const {page,work}=input;
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @param {unknown} v @param {number} max @returns {Record<string,unknown>[]} */const array=(v,max)=>{
  if(types.isProxy(v)||!Array.isArray(v)||v.length>max||!list(v)||!v.every(record))throw invalid();charge(v.length*4);return v;};
 const shapes=/** @type {Item[]} */(array(page.shapes,10000));
 const all=[...shapes,...['images','textBoxes','tables','charts','icons'].flatMap(k=>page[k]===undefined?[]:array(page[k],10000))];
 if(all.length>10000)throw invalid();charge(all.length*4);
 /** @type {Map<string,Item>} */const byId=new Map();
 for(const raw of all){if(!id(raw.id)||byId.has(raw.id)||!record(raw.box)||raw.style!==undefined&&!record(raw.style))throw invalid();byId.set(raw.id,/** @type {Item} */(raw));}
 const relations=array(input.relations,48),armBindings=array(input.arms,128),boundIds=new Set();
 for(const binding of [...relations,...armBindings]){
  if(!id(binding.elementId)||boundIds.has(binding.elementId))throw invalid();boundIds.add(binding.elementId);
 }
 const base=fitWholeRouteNativeNetwork(input);if(!base)return null;
 if(relations.length!==base.paths.length||new Set(relations.map(b=>b.relationId)).size!==relations.length
  ||relations.some(b=>!id(b.relationId)||!base.paths.some(p=>p.relationId===b.relationId)))throw invalid();
 const geometry=createNativeRouteGeometry(work);
 /** @param {unknown} value */const member=value=>{
  if(!id(value))throw invalid();const part=byId.get(value);
  if(!part||!shapes.includes(part)||part.type!=='line'||!record(part.style)||!record(part.source)
   ||part.rotation!==undefined&&part.rotation!==0)throw invalid();
  if(sharedRouteOutputSnapshot(part,work)===null){charge(0);throw invalid();}
  const style=part.style,frame=style.connectorFrame;
  if(!record(frame)||!['x','y','w','h','rotationDeg'].every(k=>typeof frame[k]==='number'&&Number.isFinite(frame[k])&&Math.abs(frame[k])<=100000)
   ||!['flipH','flipV'].every(k=>typeof frame[k]==='boolean')||![0,90,180,270].includes(Number(frame.rotationDeg))
   ||style.connectorType!==undefined&&(typeof style.connectorType!=='string'||!/^elbow-[2345]$/u.test(style.connectorType))
   ||style.connectorAdjustments!==undefined&&(!list(style.connectorAdjustments)||style.connectorAdjustments.length>3
    ||style.connectorAdjustments.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>2000000)))throw invalid();
  if(!geometry.nativeElbowVertices(/** @type {NonNullable<ReturnType<typeof geometry.nativeElbowConnector>>} */(style)).length)throw invalid();return part;
 };
 /** @param {unknown} raw */const anchor=raw=>{
  if(!record(raw)||!id(raw.elementId)||typeof raw.side!=='string'||!['top','bottom','left','right'].includes(raw.side))throw invalid();
  const position=raw.position===undefined?.5:raw.position,dx=raw.dxPt===undefined?0:raw.dxPt,dy=raw.dyPt===undefined?0:raw.dyPt;
  if(typeof position!=='number'||!Number.isFinite(position)||position<0||position>1
   ||![dx,dy].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000))throw invalid();
  const target=byId.get(raw.elementId);
  if(!target||!shapes.includes(target)||typeof target.type!=='string'||!['rect','roundRect','freeform'].includes(target.type)
   ||target.rotation!==undefined&&target.rotation!==0)throw invalid();
  const {x,y,w,h}=target.box;if(![x,y,w,h].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000)||w<=0||h<=0)throw invalid();
  const ox=(raw.side==='top'||raw.side==='bottom'?w*position:raw.side==='right'?w:0)+/** @type {number} */(dx);
  const oy=(raw.side==='left'||raw.side==='right'?h*position:raw.side==='bottom'?h:0)+/** @type {number} */(dy);
  const outside=ox<0||oy<0||ox>w||oy>h;
  if(raw.siteOffsetKind!==undefined){const diagonal=raw.siteOffsetKind==='source-visible-diagonal-gap';
   if(raw.siteOffsetKind!=='source-visible-gap'&&!diagonal
    ||raw.side==='top'&&(!diagonal&&dx!==0||/** @type {number} */(dy)>0)
    ||raw.side==='bottom'&&(!diagonal&&dx!==0||/** @type {number} */(dy)<0)
    ||raw.side==='left'&&(!diagonal&&dy!==0||/** @type {number} */(dx)>0)
    ||raw.side==='right'&&(!diagonal&&dy!==0||/** @type {number} */(dx)<0))throw invalid();
  }else if(outside)throw invalid();
  return {target,offset:{x:ox,y:oy},point:{x:x+ox,y:y+oy}};
 };
 /** @type {Map<string,Point>} */const pins=new Map();
 const selected=relations.map(binding=>{
  const part=member(binding.elementId),path=base.paths.find(p=>p.relationId===binding.relationId);
  if(!path||part.source?.sceneRelationId!==binding.relationId)throw invalid();
  const first=path.chains[0],last=path.chains.at(-1),a=first&&base.chains[first.index],b=last&&base.chains[last.index];
  if(!first||!last||!a||!b)throw invalid();
  for(const [nodeId,key]of /** @type {[string,string][]} */([[first.reversed?a.to:a.from,'startAnchor'],[last.reversed?b.from:b.to,'endAnchor']])){
   const at=anchor(part.style?.[key]);if(at.target.id===part.id||boundIds.has(at.target.id))throw invalid();
   const prior=pins.get(nodeId);if(prior&&Math.hypot(prior.x-at.point.x,prior.y-at.point.y)>1e-6)throw invalid();pins.set(nodeId,at.point);
  }
  return {relationId:/** @type {string} */(binding.relationId),part};
 });
 // Retained arms may have real terminals even when no declared relation
 // traverses them. Pin those current nodes before solving the complete graph.
 const usedChains=new Set(base.paths.flatMap(p=>p.chains.map(r=>r.index))),seenArms=new Set();
 const preparedArms=armBindings.map(binding=>{
  if(!list(binding.edgeIds)||binding.edgeIds.length<1||binding.edgeIds.length>128||!binding.edgeIds.every(id)||typeof binding.reversed!=='boolean')throw invalid();
  const edgeIds=binding.edgeIds,chainIndex=base.chains.findIndex(c=>c.refs.length===edgeIds.length&&c.refs.every((r,i)=>r.id===edgeIds[i]));
  const chain=base.chains[chainIndex];if(!chain||usedChains.has(chainIndex)||seenArms.has(chainIndex))throw invalid();seenArms.add(chainIndex);
  const part=member(binding.elementId);if(part.source?.role!=='source-network-arm'||part.source.sceneRelationId!==undefined)throw invalid();
  for(const [nodeId,key]of /** @type {[string,string][]} */([[binding.reversed?chain.to:chain.from,'startAnchor'],[binding.reversed?chain.from:chain.to,'endAnchor']])){
   const node=base.nodes.find(n=>n.id===nodeId);if(!node)throw invalid();if(node.endpointId===null)continue;
   const at=anchor(part.style?.[key]),source=at.target.source;
   if(!record(source)||(source.sceneInventoryId!==node.endpointId&&source.sceneRegionId!==node.endpointId)||boundIds.has(at.target.id))throw invalid();
   const prior=pins.get(nodeId);if(prior&&Math.hypot(prior.x-at.point.x,prior.y-at.point.y)>1e-6)throw invalid();pins.set(nodeId,at.point);
  }
  return {binding,chainIndex,part};
 });
 const network=reflowWholeRouteNativeNetwork({...input,endpointPins:[...pins].map(([nodeId,point])=>({nodeId,point}))});if(!network)return null;
 if(armBindings.length!==network.arms.length)throw invalid();
 const usedArms=new Set();
 const arms=preparedArms.map(({binding,chainIndex,part})=>{
  const found=network.arms.find(a=>a.chainIndex===chainIndex);
  if(!found||usedArms.has(found.chainIndex))throw invalid();usedArms.add(found.chainIndex);
  const points=binding.reversed?found.points.slice().reverse():found.points;
  const connector=geometry.nativeElbowConnector(points);if(!connector)throw invalid();
  return {chainIndex:found.chainIndex,reversed:binding.reversed,part,connector,points};
 });
 /** @type {Map<string,Item>} */const changes=new Map();
 /** @param {Item} part @param {NonNullable<ReturnType<typeof geometry.nativeElbowConnector>>} connector @param {Point[]} points */
 const replace=(part,connector,points)=>{
  if(!part.id||!part.style||!part.source)throw invalid();
  /** @type {Record<string,unknown>} */const style={...part.style};
  for(const k of ['freeformPath','freeformSegments','connectorPath','closed','connectorFrame','connectorType','connectorAdjustments'])delete style[k];
  Object.assign(style,connector);
  if(style.strokeGradient!==undefined)style.strokeGradient=reframeSourceRouteGradient(style.strokeGradient,part.style.connectorFrame,connector.connectorFrame);
  const a=points[0],b=points.at(-1);if(!a||!b)throw invalid();
  const next={...part,box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style,
   source:{...part.source,nativeRoutePoints:points.map(p=>({...p})),sourceFootprintVerified:false,officeNodeFollowingVerified:false,
    outputGeometryApproximation:'explicit-network-reflow',automaticOfficeFollowingVerified:false}};
  changes.set(part.id,next);return next;
 };
 const outputs=selected.map(row=>{const path=network.paths.find(p=>p.relationId===row.relationId);if(!path)throw invalid();return {...row,part:replace(row.part,path.connector,path.points)};});
 /** @type {Set<string>} */const controls=new Set();
 const armOutputs=arms.map(row=>{
  for(const [key,point]of /** @type {[string,Point|undefined][]} */([['startAnchor',row.points[0]],['endAnchor',row.points.at(-1)]])){
   if(!point)throw invalid();const at=anchor(row.part.style?.[key]),control=at.target,style=control.style;
   const chain=network.chains[row.chainIndex],nodeId=key==='startAnchor'?(row.reversed?chain?.to:chain?.from):(row.reversed?chain?.from:chain?.to);
   const node=network.nodes.find(n=>n.id===nodeId);if(!node)throw invalid();
   if(node.endpointId!==null){
    const source=control.source;if(!record(source)||(source.sceneInventoryId!==node.endpointId&&source.sceneRegionId!==node.endpointId)
     ||Math.hypot(at.point.x-point.x,at.point.y-point.y)>1e-6)throw invalid();continue;
   }
   if(!control.id||boundIds.has(control.id)||control.type!=='rect'||!record(style)||style.fill!=='none'||style.stroke!=='none'||style.strokeWidthPt!==0
    ||!record(control.source)||control.source.routeControl!==true||Math.abs(control.box.w-.1)>1e-8||Math.abs(control.box.h-.1)>1e-8)throw invalid();
   const next={...control,box:{...control.box,x:point.x-at.offset.x,y:point.y-at.offset.y}},prior=changes.get(control.id);
   if(prior&&Math.hypot(prior.box.x-next.box.x,prior.box.y-next.box.y)>1e-6)throw invalid();
   changes.set(control.id,next);controls.add(control.id);
  }
  return {...row,part:replace(row.part,row.connector,row.points)};
 });
 for(const part of shapes)for(const key of ['startAnchor','endAnchor']){
  const value=part.style?.[key];if(value!==undefined&&!record(value))throw invalid();
  if(record(value)&&typeof value.elementId==='string'&&controls.has(value.elementId)&&(!part.id||!boundIds.has(part.id)))throw invalid();
 }
 const correspondence=inspectWholeRouteNetworkPaths({network,relations:outputs,arms:armOutputs,work});
 // Check continuous connector geometry using the actual widths. Dashes and
 // opacity remain untouched in the output; this is explicitly NOT a proof
 // of their painted footprint or full rendered topology.
 const topology=inspectWholeRouteNetworkTopology({parts:[...outputs,...armOutputs].map(({part})=>({type:'line',box:part.box,
  style:{connectorFrame:part.style.connectorFrame,connectorType:part.style.connectorType,connectorAdjustments:part.style.connectorAdjustments,
   fill:'none',stroke:'#123456',strokeWidthPt:part.style.strokeWidthPt,lineCap:'round'}})),work});
 if(!correspondence||!topology||topology.connectedComponents!==1||topology.cycles!==network.cycleRank)return null;
 return {page:{...page,shapes:shapes.map(p=>changes.get(p.id??'')??p)},report:{operation:'explicit-native-network-reflow',changed:changes.size,
  relations:outputs.length,arms:armOutputs.length,controls:controls.size,correspondence,topology,topologyScope:'continuous-connector-geometry',actualPaintTopologyVerified:false,
  sourceOwnershipGranted:false,sourceFootprintVerified:false,fullActualTopologyVerified:false,automaticOfficeFollowingVerified:false}};
}
module.exports={reflowNativeNetworkPage};
