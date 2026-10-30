// @ts-check
'use strict';
const {createSharedRouteOutputPaintRegistry}=require('./source-shared-route-output-paint');
const {createSharedRouteOutputGroupRegistry}=require('./source-shared-route-output-groups');
const {assertSharedOutputFootprint}=require('./source-shared-output-footprint');
const {compileWholeSharedRoutes}=require('./source-shared-whole-routes');
const {createSourceNativeNetworkRegistry}=require('./source-native-network-registry');
const {createNativeRouteReceipts}=require('./source-native-route-receipts');
/** One composition point for complete output inspection and BOTH private
 * registries. No snapshots are published before the footprint check passes.
 */
function createSharedRouteOutput(){
 const paint=createSharedRouteOutputPaintRegistry(),groups=createSharedRouteOutputGroupRegistry(),native=createSourceNativeNetworkRegistry();
 const receipts=createNativeRouteReceipts(native);
 /** @param {Parameters<typeof assertSharedOutputFootprint>[0]&{slideSize:{widthPt:number,heightPt:number}}} input */
 const capture=input=>{
  if(input.fit.cycleCount)assertSharedOutputFootprint(input);
  const snapshots=paint.capture(input);groups.capture({...input,snapshots});
 };
 /** Validate whole-path paint coverage on the SAME live source ledger before
  * capturing final member identities in either private registry.
  * @param {Parameters<typeof compileWholeSharedRoutes>[0]&{slideSize:{widthPt:number,heightPt:number},prepareNativeGeometry?:boolean}} input */
 const captureWhole=input=>{
  const completed=compileWholeSharedRoutes(input);
  if(input.fit.cycleCount)assertSharedOutputFootprint({...input,parts:completed.footprintParts});
  const final={...input,parts:completed.parts},snapshots=paint.capture(final);groups.capture({...final,snapshots});
  if(input.prepareNativeGeometry)native.capture({...input,graph:completed.graph,members:completed.parts,snapshots});
  return completed;
 };
 return {capture,captureWhole,read:paint.read,readResidual:paint.readResidual,seal:groups.seal,sealNative:receipts.seal,readNative:receipts.read,readNativeFilled:receipts.readFilled};
}
module.exports={createSharedRouteOutput};
