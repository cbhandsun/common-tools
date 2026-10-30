// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {parseConnectorCornerMode}=require('./source-route-corner-mode');
const {readSourceNativeNetworks,readSourceNativeFilledRoutes}=require('./source-shared-route-compiler');
const {fitWholeRouteNativeNetwork}=require('./whole-route-network-fit');
const {fitWholeRouteNativeConnector}=require('./whole-route-native-connector');
const {inspectWholeRouteNetworkPaths}=require('./whole-route-network-paths');
const {inspectWholeRouteNetworkTopology}=require('./whole-route-network-topology');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {reframeSourceRouteGradient}=require('./source-route-native-gradient');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {summarizeSceneRouteRepresentations}=require('../scene-plan/source-scene-route-representation');
const {prepareNativeRouteMaterialization,commitNativeRouteMaterialization}=require('../scene-plan/source-native-route-materialization');
const {selectFilledNativeRoute}=require('./source-filled-route-native');
const {unpackSceneInventoryMembers}=require('../scene-plan/source-scene-inventory-codec');
const {createNativeNetworkEditModel}=require('./native-network-edit-model');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
const invalid=()=>new TypeError('Native route finalization is invalid');
/** Output-only transaction. Run after original source/erasure consumers and
 * approved asset applications; before final inventory seals and audits.
 * Native mode never turns an approximate drawing into source pixel authority.
 * Failed networks retain ALL original members and remain unmet in diagnostics.
 * @param {unknown} input */
