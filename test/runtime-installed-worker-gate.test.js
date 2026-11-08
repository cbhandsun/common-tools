'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verifyInstalledCli}=require('../scripts/verify-runtime-package');
const {sceneWorkerConsumerProbe}=require('../scripts/lib/runtime-worker-consumer');
const {sceneProgramConsumerProbe}=require('../scripts/lib/runtime-program-consumer');
const {sceneSharedRouteConsumerProbe}=require('../scripts/lib/runtime-shared-route-consumer');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
for(const kind of ['worker','program','shared'])test('formal installed release gate rejects broken '+kind+' consumption even when syntax and earlier probes pass',t=>{
 const parent=fs.realpathSync(os.tmpdir()),installRoot=fs.mkdtempSync(path.join(parent,'runtime-worker-gate-test-'));
 t.after(()=>{assert.equal(path.dirname(installRoot),parent);fs.rmSync(installRoot,{recursive:true,force:true});});
 const packageRoot=path.join(installRoot,'node_modules/common-tools');
 const write=(file,body)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);};
 write(path.join(packageRoot,'package.json'),JSON.stringify({name:'common-tools',dependencies:{}}));
 write(path.join(packageRoot,'packages/fixture-core/package.json'),JSON.stringify({name:'@common-tools/fixture-core',version:'0.1.0',main:'index.js'}));
 write(path.join(packageRoot,'packages/fixture-core/index.js'),'module.exports={};');
 write(path.join(packageRoot,'packages/cli/bin/common-tools.js'),'');
 write(path.join(installRoot,'node_modules/.bin',process.platform==='win32'?'common-tools.cmd':'common-tools'),'');
 write(path.join(packageRoot,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'),"throw Error('private-token user-content');");
 let syntax=0,consumer=0;
 const commandRunner=(command,args,options)=>{
  if(args[0]==='--check'){syntax++;return spawnSync(command,args,options);}
  if(args[0]==='-e'&&args[1]===sceneWorkerConsumerProbe()){consumer++;return kind!=='worker'?{status:0,stdout:'ready',stderr:''}:spawnSync(command,args,options);}
  if(args[0]==='-e'&&args[1]===sceneProgramConsumerProbe()){consumer++;return kind==='shared'?{status:0,stdout:'ready',stderr:''}:spawnSync(command,args,options);}
  if(args[0]==='-e'&&args[1]===sceneSharedRouteConsumerProbe()){consumer++;return spawnSync(command,args,options);}
  if(args.includes('help'))return {status:0,stdout:'usage: common-tools <command>'};
  if(args.includes('list'))return {status:0,stdout:JSON.stringify({distributionVerified:true,capabilities:['image-to-editable']})};
  if(args.includes('production-acceptance-plan'))return {status:0,stdout:JSON.stringify({status:'blocked-by-configuration',requiredConfiguration:{}})};
  if(args.includes('migration-status'))return {status:1,stdout:'--production-env-file must be an absolute path',stderr:''};
  return {status:0,stdout:'ready'};
 };
 assert.throws(()=>verifyInstalledCli({installRoot,commandRunner,expectedPackageFolders:['fixture-core']}),error=>{
  const expected={worker:/Worker consumer check failed \(worker-cold-load\)/,program:/program consumer check failed \(worker-program-cold-load\)/,shared:/shared route consumer check failed \(worker-shared-cold-load\)/};
  assert.match(error.message,expected[kind]);assert(!error.message.includes('private-token'));return true;
 });
 assert.equal(syntax,1);assert.equal(consumer,['worker','program','shared'].indexOf(kind)+1);
});
test('installed release gate regressions enter unified CI',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
