// @ts-check
'use strict';
const {sceneExecutionPolicy}=require('./scene-execution-policy');
/** @type {WeakMap<object,string>} */
const failures=new WeakMap();
/** @param {string} code @returns {never} */
function fail(code){const error=new Error('Scene response is invalid');failures.set(error,code);throw error;}
/** Provider exceptions cannot forge one of this module's safe stage codes.
 * @param {unknown} error */
function sceneResponseFailureCode(error){return error!==null&&typeof error==='object'?failures.get(error):undefined;}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
/** Enforce the caller's existing abort boundary even when a transport or body
 * adapter fails to reject its pending promise on abort. Observe late failures.
 * @template T @param {Promise<T>} operation @param {AbortSignal|undefined} signal @returns {Promise<T>} */
function awaitSceneResponse(operation,signal){
 if(!signal)return operation;
 return new Promise((resolve,reject)=>{
  const aborted=()=>{signal.removeEventListener('abort',aborted);reject(new Error('Scene response was aborted'));};
  if(signal.aborted){operation.catch(()=>{});aborted();return;}
  signal.addEventListener('abort',aborted,{once:true});
  operation.then(value=>{signal.removeEventListener('abort',aborted);if(signal.aborted)aborted();else resolve(value);},
   error=>{signal.removeEventListener('abort',aborted);reject(error);});
 });
}
/** @param {unknown} envelope */
function completeContent(envelope){
 if(record(envelope)&&Object.hasOwn(envelope,'error'))return fail('SCENE_PROVIDER_STREAM_FAILED');
 if(!record(envelope)||!Array.isArray(envelope.choices)||envelope.choices.length!==1)return fail('SCENE_INCOMPLETE_RESPONSE');
 const choice=envelope.choices[0];
 if(!record(choice)||!record(choice.message)||typeof choice.message.content!=='string'||choice.finish_reason!=='stop')
  return fail('SCENE_INCOMPLETE_RESPONSE');
 return choice.message.content;
}
/** Assemble one OpenAI chat choice only after BOTH its successful finish and
 * [DONE]. Partial text, upstream error events and a dropped terminal never
 * become an editable scene. Wire, event and generated-content limits are
 * independent. This reader owns no retry, timeout or source allowance.
 * @param {Response} response @param {boolean} streaming @param {AbortSignal} [signal]
 * @param {'standard'|'quality'} [profile] @returns {Promise<string>} */
async function readSceneResponseContent(response,streaming,signal,profile='standard'){
 const limits=sceneExecutionPolicy(profile);
 if(!response.body)throw new TypeError('Scene response body is missing');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let total=0,buffer='',pendingData=/** @type {string[]} */([]),event='',content='',finished=false,done=false,fullyRead=false;
 let contentBytes=0,eventBytes=0;
 /** @param {string} delta */
 const appendContent=delta=>{
  // A provider may split a UTF-16 surrogate pair between JSON deltas.
  const joinedPair=/[\uD800-\uDBFF]$/u.test(content)&&/^[\uDC00-\uDFFF]/u.test(delta);
  contentBytes+=Buffer.byteLength(delta,'utf8')-(joinedPair?2:0);
  if(contentBytes>limits.contentBytes)return fail('SCENE_CONTENT_TOO_LARGE');
  content+=delta;
 };
 const sse=streaming&&/^text\/event-stream(?:\s*;|$)/iu.test(response.headers.get('content-type')??'');
 /** @param {string} raw */
 const consume=raw=>{
  if(event==='error')return fail('SCENE_PROVIDER_STREAM_FAILED');
  if(raw==='[DONE]'){
   if(done||!finished)return fail('SCENE_INCOMPLETE_RESPONSE');done=true;return;
  }
  if(done)return fail('SCENE_INVALID_STREAM');
  /** @type {unknown} */let parsed;
  try{parsed=JSON.parse(raw);}catch{return fail('SCENE_INVALID_ENVELOPE_JSON');}
  if(record(parsed)&&Object.hasOwn(parsed,'error'))return fail('SCENE_PROVIDER_STREAM_FAILED');
  if(!record(parsed)||!Array.isArray(parsed.choices)||parsed.choices.length>1)return fail('SCENE_INVALID_STREAM');
  if(!parsed.choices.length)return; // Standard final usage frame contains no delta.
  const choice=parsed.choices[0];
  if(!record(choice)||choice.index!==0||!record(choice.delta))return fail('SCENE_INVALID_STREAM');
  const delta=choice.delta.content;
  if(delta!==undefined&&delta!==null&&typeof delta!=='string')return fail('SCENE_INVALID_STREAM');
  if(finished&&(typeof delta==='string'&&delta.length||choice.finish_reason!==null&&choice.finish_reason!==undefined))
   return fail('SCENE_INVALID_STREAM');
  if(typeof delta==='string')appendContent(delta);
  if(choice.finish_reason!==null&&choice.finish_reason!==undefined){
   if(choice.finish_reason!=='stop')return fail('SCENE_INCOMPLETE_RESPONSE');finished=true;
  }
 };
 const dispatch=()=>{if(pendingData.length)consume(pendingData.join('\n'));pendingData=[];event='';eventBytes=0;};
 /** @param {string} line */
 const consumeLine=line=>{
  if(!line){dispatch();return;}
  eventBytes+=Buffer.byteLength(line,'utf8')+1;
  if(eventBytes>limits.eventBytes)return fail('SCENE_EVENT_TOO_LARGE');
  if(line.startsWith(':'))return;
  const colon=line.indexOf(':'),field=colon<0?line:line.slice(0,colon);
  let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
  if(field==='data')pendingData.push(value);else if(field==='event')event=value;
 };
 try{
  for(;;){
   const chunk=await awaitSceneResponse(reader.read(),signal);if(chunk.done){fullyRead=true;break;}
   total+=chunk.value.byteLength;if(total>limits.wireBytes)return fail('SCENE_RESPONSE_TOO_LARGE');
   try{buffer+=decoder.decode(chunk.value,{stream:true});}catch{return fail('SCENE_INVALID_ENVELOPE_JSON');}
   if(sse){
    let position;
    while((position=buffer.search(/[\r\n]/u))>=0){
     if(buffer[position]==='\r'&&position===buffer.length-1)break;
     const raw=buffer.slice(0,position),separator=buffer[position]==='\r'&&buffer[position+1]==='\n'?2:1;
     buffer=buffer.slice(position+separator);consumeLine(raw);
    }
    if(eventBytes+Buffer.byteLength(buffer,'utf8')>limits.eventBytes)return fail('SCENE_EVENT_TOO_LARGE');
   }
  }
  try{buffer+=decoder.decode();}catch{return fail('SCENE_INVALID_ENVELOPE_JSON');}
  if(sse){
   if(buffer)consumeLine(buffer.endsWith('\r')?buffer.slice(0,-1):buffer);dispatch();
   if(!done||!finished||!content.length)return fail('SCENE_INCOMPLETE_RESPONSE');return content;
  }
  /** @type {unknown} */let parsed;
  try{parsed=JSON.parse(buffer);}catch{return fail('SCENE_INVALID_ENVELOPE_JSON');}
  const text=completeContent(parsed);
  if(Buffer.byteLength(text,'utf8')>limits.contentBytes)return fail('SCENE_CONTENT_TOO_LARGE');
  return text;
 }finally{if(!fullyRead)reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={readSceneResponseContent,sceneResponseFailureCode,awaitSceneResponse};
