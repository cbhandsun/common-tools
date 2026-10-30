// @ts-check
'use strict';
const {reflowNativeNetworkPage}=require('../slideclone-core/routing/native-network-page-reflow');
const {record,list}=require('../slideclone-core/scene-plan/source-scene-group-containment');
const {readNativeNetworkEditModel}=require('../slideclone-core/routing/native-network-edit-model');
/** Explicit operation in the existing revision-bound IR editor. The graph
 * describes requested output geometry; it cannot authorize source erasure.
 * The editor owns a single ledger and only publishes the cloned deck after
 * ALL operations and final IR validation succeed.
 * @param {unknown} ir @param {unknown} operation
 * @param {import('../slideclone-core/routing/source-shared-route-output-snapshot').Work} work */
function applyNativeNetworkReflowOperation(ir,operation,work){
 if(!record(operation))throw new TypeError('Editable network operation is invalid');
 if(operation.type!=='reflow-native-network')return null;
 const stored=Object.hasOwn(operation,'networkId');
 const keys=stored?['type','pageIndex','networkId','approximation']:['type','pageIndex','graph','parts','relations','arms','approximation'];
 if(Reflect.ownKeys(operation).length!==keys.length||!keys.every(k=>Object.hasOwn(operation,k))
  ||!record(ir)||!list(ir.pages)||typeof operation.pageIndex!=='number'||!Number.isSafeInteger(operation.pageIndex)
  ||operation.pageIndex<0||operation.pageIndex>=ir.pages.length)throw new TypeError('Editable network operation is invalid');
 const page=ir.pages[operation.pageIndex],model=stored?readNativeNetworkEditModel(page,operation.networkId):operation;
 const result=reflowNativeNetworkPage({...model,approximation:operation.approximation,page,work});
 if(!result)throw new TypeError('Editable network operation cannot preserve the complete network');
 ir.pages[operation.pageIndex]=result.page;return result.report;
}
module.exports={applyNativeNetworkReflowOperation};
