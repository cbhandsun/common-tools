"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {runCandidatePair}=require('../packages/slideclone-worker-adapter/candidate-pair-executor');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
test('candidate pair overlaps independent work and returns the original order',async()=>{
 let release;const first=new Promise(resolve=>{release=resolve;});const completed=[];
 const result=await runCandidatePair([
  async()=>{await first;completed.push(0);return 'first';},
  async()=>{completed.push(1);release();return 'second';}
 ],()=>false);
 assert.deepEqual(completed,[1,0]);assert.deepEqual(result,['first','second']);
});
test('candidate pair joins the live sibling on failure and propagates cancellation',async()=>{
 let started,release;const ready=new Promise(resolve=>{started=resolve;}),finished=new Promise(resolve=>{release=resolve;});
 let joined=false,settled=false;
 const promise=runCandidatePair([
  async()=>{await ready;throw new Error('controlled build failure');},
  async cancelled=>{started();await finished;assert.equal(await cancelled(),true);joined=true;return 2;}
 ],()=>false);
 const rejected=assert.rejects(promise,/controlled build failure/).then(()=>{settled=true;});
 await pause();assert.equal(settled,false);release();await rejected;assert.equal(joined,true);
});
test('candidate pair uses the original cancellation predicate without renewing its deadline',async()=>{
 let expired=false,started=0;
 await assert.rejects(runCandidatePair([async cancelled=>{started++;expired=true;assert.equal(await cancelled(),true);return 1;}],()=>expired),/cancelled/);
 assert.equal(started,1);
 await assert.rejects(runCandidatePair([async()=>{started++;}],()=>true),/cancelled/);
 assert.equal(started,1);
});
test('candidate pair rejects hostile and excessive input without evaluating getters',async()=>{
 let touched=false;const accessor=[];Object.defineProperty(accessor,0,{get(){touched=true;return ()=>{};}});
 for(const value of [null,{},[null],Array(2),[async()=>1,async()=>2,async()=>3],accessor,new Proxy([],{get(){touched=true;throw Error('content');}})])
  await assert.rejects(runCandidatePair(value,()=>false),/invalid/);
 assert.equal(touched,false);assert.deepEqual(await runCandidatePair([],()=>false),[]);
 await assert.rejects(runCandidatePair([],null),/invalid/);
});
test('candidate pair snapshots tasks before asynchronous cancellation checks',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const tasks=[async()=>1,async()=>2];
 const pending=runCandidatePair(tasks,async()=>{await gate;return false;});tasks[1]=async()=>99;release();
 assert.deepEqual(await pending,[1,2]);
});
test('candidate pair joins and fails closed on cancellation-provider rejection or nonboolean result',async()=>{
 await assert.rejects(runCandidatePair([async()=>1,async()=>2],()=>{throw new Error('provider unavailable');}),/provider unavailable/);
 await assert.rejects(runCandidatePair([async()=>1],()=>undefined),/cancelled/);
});
