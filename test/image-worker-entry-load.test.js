'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const probe=String.raw`
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=process.argv[1],mode=process.argv[2],entry=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js');
const original=Module._load,blocked=[];
const serviceImports=new Set(['../../team-runtime','../../slideclone-worker-adapter/team-worker',
 '../../slideclone-worker-adapter/team-document-normalizer','../../ppt-create-core/image-delivery',
 '../../ppt-create-core/libreoffice-pdf','../team-providers','../telemetry']);
Module._load=function(request,parent,isMain){
 if(parent?.filename===entry&&serviceImports.has(request)){blocked.push(request);throw Object.assign(Error('service-load-sentinel'),{code:'SERVICE_LOAD_SENTINEL'});}
 return original.apply(this,arguments);
};
(async()=>{
 const worker=require(entry);
 assert.deepEqual(Object.keys(worker).sort(),['createNativeRebuilder','createRenderQualityVerifier','createTeamImageDelivery','main','pathIsFile','startupFailureCode','workerSettings'].sort());
 if(mode==='factory'){
  assert.equal(worker.createNativeRebuilder,require(path.join(root,'packages/remote-mcp-server/image-native-rebuilder.js')).createNativeRebuilder);
  assert.equal(worker.startupFailureCode(Error('Connector corner mode is invalid')),'invalid-configuration');
  assert.throws(()=>worker.workerSettings({OPENXML_BUILDER_EXE:process.execPath,COMMON_TOOLS_WORKER_POLL_SECONDS:'0'}),/POLL_SECONDS/u);
  assert.equal(blocked.length,0);
 }else{
  await assert.rejects(worker.main({}),error=>error.code==='SERVICE_LOAD_SENTINEL');
  assert.equal(blocked.length,1);
 }
 process.stdout.write('ready');
})().catch(()=>{process.stdout.write('failed');process.exitCode=2;});
`;
for(const mode of ['factory','main'])test(`Worker ${mode} preserves service startup isolation`,{timeout:70000},()=>{
 const result=spawnSync(process.execPath,['-e',probe,root,mode],{cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:60000,maxBuffer:4096});
 assert.equal(result.status,0,JSON.stringify({status:result.status,signal:result.signal,code:result.error?.code??null}));
 assert.equal(result.stdout,'ready');
});
test('entry load regressions run through the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(root,suite).some(p=>p.file.endsWith('image-worker-entry-load.test.js')));
});
