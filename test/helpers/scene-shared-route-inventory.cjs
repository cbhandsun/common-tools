'use strict';
const {sharedJunctionFixture}=require('./scene-shared-junction.cjs');
const {initializeSceneObjectBatches}=require('../../packages/slideclone-core/scene-plan/source-scene-object-batches');
// Final-member contract fixture only. Source pixels and compile authority are
// deliberately absent; production source measurement needs separate coverage.
function sharedRouteInventoryFixture(){
 const fixture=sharedJunctionFixture(),shapes=structuredClone(fixture.deck.pages[0].shapes);
 const physical=['node-source','node-left','node-right'],owners=['object-source','object-left','object-right'];
 const objects=physical.map((id,i)=>({id:owners[i],kind:'container',regionId:'region',box:{...shapes.find(s=>s.id===id).box}}));
 const relations=['left','right'].map((name,i)=>({id:'relation-'+name,regionId:'region',fromId:owners[0],toId:owners[i+1],direction:'forward'}));
 const plan=initializeSceneObjectBatches({version:1,sourceHash:'a'.repeat(64),widthPx:600,heightPx:340,
  relationObservationUnit:'logical-relations-v1',regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:600,h:340}}],objects,relations,
  observedInventory:[{regionId:'region',containers:3,icons:0,relations:2}]});
 const units=[...objects.map((o,i)=>({id:o.id,regionId:o.regionId,kind:o.kind,origin:'proposal',members:[{type:'shape',id:physical[i]}]})),
  ...relations.map(r=>({...r,kind:'relation',origin:'proposal',members:[]}))];
 const graph={id:'shared-graph',regionId:'region',sourceHash:plan.sourceHash,
  nodes:[...physical.map((id,i)=>({id,endpointId:owners[i],nativeId:id})),
   ...['graph-junction','graph-left-turn','graph-right-turn'].map(id=>({id,endpointId:null,nativeId:id}))],
  edges:fixture.edges.map(edge=>({id:edge.id,from:edge.from,to:edge.to,memberId:edge.id,direction:edge.arrow?'forward':'undirected'})),
  paths:fixture.logicalPaths.map((edges,i)=>({relationId:relations[i].id,edges:edges.map(id=>({id,reversed:false}))}))};
 for(const shape of shapes){const i=physical.indexOf(shape.id);shape.source={sceneInventoryId:i>=0?owners[i]:graph.id};}
 return {plan,units,shapes,graph};
}
module.exports={sharedRouteInventoryFixture};
