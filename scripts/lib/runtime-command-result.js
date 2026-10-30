// @ts-check
'use strict';
const {types}=require('node:util');
const SPAWN_CODES=new Set(['ETIMEDOUT','ENOBUFS','ENOENT','EACCES','EPERM','ENOMEM','ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
const SIGNALS=new Set(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV','SIGBREAK','SIGHUP']);
const NPM_CODES=new Set(['EUNSUPPORTEDPROTOCOL','ERESOLVE','ETARGET','E404','E401','E403','ENOTFOUND','EAI_AGAIN',
 'ECONNREFUSED','ECONNRESET','EINTEGRITY','EBADENGINE','ENOENT','EPERM','EACCES','ENOSPC','ETIMEDOUT',
 'CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN']);
// Fixed diagnostics emitted by the six checked-in installed consumer probes.
// Never derive this authorization from child output or executable arguments.
const PROBE_STAGES=new Set([
 'backdrop-cold-load','backdrop-fixture','backdrop-raw-consume','backdrop-pixel-consume','backdrop-cleanup','backdrop-consumer-failed',
 'worker-cleanup','worker-cold-load','worker-consumer-assertions','worker-consumer-failed',
 'worker-default-budget','worker-factory','worker-fixture','worker-reconstruction',
 'worker-program-calls','worker-program-cleanup','worker-program-cold-load','worker-program-completion',
 'worker-program-consumer-failed','worker-program-dash-fixture','worker-program-factory','worker-program-fixture',
 'worker-program-labels','worker-program-native-members','worker-program-reconstruction','worker-program-relation','worker-program-unresolved',
 'worker-shared-calls','worker-shared-cleanup','worker-shared-cold-load','worker-shared-completion',
 'worker-shared-consumer-failed','worker-shared-factory','worker-shared-fixture','worker-shared-inventory',
 'worker-shared-native-members','worker-shared-ordered-path','worker-shared-reconstruction','worker-shared-retirement',
 'batch-quality-export','capability-version','core-load','document-normalizer-export','initialization',
 'local-batch-cli','local-batch-core','local-batch-skill','manifest-load','marketplace-skill-gate',
 'native-export','native-strategy','production-profile','remote-worker-wiring','residual-export',
 'source-archive-export','source-read','source-worker-contract','worker-export','worker-quality-gate',
 'brief-plan','brief-planning','brief-schema','candidate-bounds','data-model','deterministic-plan',
 'editor','editor-persistence','editor-preview','format-export','formats','layout-export','layout-registry',
 'native-chart-payload','plan','registry-load','schema-semantic-visuals','schema-variant-bound','semantic-component',
 'semantic-component-plan','theme-registry','asset-provenance','citations-notes','content-provider',
 'controlled-semantic-editor','deck-variants','document-ingest','editable-data-admission','image-delivery',
 'ir-editor','ir-editor-session','ir-lifecycle','ir-page-lifecycle','marketplace-skill','module-load',
 'openxml-notes','openxml-template','prompt-compose','semantic-depth','spec-schema','team-archive',
 'team-worker','template-safety','variants'
]);
/** @param {unknown} input @param {string} key @returns {unknown} */
function data(input,key){
 if(input===null||typeof input!=='object'||types.isProxy(input))return undefined;
 const property=Object.getOwnPropertyDescriptor(input,key);return property&&'value'in property?property.value:undefined;
}
/** @param {unknown} input @returns {string|undefined} */
function readRuntimeCommandOutput(input){
 if(input===null||typeof input!=='object'||Array.isArray(input)||types.isProxy(input))return undefined;
 for(const key of ['status','signal','error','stdout']){
  const property=Object.getOwnPropertyDescriptor(input,key);if(property&&!('value'in property))return undefined;
 }
 const error=data(input,'error'),signal=data(input,'signal'),stdout=data(input,'stdout');
 return data(input,'status')===0&&(error===undefined||error===null)&&(signal===undefined||signal===null)&&typeof stdout==='string'?stdout:undefined;
}
/** Never retain process output, arbitrary error strings or user-controlled
 * codes. Child-process and npm codes are admitted through separate allowlists.
 * @param {unknown} input */
function classifyRuntimeCommandResult(input){
 const status=data(input,'status'),rawSignal=data(input,'signal'),error=data(input,'error'),rawCode=data(error,'code');
 const exitCode=typeof status==='number'&&Number.isSafeInteger(status)&&status>=-2147483648&&status<=4294967295?status:null;
 const signal=typeof rawSignal==='string'&&SIGNALS.has(rawSignal)?rawSignal:null;
 const spawnCode=typeof rawCode==='string'&&SPAWN_CODES.has(rawCode)?rawCode:null;
 let reason='invalid-result',npmCode=null;
 if(spawnCode==='ETIMEDOUT')reason='timeout';
 else if(spawnCode==='ENOBUFS'||spawnCode==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')reason='output-limit';
 else if(spawnCode==='ENOENT')reason='executable-unavailable';
 else if(spawnCode==='EACCES'||spawnCode==='EPERM')reason='permission';
 else if(spawnCode==='ENOMEM')reason='resource';
 else if(error!==undefined&&error!==null)reason='spawn-failed';
 else if(rawSignal!==undefined&&rawSignal!==null)reason='signal';
 else if(exitCode!==null&&exitCode!==0){
  reason='exit';const stderr=data(input,'stderr');
  if(typeof stderr==='string'&&stderr.length<=8*1024*1024){
   for(const match of stderr.matchAll(/^npm (?:error|ERR!) code ([A-Z0-9_]{1,64})\r?$/gmu)){
    const code=match[1];if(code&&NPM_CODES.has(code)){npmCode=code;reason='npm';break;}
   }
  }
 }
 return Object.freeze({reason,exitCode,signal,spawnCode,npmCode});
}
/** @param {(command:string,args:readonly string[],options:{cwd:string,encoding:'utf8',windowsHide:true,shell:false,timeout:number,maxBuffer:number})=>unknown} commandRunner
 * @param {string} command @param {readonly string[]} argumentsList @param {string} cwd
 * @param {string} failureMessage @param {'package-build'|'package-install'|'installed-check'} [stage] */
function runRuntimeCommand(commandRunner,command,argumentsList,cwd,failureMessage,stage='installed-check'){
 if(!['package-build','package-install','installed-check'].includes(stage))throw new TypeError('Runtime command stage is invalid');
 // Cold npm installation on Windows includes dependency extraction and file
 // materialization. Its approved deadline is separate from builds/checks.
 const timeout=stage==='package-install'?10*60*1000:5*60*1000;
 let result;
 try{result=commandRunner(command,argumentsList,{cwd,encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:8*1024*1024});}
 catch(error){result={error,status:null,signal:null};}
 const output=readRuntimeCommandOutput(result);
 if(output!==undefined)return output;
 const details=classifyRuntimeCommandResult(result);
 throw Object.assign(new Error(`${failureMessage} (${stage}:${details.reason})`),{code:'RUNTIME_COMMAND_FAILED',stage,...details});
}
/** Shared process policy for installed probes and their CI consumer harness.
 * @param {unknown} [profile]
 * @returns {Readonly<{encoding:'utf8',windowsHide:true,shell:false,timeout:number,maxBuffer:number}>} */
function runtimeProbeOptions(profile='standard'){
 if(profile!=='standard'&&profile!=='shared-route')throw new TypeError('Runtime probe profile is invalid');
 // The shared-route consumer runs five complete reconstruction scenarios.
 return Object.freeze({encoding:'utf8',windowsHide:true,shell:false,timeout:profile==='shared-route'?120000:60000,maxBuffer:4096});
}
/** Strict installed consumer probe: bounded profiles and exact ready contract.
 * @param {(command:string,args:readonly string[],options:{cwd:string,encoding:'utf8',windowsHide:true,shell:false,timeout:number,maxBuffer:number})=>unknown} commandRunner
 * @param {string} command @param {readonly string[]} argumentsList @param {string} cwd @param {string} failureMessage
 * @param {'standard'|'shared-route'} [profile] */
function runRuntimeProbe(commandRunner,command,argumentsList,cwd,failureMessage,profile='standard'){
 const options=runtimeProbeOptions(profile);
 let result;
 try{result=commandRunner(command,argumentsList,{cwd,...options});}
 catch(error){result={error,status:null,signal:null};}
 if(readRuntimeCommandOutput(result)==='ready')return 'ready';
 // Probe stderr has no diagnostic authority, including npm-looking lines.
 const details=classifyRuntimeCommandResult({status:data(result,'status'),signal:data(result,'signal'),error:data(result,'error')});
 const stdout=data(result,'stdout');
 const probeCode=typeof stdout==='string'&&PROBE_STAGES.has(stdout)?stdout:'unclassified';
 const diagnostic=`reason=${details.reason}; exitCode=${details.exitCode}; signal=${details.signal}; spawnCode=${details.spawnCode}`;
 throw Object.assign(new Error(`${failureMessage} (${probeCode}) [${diagnostic}]`),{code:'RUNTIME_PROBE_FAILED',probeCode,...details});
}
module.exports={classifyRuntimeCommandResult,readRuntimeCommandOutput,runRuntimeCommand,runRuntimeProbe,runtimeProbeOptions};
