'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLiveOcrObserver}=require('../scripts/lib/live-ocr-observer');

test('each image and crop reaches live OCR even when dimensions repeat or the crop changes',async()=>{
 const seen=[],events=[];
 const recognize=async(...args)=>{seen.push(args);return {generation:seen.length};};
 const observe=createLiveOcrObserver({recognize,record:event=>events.push(event)});
 const page={widthPx:100,heightPx:100},context={config:{umiOcr:{cache:false}}};
 for(const sourceImage of ['source.png','crop-a.png','crop-b.png','crop-a.png']){
  const input={sourceImage,page};
  const result=await observe(input,context);
  assert.equal(seen.at(-1)[0],input);assert.equal(seen.at(-1)[1],context);
  assert.equal(result.generation,seen.length);
 }
 assert.deepEqual(events,[1,2,3,4].map(call=>({call,completed:true})));
});

test('OCR failures are spent, propagate unchanged, and never persist error or user content',async()=>{
 const events=[],failure=Error('private source and credential'),input={private:'user content'};
 let calls=0;
 const observe=createLiveOcrObserver({recognize:async value=>{
  assert.equal(value,input);calls++;if(calls===1)throw failure;return null;
 },record:event=>events.push(event)});
 await assert.rejects(observe(input),error=>error===failure);
 assert.equal(await observe(input),null);
 assert.deepEqual(events,[{call:1,completed:false},{call:2,completed:true}]);
 assert.doesNotMatch(JSON.stringify(events),/private|credential|user content/);
});

test('concurrent calls retain their assigned identities and no recording error is swallowed',async()=>{
 const events=[];let finishFirst;
 const observe=createLiveOcrObserver({recognize:async value=>value===1?new Promise(resolve=>{finishFirst=resolve;}):value,
  record:event=>events.push(event)});
 const first=observe(1);assert.equal(await observe(2),2);finishFirst(1);assert.equal(await first,1);
 assert.deepEqual(events,[{call:2,completed:true},{call:1,completed:true}]);
 const failure=Error('evidence storage failed');
 const broken=createLiveOcrObserver({recognize:async()=>null,record:()=>{throw failure;}});
 await assert.rejects(broken(),error=>error===failure);
});

test('invalid observer dependencies fail before any recognition',()=>{
 for(const value of [undefined,null,0,'function',{},[]]){
  assert.throws(()=>createLiveOcrObserver({recognize:value,record:()=>{}}),/dependencies/);
  assert.throws(()=>createLiveOcrObserver({recognize:async()=>null,record:value}),/dependencies/);
 }
});
