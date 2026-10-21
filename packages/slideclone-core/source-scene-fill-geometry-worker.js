// @ts-check
"use strict";
const {parentPort,threadId}=require('node:worker_threads');
const {fitSceneFillGeometry}=require('./source-scene-fill-geometry');
if(!parentPort)throw new Error('Scene geometry worker requires a message port');
const port=parentPort;
port.on('message',(/** @type {unknown} */message)=>{
 try{
  if(!message||typeof message!=='object'||!('index' in message)||!('input' in message)
   ||typeof message.index!=='number'||!Number.isSafeInteger(message.index)||message.index<0||message.index>=32)
   throw new TypeError('Invalid geometry task');
  const startedAt=performance.timeOrigin+performance.now(),geometry=fitSceneFillGeometry(message.input);
  port.postMessage({ok:true,index:message.index,geometry,threadId,startedAt,finishedAt:performance.timeOrigin+performance.now()});
 }catch{port.postMessage({ok:false});}
});
