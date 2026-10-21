"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {residualOwnershipRejection,readResidualOwnershipRejection,attemptSourceResidual}=require('../packages/slideclone-core/residual-branch-result');
const report=()=>({passed:false,scannedPixels:100,ownedPixels:12,ownedForegroundPixels:12,
 remainingOwnedForegroundPixels:0,remainingOwnedBackgroundPixels:0,unownedChangedPixels:0,
 remainingTextCorePixels:2,incorrectTextBackgroundPixels:0,unresolvedTextMasks:0});
test('accepted residual output retains its identity',async()=>{
 const residual={erasedObjects:3};assert.deepEqual(await attemptSourceResidual(async()=>residual),{kind:'accepted',residual});
});
test('only a private failed audit becomes a rejected branch with frozen numeric evidence',async()=>{
 const input=report(),error=residualOwnershipRejection(input);input.remainingTextCorePixels=0;
 const result=await attemptSourceResidual(async()=>{throw error;});
 assert.equal(result.kind,'rejected');assert.equal(result.pixelOwnership.remainingTextCorePixels,2);
 assert(Object.isFrozen(result.pixelOwnership));assert.equal(readResidualOwnershipRejection(error),result.pixelOwnership);
 assert.deepEqual(Object.keys(error),[]);
});
test('copies, provider error messages, cancellation and budget failures propagate unchanged',async()=>{
 const error=residualOwnershipRejection(report());
 for(const failure of [new Error(error.message),{...error},new Proxy(error,{}),new Error('editable job was cancelled'),new RangeError('pixel budget'),null]){
  await assert.rejects(attemptSourceResidual(async()=>{throw failure;}),received=>received===failure);
 }
 await assert.rejects(attemptSourceResidual(null),TypeError);
});
test('invalid, empty, extreme and hostile reports never create a recoverable error',()=>{
 let accessed=0;const hostile={get passed(){accessed++;throw Error('secret');}};
 for(const input of [null,{},[],hostile,new Proxy(report(),{}),{...report(),passed:true},{...report(),remainingTextCorePixels:0},
  {...report(),remainingTextCorePixels:40000001},{...report(),scannedPixels:Infinity},{...report(),scannedPixels:-1},
  {...report(),scannedPixels:.5},{...report(),payload:'private-text'}])
  assert.throws(()=>residualOwnershipRejection(input),e=>e instanceof TypeError&&!e.message.includes('secret'));
 assert.equal(accessed,0);
 const maximum={...report(),scannedPixels:40000000};assert.equal(readResidualOwnershipRejection(residualOwnershipRejection(maximum)).scannedPixels,40000000);
});
