'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyRuntimeCommandResult:classify,readRuntimeCommandOutput:output,runRuntimeCommand:run,runRuntimeProbe:probe}=require('../scripts/lib/runtime-command-result');
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

test('only package installation receives the approved ten minute command deadline',()=>{
 for(const [stage,timeout]of [['package-build',300000],['package-install',600000],['installed-check',300000],[undefined,300000]]){
  let calls=0;
  assert.equal(run((command,args,options)=>{
   calls++;assert.equal(command,'node');assert.deepEqual(args,['fixture']);
   assert.deepEqual(options,{cwd:'.',encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:8*1024*1024});
   return {status:0,stdout:''};
  },'node',['fixture'],'.','command failed',stage),'');
  assert.equal(calls,1);
 }
 let calls=0;
 assert.throws(()=>run((_command,_args,options)=>{
  calls++;assert.equal(options.timeout,600000);
  return {status:null,signal:'SIGTERM',error:{code:'ETIMEDOUT'},stdout:'private-content',stderr:'private-content'};
 },'node',[],'.','command failed','package-install'),error=>{
  assert.equal(error.code,'RUNTIME_COMMAND_FAILED');assert.equal(error.reason,'timeout');
  assert.equal(error.stage,'package-install');assert.equal(error.spawnCode,'ETIMEDOUT');
  assert.equal(error.signal,'SIGTERM');assert.equal(error.exitCode,null);
  assert(!JSON.stringify(error).includes('private'));return true;
 });
 assert.equal(calls,1);
});

test('runtime command stages reject invalid or hostile input before invoking a process',()=>{
 let reads=0,calls=0;
 const hostile=new Proxy({},{get(){reads++;throw Error('private');},getOwnPropertyDescriptor(){reads++;throw Error('private');}});
 const accessor={get toString(){reads++;throw Error('private');}};
 for(const stage of [null,'','private','__proto__','constructor','private'.repeat(10000),0,NaN,Infinity,{},[],Symbol('private'),hostile,accessor]){
  assert.throws(()=>run(()=>{calls++;return {status:0,stdout:'ready'};},'node',[],'.','command failed',stage),error=>{
   assert(error instanceof TypeError);assert.equal(error.message,'Runtime command stage is invalid');return true;
  });
 }
 assert.equal(reads,0);assert.equal(calls,0);
});

test('shared route deadline is bounded separately from standard consumer probes',()=>{
 for(const [profile,timeout]of [[undefined,60000],['standard',60000],['shared-route',120000]]){
  let calls=0;
  assert.equal(probe((command,args,options)=>{
   calls++;assert.equal(command,'node');assert.deepEqual(args,['fixture']);
   assert.deepEqual(options,{cwd:'.',encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:4096});
   return {status:0,stdout:'ready'};
  },'node',['fixture'],'.','probe failed',profile),'ready');
  assert.equal(calls,1);
 }
 let calls=0;
 assert.throws(()=>probe((_command,_args,options)=>{
  calls++;assert.equal(options.timeout,120000);
  return {status:null,signal:'SIGTERM',error:{code:'ETIMEDOUT'},stdout:'private',stderr:'private'};
 },'node',[],'.','probe failed','shared-route'),error=>{
  assert.equal(error.code,'RUNTIME_PROBE_FAILED');assert.equal(error.reason,'timeout');
  assert.equal(error.signal,'SIGTERM');assert.equal(error.spawnCode,'ETIMEDOUT');
  assert.equal(error.exitCode,null);assert(!JSON.stringify(error).includes('private'));return true;
 });
 assert.equal(calls,1);
});

test('consumer process options share the approved bounded policy without mutable global state',()=>{
 const {runtimeProbeOptions}=require('../scripts/lib/runtime-command-result');
 for(const [profile,timeout]of [[undefined,60000],['standard',60000],['shared-route',120000]]){
  const options=runtimeProbeOptions(profile);
  assert.deepEqual(options,{encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:4096});
  assert.equal(Object.isFrozen(options),true);
  assert.throws(()=>{options.timeout=1;},TypeError);
  assert.equal(runtimeProbeOptions(profile).timeout,timeout);
 }
 let reads=0;
 const trap=()=>{reads++;throw Error('private');};
 for(const profile of [null,'','unknown',0,Infinity,[],{},Symbol('private'),
  new Proxy({},{get:trap,getOwnPropertyDescriptor:trap}),{get toString(){return trap();}}])
  assert.throws(()=>runtimeProbeOptions(profile),TypeError);
 assert.equal(reads,0);
});

test('consumer probe profiles reject invalid or hostile inputs before process invocation',()=>{
 let reads=0,calls=0;
 const hostile=new Proxy({},{get(){reads++;throw Error('private');},getOwnPropertyDescriptor(){reads++;throw Error('private');}});
 const accessor={get toString(){reads++;throw Error('private');}};
 for(const profile of [null,'','private','__proto__','constructor','shared-route'.repeat(10000),0,NaN,Infinity,{},[],Symbol('private'),hostile,accessor]){
  assert.throws(()=>probe(()=>{calls++;return {status:0,stdout:'ready'};},'node',[],'.','probe failed',profile),error=>{
   assert(error instanceof TypeError);assert.equal(error.message,'Runtime probe profile is invalid');return true;
  });
 }
 assert.equal(reads,0);assert.equal(calls,0);
});

