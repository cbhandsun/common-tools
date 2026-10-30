// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {parseConnectorCornerMode}=require('../slideclone-core/routing/source-route-corner-mode');
const {auditSemanticEditability:audit}=require('../slideclone-core/quality/semantic-editability-quality');
/** @type {AsyncLocalStorage<'node-rerouting'|'native-path'>} */const policies=new AsyncLocalStorage();
/** Per-job policy comes from validated worker configuration, never deck IR.
 * Async isolation keeps concurrent jobs and every candidate/refiner consistent.
 * @template T @param {unknown} mode @param {()=>T} operation @returns {T} */
function withWorkerRelationshipPolicy(mode,operation){
 const parsed=parseConnectorCornerMode(mode);
 return policies.run(parsed==='reroutable-elbow'?'node-rerouting':'native-path',operation);
}
/** @param {unknown} deck */
function auditWorkerSemanticEditability(deck){return audit(deck,{relationshipEditing:policies.getStore()??'node-rerouting'});}
module.exports={withWorkerRelationshipPolicy,auditWorkerSemanticEditability};
