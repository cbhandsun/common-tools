// @ts-check
'use strict';
const {types}=require('node:util');
const SPAWN_CODES=new Set(['ETIMEDOUT','ENOBUFS','ENOENT','EACCES','EPERM','ENOMEM','ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
const SIGNALS=new Set(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV','SIGBREAK','SIGHUP']);
const NPM_CODES=new Set(['EUNSUPPORTEDPROTOCOL','ERESOLVE','ETARGET','E404','E401','E403','ENOTFOUND','EAI_AGAIN',
 'ECONNREFUSED','ECONNRESET','EINTEGRITY','EBADENGINE','ENOENT','EPERM','EACCES','ENOSPC','ETIMEDOUT',
 'CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN']);
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
 let result;
 try{result=commandRunner(command,argumentsList,{cwd,encoding:'utf8',windowsHide:true,shell:false,timeout:5*60*1000,maxBuffer:8*1024*1024});}
 catch(error){result={error,status:null,signal:null};}
 const output=readRuntimeCommandOutput(result);
 if(output!==undefined)return output;
 const details=classifyRuntimeCommandResult(result);
 throw Object.assign(new Error(`${failureMessage} (${stage}:${details.reason})`),{code:'RUNTIME_COMMAND_FAILED',stage,...details});
}
module.exports={classifyRuntimeCommandResult,readRuntimeCommandOutput,runRuntimeCommand};