test('strict runtime probes catch thrown runner failures without retaining exception content or arguments',()=>{
 let touched=0;
 const hostile=new Proxy(Error('private-content'),{get(){touched++;throw Error('private-content');},getOwnPropertyDescriptor(){touched++;throw Error('private-content');}});
 const cases=[
  [Object.assign(Error('private-content'),{code:'ETIMEDOUT'}),'timeout','ETIMEDOUT'],
  [Object.assign(Error('private-content'),{code:'ENOBUFS'}),'output-limit','ENOBUFS'],
  [Object.assign(Error('private-content'),{code:'ENOENT'}),'executable-unavailable','ENOENT'],
  [Object.assign(Error('private-content'),{code:'EPERM'}),'permission','EPERM'],
  [Object.assign(Error('private-content'),{code:'ENOMEM'}),'resource','ENOMEM'],
  [Object.assign(Error('private-content'),{code:'private-content'}),'spawn-failed',null],
  ['private-content','spawn-failed',null],[hostile,'spawn-failed',null]
 ];
 for(const [original,reason,spawnCode]of cases){
  assert.throws(()=>probe(()=>{throw original;},'private-command',['private-argument'],'private-directory','probe failed'),error=>{
   assert.equal(error.code,'RUNTIME_PROBE_FAILED');assert.equal(error.reason,reason);assert.equal(error.spawnCode,spawnCode);
   assert.equal(error.probeCode,'unclassified');assert.equal(error.exitCode,null);assert.equal(error.signal,null);
   assert.notEqual(error,original);assert(!Object.hasOwn(error,'cause'));
   assert(!error.message.includes('private'));assert(!error.stack.includes('private'));assert(!JSON.stringify(error).includes('private'));return true;
  });
 }
 assert.equal(touched,0);
});

test('strict runtime probes require exact own-data ready and never execute hostile result fields',()=>{
 assert.equal(probe(()=>({status:0,stdout:'ready',error:null,signal:null}),'node',[],'.','probe failed'),'ready');
 let touched=0;
 const hostile=new Proxy({},{get(){touched++;throw Error('private');},getOwnPropertyDescriptor(){touched++;throw Error('private');}});
 const invalid=[null,undefined,[],hostile,Object.create({status:0,stdout:'ready'}),
  {status:0,stdout:''},{status:0,stdout:' ready'},{status:0,stdout:'ready\n'},{status:0,stdout:Buffer.from('ready')},
  {status:1,stdout:'ready'},{status:0,stdout:'ready',error:Error('private')},{status:0,stdout:'ready',signal:'private'},
  {status:0,stdout:'ready',signal:'SIGTERM'}];
 for(const key of ['status','stdout','error','signal'])invalid.push({status:0,stdout:'ready',get [key](){touched++;throw Error('private');}});
 for(const value of invalid)assert.throws(()=>probe(()=>value,'node',[],'.','probe failed'),error=>error.code==='RUNTIME_PROBE_FAILED');
 const successful={status:0,stdout:'ready',get stderr(){touched++;throw Error('private');}};
 assert.equal(probe(()=>successful,'node',[],'.','probe failed'),'ready');
 assert.equal(touched,0);
});

test('runtime probe diagnostics authorize fixed stages and bound exit signal and spawn fields',()=>{
 const cases=[
  [{status:2,stdout:'worker-reconstruction'},'worker-reconstruction',2,null,null,'exit'],
  [{status:2,stdout:'private-content'},'unclassified',2,null,null,'exit'],
  [{status:2,stdout:'worker-untrusted-stage'},'unclassified',2,null,null,'exit'],
  [{status:2,stdout:'ready'},'unclassified',2,null,null,'exit'],
  [{status:-2147483648},'unclassified',-2147483648,null,null,'exit'],
  [{status:4294967295},'unclassified',4294967295,null,null,'exit'],
  [{status:Number.MAX_SAFE_INTEGER},'unclassified',null,null,null,'invalid-result'],
  [{status:NaN},'unclassified',null,null,null,'invalid-result'],
  [{status:null,signal:'SIGTERM'},'unclassified',null,'SIGTERM',null,'signal'],
  [{status:null,signal:'private-content'},'unclassified',null,null,null,'signal'],
  [{error:{code:'private-content'}},'unclassified',null,null,null,'spawn-failed']
 ];
 for(const [result,probeCode,exitCode,signal,spawnCode,reason]of cases){
  assert.throws(()=>probe(()=>result,'node',['worker-untrusted-stage'],'.','probe failed'),error=>{
   assert.deepEqual([error.probeCode,error.exitCode,error.signal,error.spawnCode,error.reason],[probeCode,exitCode,signal,spawnCode,reason]);
   assert(!error.message.includes('private'));assert(!JSON.stringify(error).includes('private'));return true;
  });
 }
 let reads=0;
 for(const stderr of ['npm error code E401\nprivate-content','private-content',undefined]){
  assert.throws(()=>probe(()=>({status:2,stderr}),'node',[],'.','probe failed'),error=>error.reason==='exit'&&error.npmCode===null);
 }
 assert.throws(()=>probe(()=>({status:2,get stderr(){reads++;throw Error('private');}}),'node',[],'.','probe failed'),error=>error.reason==='exit');
 assert.equal(reads,0);
});