function finalizeNativeRouteRepresentations(input){
 if(!record(input)||!record(input.page)||!record(input.slideSize)||!sharedOutputWork(input.work))throw invalid();
 const mode=parseConnectorCornerMode(input.connectorCornerMode),{page,work}=input;
 if(![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(record)))throw invalid();
 if(mode!=='reroutable-elbow')return {page,report:{status:'not-requested',changed:0,nodeFollowingVerification:'not-assessed'}};
 const shapes=/** @type {Item[]} */(page.shapes),all=[...shapes,.../** @type {Item[]} */(page.images),.../** @type {Item[]} */(page.textBoxes)];
 if(all.some(item=>item.source!==undefined&&!record(item.source)||item.style!==undefined&&!record(item.style)||!record(item.box)))throw invalid();
 if(all.length>10000)throw invalid();if(!chargeSharedOutput(work,all.length*4))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
 /** @type {Map<string,Item[]>} */const byId=new Map();
 for(const item of all){if(typeof item.id!=='string')continue;const matches=byId.get(item.id)??[];matches.push(item);byId.set(item.id,matches);}
 const geometry=createNativeRouteGeometry(work);
 /** @type {Map<string,Item>} */const changes=new Map();
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 /** @type {string[]} */const networks=[];
 const editModels=[];
 /** @param {Item} part */const bound=part=>{
  if(typeof part.id!=='string'||!record(part.style)||!record(part.source))return false;
  return ['startAnchor','endAnchor'].every(key=>{const anchor=part.style?.[key];return record(anchor)&&typeof anchor.elementId==='string'&&anchor.elementId!==part.id
   &&byId.get(anchor.elementId)?.length===1&&typeof anchor.side==='string'&&['left','right','top','bottom'].includes(anchor.side)
   &&typeof anchor.position==='number'&&Number.isFinite(anchor.position)&&anchor.position>=0&&anchor.position<=1
   &&[anchor.dxPt,anchor.dyPt].every(v=>v===undefined||typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000);});
 };
 /** @param {Item} part @param {NonNullable<ReturnType<typeof geometry.nativeElbowConnector>>} connector
  * @param {'network-constrained-standard-office'|'standard-office-connector'} [approximation] @returns {Item} */
 const replace=(part,connector,approximation='network-constrained-standard-office')=>{
  if(!bound(part)||!record(part.style)||!record(part.source))throw invalid();
  const points=geometry.nativeElbowVertices(connector),a=points[0],b=points.at(-1);if(!a||!b)throw invalid();
  /** @type {Record<string,unknown>} */const style={...part.style,...connector};
  for(const key of ['freeformPath','freeformSegments','connectorPath','closed'])delete style[key];
  if(style.strokeGradient!==undefined)style.strokeGradient=reframeSourceRouteGradient(style.strokeGradient,part.style.connectorFrame,connector.connectorFrame);
  return {...part,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style,
   source:{...part.source,connectorCornerMode:mode,nativeConnectorRoute:true,nativePathGeometry:'office-preset-v1',sourceRouteParts:1,
    nativeRoutePoints:points,outputGeometryApproximation:approximation,sourceFootprintVerified:false,officeNodeFollowingVerified:false}};
 };
 const selected=readSourceNativeNetworks({...input,work});
 if(selected.status==='invalid')rejected.push({id:'shared-networks',reason:'original-output-changed'});
 for(const group of selected.groups){
  const fit=fitWholeRouteNativeNetwork({graph:group.graph,parts:group.parts,work,approximation:'semantic-native'});
  if(!fit){rejected.push({id:group.graph.id,reason:'native-network-unrepresentable'});continue;}
  /** @type {Map<string,Item>} */const replacements=new Map();
  const relations=fit.paths.map(path=>{const mapping=group.graph.renderedPaths?.find(p=>p.relationId===path.relationId),part=mapping&&group.members.find(p=>p.id===mapping.memberId);
   if(!part||!mapping)throw invalid();const next=replace(part,path.connector);replacements.set(mapping.memberId,next);return {relationId:path.relationId,part:next};});
  const used=new Set(fit.paths.flatMap(p=>p.chains.map(r=>r.index)));
  const arms=fit.chains.flatMap((chain,chainIndex)=>{if(used.has(chainIndex))return [];
   const ref=chain.refs[0],edge=ref&&group.graph.edges.find(e=>e.id===ref.id),part=edge&&group.members.find(p=>p.id===edge.memberId);
   if(chain.refs.length!==1||!ref||!edge||!part||!chain.points)throw invalid();
   const points=ref.reversed?chain.points.slice().reverse():chain.points,connector=geometry.nativeElbowConnector(points);if(!connector)throw invalid();
   const next=replace(part,connector);replacements.set(edge.memberId,next);const actual=geometry.nativeElbowVertices(connector),a=actual[0],b=actual.at(-1);if(!a||!b)throw invalid();
   for(const [nodeId,p]of /** @type {[string,{x:number,y:number}][]} */([[edge.from,a],[edge.to,b]])){
    const node=group.graph.nodes.find(n=>n.id===nodeId),control=node&&group.members.find(s=>s.id===node.nativeId);
    if(!node)throw invalid();
    if(node.endpointId!==null){
     const anchor=next.style?.[nodeId===edge.from?'startAnchor':'endAnchor'];
     if(!record(anchor)||anchor.elementId!==node.nativeId||byId.get(node.nativeId)?.length!==1)throw invalid();
     continue; // A retained terminal is a business node, never a movable control.
    }
    if(!control||control.type!=='rect'||control.style?.fill!=='none'||control.style.stroke!=='none'
     ||control.style.strokeWidthPt!==0||Math.abs(control.box.w-.1)>1e-8||Math.abs(control.box.h-.1)>1e-8)throw invalid();
    const prior=replacements.get(node.nativeId),box={...control.box,x:p.x-.05,y:p.y-.05};
    if(prior&&Math.hypot(prior.box.x-box.x,prior.box.y-box.y)>1e-6)throw invalid();replacements.set(node.nativeId,{...control,box});
   }
   return [{chainIndex,reversed:ref.reversed,part:next}];
  });
  const correspondence=inspectWholeRouteNetworkPaths({network:fit,relations,arms,work});
  if(!correspondence){rejected.push({id:group.graph.id,reason:'ordered-preset-path-mismatch'});continue;}
  const parts=[...relations,...arms].map(r=>r.part),topology=inspectWholeRouteNetworkTopology({parts,work});
  if(!topology||topology.connectedComponents!==1||topology.cycles!==fit.cycleRank){rejected.push({id:group.graph.id,reason:'sampled-native-network-mismatch'});continue;}
  const editModel=createNativeNetworkEditModel({graph:group.graph,parts:group.parts,work,
   relations:relations.map(r=>({relationId:r.relationId,elementId:r.part.id})),
   arms:arms.map(a=>({edgeIds:fit.chains[a.chainIndex]?.refs.map(r=>r.id),elementId:a.part.id,reversed:a.reversed}))});
  for(const [id,part]of replacements){if(changes.has(id))throw invalid();changes.set(id,part);}networks.push(group.graph.id);editModels.push(editModel);
 }
 const filled=readSourceNativeFilledRoutes({...input,work});
 /** @type {{parts:Item[],output:Item}[]} */const selections=[];
 /** @type {Set<string>} */const retired=new Set();
 if(filled.status==='invalid')rejected.push({id:'filled-routes',reason:filled.reason??'original-output-changed'});
 for(const group of filled.groups){
  const id=group.template.id;if(typeof id!=='string'||changes.has(id)||!bound(group.template)){rejected.push({id:id??'filled-route',reason:'native-endpoint-binding'});continue;}
  const selected=selectFilledNativeRoute(group,work);
  if(!selected){rejected.push({id,reason:'whole-native-unrepresentable'});continue;}
  selections.push(selected);changes.set(id,selected.output);
  for(const part of group.parts){if(typeof part.id!=='string'||retired.has(part.id))throw invalid();retired.add(part.id);}
 }
 // A shared relation can only be replaced by its complete private network.
 // A detached census or a missing network token cannot enable per-path fitting.
 for(const part of shapes){
  if(typeof part.id!=='string'||retired.has(part.id)||changes.has(part.id)||part.type!=='freeform'||!record(part.source)||typeof part.source.sceneRelationId!=='string'
   ||part.source.sceneInventoryId!==part.source.sceneRelationId||part.source.detector==='approved-native-route-approximation')continue;
  if(!bound(part)){rejected.push({id:part.id,reason:'native-endpoint-binding'});continue;}
  const fit=fitWholeRouteNativeConnector({part,work});if(!fit){rejected.push({id:part.id,reason:'whole-native-unrepresentable'});continue;}
  changes.set(part.id,replace(part,fit.connector,'standard-office-connector'));
 }
 // A rejected or empty transaction must preserve reference identity as well
 // as drawing values. Approved applications bind these exact page fields.
 const starts=new Map(selections.map(s=>[s.parts[0],s.output]));
 /** @type {Record<string,unknown>&{shapes:Item[]}} */const output=changes.size?{...page,shapes:shapes.flatMap(part=>starts.has(part)?[/** @type {Item} */(starts.get(part))]:retired.has(part.id??'')?[]:[changes.get(part.id??'')??part])}:
  /** @type {Record<string,unknown>&{shapes:Item[]}} */(page);
 const scene=record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene:null;
 /** @type {string[]} */let unmetRelationIds=[];
 /** @type {ReturnType<typeof summarizeSceneRouteRepresentations>|null} */let routeRepresentations=null;
 if(scene){
  const inventory=unpackSceneInventoryMembers(scene.observedInventory);
  if(inventory!==undefined&&(!record(inventory)||!list(inventory.units)||inventory.units.length>176||!inventory.units.every(record)))throw invalid();
  const declared=record(inventory)?/** @type {Record<string,unknown>[]} */(inventory.units):[];
  const ids=[...new Set([...shapes.flatMap(p=>typeof p.source?.sceneRelationId==='string'?[p.source.sceneRelationId]:[]),
   ...declared.flatMap(u=>u.kind==='relation'&&typeof u.id==='string'?[u.id]:[])])];
  const representation=summarizeSceneRouteRepresentations({page:output,connectorCornerMode:mode,relations:ids.map(relationId=>({relationId,
   memberIds:output.shapes.filter(p=>p.source?.sceneRelationId===relationId).flatMap(p=>p.id?[p.id]:[])}))});
  routeRepresentations=representation;unmetRelationIds=representation.nativeModeUnmetRelationIds;
  if(changes.size)output.source={...(record(page.source)?page.source:{}),sourceScene:{...scene,routeRepresentations:representation}};
 }
 // A rejected transaction retains the approved source object identities.
 if(editModels.length)output.source={...(record(output.source)?output.source:{}),nativeNetworkEditModels:editModels};
 // Report the FINAL requested mode independently of its rounded intermediate
 // source census, including when no drawing can be replaced.
 const materializationReceipt=prepareNativeRouteMaterialization({page,shapes:output.shapes,slideSize:input.slideSize,selections,work});
 return {page:output,materializationReceipt,report:{status:rejected.length||unmetRelationIds.length?'partial':changes.size?'applied':'unchanged',changed:changes.size,networks,rejected,unmetRelationIds,
  consolidatedRelations:selections.length,retiredMembers:retired.size,
  requestedMode:mode,routeRepresentations,geometryChecks:work.checks,
  sourceFootprintVerified:false,fullActualTopologyVerified:false,nodeFollowingVerification:'not-assessed'}};
}
module.exports={finalizeNativeRouteRepresentations,commitNativeRouteMaterialization};
