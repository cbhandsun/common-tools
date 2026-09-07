"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createWorkerJob,createWorkerHandlerContext}=require("../packages/team-runtime/worker-context");
const fixture=()=>({id:"job",capability:"image-to-editable",outputPrefix:"owners/a/jobs/job/",attempt:1,options:{}});
test("Worker accepts repository trace metadata without exposing it in serialized jobs",()=>{
  const {withTraceParent}=require("../packages/team-runtime/job-input");
  for(const trace of [undefined,"00-11111111111111111111111111111111-2222222222222222-01"]){
    const job=createWorkerJob(withTraceParent(fixture(),trace));
    assert.equal(job.traceParent,trace);
    assert.equal(Object.getOwnPropertyDescriptor(job,"traceParent").enumerable,false);
    assert.equal(JSON.stringify(job).includes("traceParent"),false);
  }
  for(const key of ["traceParent","hidden"]){
    let calls=0;const input=fixture();
    Object.defineProperty(input,key,{get(){calls++;throw Error("private-sentinel");}});
    assert.throws(()=>createWorkerJob(input),/data properties/u);assert.equal(calls,0);
  }
  const hidden=fixture();Object.defineProperty(hidden,"hidden",{value:1});
  assert.throws(()=>createWorkerJob(hidden),/data properties/u);
  const invalid=fixture();Object.defineProperty(invalid,"traceParent",{value:"invalid"});
  assert.throws(()=>createWorkerJob(invalid),/traceParent/u);
});
test("Worker attempt context preserves fields and isolates attempt output",async()=>{
  const input=fixture(),before=structuredClone(input),job=createWorkerJob(input),context=createWorkerHandlerContext(job,async()=>false);
  assert.equal(job.outputPrefix,"owners/a/jobs/job/attempts/1/");assert.equal(context.job,job);
  assert.equal(await context.isCancellationRequested(),false);assert.deepEqual(input,before);
  assert.ok(Object.isFrozen(job));assert.ok(Object.isFrozen(context));
  assert.equal(createWorkerJob({...fixture(),id:" historical-id "}).id," historical-id ");
  const failure=createWorkerHandlerContext(job,async()=>{throw new Error("repository unavailable");});
  await assert.rejects(failure.isCancellationRequested(),/repository unavailable/u);
});
test("Worker claimed Job boundary rejects malformed fields without invoking accessors",()=>{
  for(const value of [null,[],{}, {...fixture(),attempt:0},{...fixture(),attempt:2147483648},{...fixture(),outputPrefix:"../"},{...fixture(),traceParent:"invalid"},{...fixture(),id:""}])assert.throws(()=>createWorkerJob(value));
  assert.equal(createWorkerJob({...fixture(),attempt:2147483647}).attempt,2147483647);
  let calls=0;const input=fixture();Object.defineProperty(input,"options",{enumerable:true,get(){calls++;throw new Error("private-sentinel");}});
  assert.throws(()=>createWorkerJob(input),/data properties/u);assert.equal(calls,0);
  const proxy=new Proxy(fixture(),{ownKeys(){calls++;return [];}});assert.throws(()=>createWorkerJob(proxy),/invalid/u);assert.equal(calls,0);
});
