// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {sealFilledNativeRoutes,readFilledNativeRoutes}=require('./source-filled-route-native');
/** Combine compiler-local output capabilities without serializing source proof.
 * @param {{seal:(page:unknown)=>object,read:(input:unknown)=>import('./source-native-network-registry').ReadResult}} network */
function createNativeRouteReceipts(network){
 /** @type {WeakMap<object,{shared:object,filled:object}>} */const receipts=new WeakMap();
 /** @param {unknown} page */const seal=page=>{
  const state={shared:network.seal(page),filled:sealFilledNativeRoutes(page)},token=Object.freeze(Object.create(null));
  receipts.set(token,state);return token;
 };
 /** @param {unknown} input */const state=input=>record(input)&&input.receipt&&typeof input.receipt==='object'&&!types.isProxy(input.receipt)?receipts.get(input.receipt):undefined;
 /** @param {unknown} input */const read=input=>{
  const saved=state(input);return network.read(saved&&record(input)?{...input,receipt:saved.shared}:input);
 };
 /** @param {unknown} input */const readFilled=input=>{
  const saved=state(input);return readFilledNativeRoutes(saved&&record(input)?{...input,receipt:saved.filled}:input);
 };
 return {seal,read,readFilled};
}
module.exports={createNativeRouteReceipts};
