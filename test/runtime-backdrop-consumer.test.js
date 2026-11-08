'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {approvedBackdropConsumerProbe}=require('../scripts/lib/runtime-backdrop-consumer');
const {runRuntimeProbe}=require('../scripts/lib/runtime-command-result');
test('actual backdrop consumer satisfies the production exact-ready contract after checking pixels and raw reconstruction',()=>{
 const result=runRuntimeProbe(spawnSync,process.execPath,['-e',approvedBackdropConsumerProbe(),process.cwd()],process.cwd(),'backdrop-consumer-check');
 assert.equal(result,'ready');
});
test('consumer failure is a fixed classified stage without paths or child error content',()=>{
 const missing=path.join(process.cwd(),'unavailable-private-consumer-root');
 assert.throws(()=>runRuntimeProbe(spawnSync,process.execPath,['-e',approvedBackdropConsumerProbe(),missing],process.cwd(),'backdrop-consumer-check'),error=>{
  assert.equal(error.code,'RUNTIME_PROBE_FAILED');assert.equal(error.probeCode,'backdrop-cold-load');assert.equal(error.exitCode,2);
  assert.ok(!error.message.includes('private'));assert.ok(!JSON.stringify(error).includes(missing));return true;
 });
});
test('new probe diagnostics remain a fixed allowlist and cannot authorize arbitrary child output',()=>{
 for(const code of ['backdrop-cold-load','backdrop-fixture','backdrop-raw-consume','backdrop-pixel-consume','backdrop-cleanup','backdrop-consumer-failed']){
  assert.throws(()=>runRuntimeProbe(()=>({status:2,stdout:code}),process.execPath,[],process.cwd(),'probe-failed'),error=>error.probeCode===code);
 }
 for(const code of ['backdrop-private-token','backdrop-fixture\nprivate','backdrop-cold-load/secret']){
  assert.throws(()=>runRuntimeProbe(()=>({status:2,stdout:code}),process.execPath,[],process.cwd(),'probe-failed'),error=>error.probeCode==='unclassified'&&!JSON.stringify(error).includes('private'));
 }
});
test('backdrop probe regressions enter unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>path.basename(row.file)==='runtime-backdrop-consumer.test.js'));
});
