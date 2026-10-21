'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyRuntimeCommandResult:classify,readRuntimeCommandOutput:output,runRuntimeCommand:run}=require('../scripts/lib/runtime-command-result');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
test('runtime command classification distinguishes bounded spawn signal exit and npm failures without output retention',()=>{
 const cases=[['timeout',{error:{code:'ETIMEDOUT'}}],['output-limit',{error:{code:'ENOBUFS'}}],['output-limit',{error:{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'}}],
  ['executable-unavailable',{error:{code:'ENOENT'}}],['permission',{error:{code:'EACCES'}}],['permission',{error:{code:'EPERM'}}],['resource',{error:{code:'ENOMEM'}}],
  ['spawn-failed',{error:Error('private')}],['signal',{signal:'SIGTERM'}],['exit',{status:2}],['npm',{status:1,stderr:'npm error code EUNSUPPORTEDPROTOCOL\nprivate'}],
  ['npm',{status:1,stderr:'npm ERR! code ERESOLVE\r\nprivate'}],['invalid-result',null],['invalid-result',{status:0,stdout:1}]];
 for(const [reason,value]of cases){const result=classify(value);assert.equal(result.reason,reason);assert(Object.isFrozen(result));assert(!JSON.stringify(result).includes('private'));}
 assert.equal(classify({status:1,stderr:'npm error code PRIVATE_KEY\n'}).npmCode,null);
 assert.equal(classify({status:1,stderr:'Authorization: npm error code E401\n'}).npmCode,null);
 assert.equal(classify({status:1,stderr:'x'.repeat(8*1024*1024+1)+'\nnpm error code E401\n'}).npmCode,null);
 assert.equal(classify({status:Number.MAX_SAFE_INTEGER}).exitCode,null);
 assert.equal(classify({status:NaN}).exitCode,null);assert.equal(classify({signal:'private'}).signal,null);
});
test('only an actual successful own-data result grants stdout; hostile fields never execute',()=>{
 assert.equal(output({status:0,error:null,signal:null,stdout:'ready'}),'ready');assert.equal(output({status:0,stdout:''}),'');
 for(const value of [null,undefined,[],{status:0,stdout:1},{status:1,stdout:'ready'},{status:0,error:Error('private'),stdout:'ready'},Object.create({status:0,stdout:'ready'})])assert.equal(output(value),undefined);
 let calls=0;const hostile=new Proxy({},{get(){calls++;throw Error('private');},getOwnPropertyDescriptor(){calls++;throw Error('private');}});
 assert.equal(output(hostile),undefined);classify(hostile);
 for(const key of ['status','stdout','stderr','error','signal']){
  const value={status:0,stdout:'ready',get [key](){calls++;throw Error('private');}};
  if(key!=='stderr')assert.equal(output(value),undefined);classify(value);
 }
 classify({error:{get code(){calls++;throw Error('private');}}});assert.equal(calls,0);
});
test('the production command adapter classifies installation failures and thrown runner errors without leaking their content',()=>{
 for(const thrown of [false,true]){
  let commands=0;
  assert.throws(()=>run((_command,args,options)=>{
   commands++;assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
   assert(args.includes('install'));
   if(thrown)throw Object.assign(Error('private-token'),{code:'ETIMEDOUT'});
   return {status:1,stderr:'npm error code EUNSUPPORTEDPROTOCOL\nprivate-token',stdout:'private-user-content'};
  },process.execPath,['install'],process.cwd(),'runtime package installation failed','package-install'),error=>{
   assert.equal(error.stage,'package-install');assert.equal(error.code,'RUNTIME_COMMAND_FAILED');assert.equal(error.reason,thrown?'timeout':'npm');
   assert.equal(error.npmCode,thrown?null:'EUNSUPPORTEDPROTOCOL');assert(!JSON.stringify(error).includes('private'));assert(!error.message.includes('private'));return true;
  });
  assert.equal(commands,1);
 }
 assert.equal(run(()=>({status:0,stdout:'ready'}),process.execPath,[],process.cwd(),'check failed'),'ready');
 assert.throws(()=>run(()=>null,process.execPath,[],process.cwd(),'check failed'),error=>error.stage==='installed-check'&&error.reason==='invalid-result');
});
test('runtime command regression tests are included in unified CI suites',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
