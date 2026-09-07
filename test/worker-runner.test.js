"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createWorkerRunner}=require("../packages/team-runtime/worker-runner");
const Runner=createWorkerRunner(new Set(["project-audit"]));
test("queue runner validates delivery and acknowledges only after processing",async()=>{
  for(const message of [null,{}, {id:"",capability:"project-audit"},{id:"job",capability:"other"}]) {
    let processed=0,acked=0;
    const runner=new Runner({queue:{reserve:async()=>message,ack:async()=>{acked++;}},worker:{process:async()=>{processed++;}},workerId:"w",capability:"project-audit"});
    if(message===null)assert.equal(await runner.processOne(),null);else await assert.rejects(runner.processOne());
    assert.equal(processed,0);assert.equal(acked,0);
  }
  const message={id:"job",capability:"project-audit",receipt:"queue-receipt"},calls=[];
  const runner=new Runner({queue:{reserve:async()=>message,ack:async value=>{assert.equal(value,message);calls.push("ack");}},worker:{process:async value=>{assert.equal(value,message);calls.push("process");return "done";}},workerId:"w",capability:"project-audit",pollSeconds:60});
  assert.equal(await runner.processOne(),"done");assert.deepEqual(calls,["process","ack"]);
});
test("queue runner preserves processing and acknowledgement failures",async()=>{
  for(const stage of ["reserve","process","ack"]) {
    const calls=[];const fail=async name=>{calls.push(name);if(name===stage)throw new Error("failure");};
    const runner=new Runner({queue:{reserve:async()=>{await fail("reserve");return {id:"job",capability:"project-audit"};},ack:async()=>fail("ack")},worker:{process:async()=>fail("process")},workerId:"w",capability:"project-audit"});
    await assert.rejects(runner.processOne(),/failure/);
    assert.deepEqual(calls,["reserve","process","ack"].slice(0,["reserve","process","ack"].indexOf(stage)+1));
  }
});
