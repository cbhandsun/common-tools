// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
/** Portable OUTPUT editing data. A model cannot renew a source measurement,
 * erase pixels, grant source identity, or certify ordinary Office following.
 * @param {unknown} input */
function createNativeNetworkEditModel(input){
 if(!record(input)||!sharedOutputWork(input.work)||!record(input.graph)||typeof input.graph.id!=='string'
  ||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(input.graph.id)||!list(input.parts)||input.parts.length>128
  ||!list(input.relations)||input.relations.length>48||!list(input.arms)||input.arms.length>128)
  throw new TypeError('Native network edit model is invalid');
 const snapshot=sharedRouteOutputSnapshot({box:{x:0,y:0,w:1,h:1},source:{model:{
  kind:'output-native-network-edit-v1',id:input.graph.id,graph:input.graph,parts:input.parts,relations:input.relations,arms:input.arms,
  sourceOwnershipGranted:false,automaticOfficeFollowingVerified:false}}},input.work);
 if(snapshot===null){if(!chargeSharedOutput(input.work,0))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
  throw new TypeError('Native network edit model is invalid');}
 return /** @type {{source:{model:{kind:string,id:string,graph:unknown,parts:unknown[],relations:unknown[],arms:unknown[],sourceOwnershipGranted:false,automaticOfficeFollowingVerified:false}}}} */(JSON.parse(snapshot)).source.model;
}
/** Serialized models are untrusted geometry requests. The application still
 * checks the complete current roster, retained anchors and solved network.
 * @param {unknown} page @param {unknown} networkId */
function readNativeNetworkEditModel(page,networkId){
 if(!record(page)||!record(page.source)||!list(page.source.nativeNetworkEditModels)||page.source.nativeNetworkEditModels.length>24
  ||typeof networkId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(networkId))throw new TypeError('Native network edit model is invalid');
 const models=page.source.nativeNetworkEditModels;
 if(!models.every(m=>record(m)&&typeof m.id==='string')||new Set(models.map(m=>/** @type {Record<string,unknown>} */(m).id)).size!==models.length)
  throw new TypeError('Native network edit model is invalid');
 const model=models.find(m=>record(m)&&m.id===networkId);
 if(!record(model)||model.kind!=='output-native-network-edit-v1'||!record(model.graph)||model.graph.id!==networkId)
  throw new TypeError('Native network edit model is invalid');
 return {graph:model.graph,parts:model.parts,relations:model.relations,arms:model.arms};
}
module.exports={createNativeNetworkEditModel,readNativeNetworkEditModel};
