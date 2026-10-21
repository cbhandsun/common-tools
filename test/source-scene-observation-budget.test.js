'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneObservationBudget:create}=require('../packages/slideclone-core/source-scene-observation-budget');
const request=task=>({task,prompt:'',images:[],isCancellationRequested:async()=>false});
test('explicit batch authorization grants exactly two observations per batch with one shared global call',async()=>{
 let calls=0;const observe=create(async()=>{calls++;return {};},2);
 await observe(request('structure'));
 for(let batch=0;batch<2;batch++)await Promise.all([observe(request('classify-ocr')),observe(request('classify-ocr'))]);
 await assert.rejects(observe(request('classify-ocr')),RangeError);assert.equal(calls,5);
 for(const maximum of [null,'2',0,-1,1.5,17,Infinity,NaN])assert.throws(()=>create(async()=>{},maximum),TypeError);
});
test('one global and concurrent independent local views share a hard job call budget',async()=>{
 let calls=0;const observe=create(async value=>{calls++;return value.task;});
 await assert.rejects(observe(request('classify-ocr')),RangeError);assert.equal(calls,0);
 assert.equal(await observe(request('structure')),'structure');
 assert.deepEqual(await Promise.all([observe(request('classify-ocr')),observe(request('classify-ocr'))]),['classify-ocr','classify-ocr']);
 await assert.rejects(observe(request('classify-ocr')),RangeError);await assert.rejects(observe(request('structure')),RangeError);
 assert.equal(calls,3);
});
test('failed calls are charged before dispatch and pending global calls grant no local wave',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});let calls=0;
 const observe=create(async value=>{calls++;if(value.task==='structure'){await gate;return {}; }throw Error('bounded failure');});
 const pending=observe(request('structure'));
 await assert.rejects(observe(request('structure')),RangeError);await assert.rejects(observe(request('classify-ocr')),RangeError);
 release();await pending;
 const outcomes=await Promise.allSettled([observe(request('classify-ocr')),observe(request('classify-ocr')),observe(request('classify-ocr'))]);
 assert.ok(outcomes.every(r=>r.status==='rejected'));assert.equal(calls,3);
 const failed=create(async()=>{throw Error('global failure');});
 await assert.rejects(failed(request('structure')));await assert.rejects(failed(request('structure')),RangeError);
 await assert.rejects(failed(request('classify-ocr')),RangeError);
});
test('invalid tasks and hostile requests cannot dispatch or execute getters; budgets remain job-local',async()=>{
 let calls=0;const observe=create(async()=>{calls++;return {};});let getters=0;
 const hostile={get task(){getters++;throw Error('private');}};
 for(const value of [null,{},hostile,new Proxy(request('structure'),{}),request('other')])await assert.rejects(observe(value),TypeError);
 assert.equal(getters,0);assert.equal(calls,0);assert.throws(()=>create(null),TypeError);
 await observe(request('structure'));const second=create(async()=>{calls++;return {};});await second(request('structure'));assert.equal(calls,2);
 assert.equal(require('../scripts/test-suites').classifyTestFile(__filename),'unit');
});
