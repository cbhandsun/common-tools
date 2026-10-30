"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createReconstructionSearchControl}=require("../packages/slideclone-core/archetypes/reconstruction-search-control");
const H=n=>n.toString(16).padStart(64,"0"),M=(pdr=.15)=>({pdr,missing:.08,mad:15,layout:0,style:0});
function create(overrides={}){return createReconstructionSearchControl({baseline:M(),baselineHash:H(0),families:["text","graphics"],...overrides});}
function trial(c,n,m=M(),hardFailures=0,strictPassed=false){assert.equal(c.prepare({hash:H(n),family:"text"}).render,true);return c.complete({hash:H(n),metrics:m,hardFailures,strictPassed});}
test("patience switches candidate family; exhausted search is not success",()=>{
 const c=create({patience:2});trial(c,1);assert.equal(trial(c,2).action,"switch-family");
 assert.equal(c.prepare({hash:H(3),family:"text"}).render,false);assert.equal(c.finishFamily("graphics").action,"stop-stalled");
 assert.equal(c.snapshot().publicationPassed,false);assert.equal(c.snapshot().frontier[0].hash,H(0));
});
test("duplicate outputs never render or reset patience; cumulative gains use last meaningful anchor",()=>{
 const c=create({patience:4});trial(c,1,M(.1496));assert.equal(c.prepare({hash:H(1),family:"graphics"}).reason,"duplicate-output");
 trial(c,2,M(.1492));trial(c,3,M(.1488));assert.equal(c.snapshot().events[2].improvement,true);
 assert.equal(c.snapshot().families[0].stale,0);
});
test("Pareto candidates are retained, dominated candidates and hard failures cannot win",()=>{
 const c=create();trial(c,1,{...M(.14),mad:16});trial(c,2,M(.16));trial(c,3,M(.13),1);
 assert.deepEqual(c.snapshot().frontier.map(v=>v.hash),[H(0),H(1)]);
});
test("strict stop requires all visual and layout/hard checks, not just PDR eight percent",()=>{
 for(const m of [M(.07),{...M(.07),mad:11,layout:1},{...M(.07),mad:11,missing:.13}]){
  const c=create();c.prepare({hash:H(1),family:"text"});assert.throws(()=>c.complete({hash:H(1),metrics:m,hardFailures:0,strictPassed:true}));
 }
 const c=create();assert.equal(trial(c,1,{...M(.07),mad:11},0,true).action,"stop-passed");
});
test("verified influence bounds switch scope; budget, missing values and malicious boundaries are enforced",()=>{
 const c=create({maximumCandidates:1});assert.throws(()=>c.prepare({hash:H(1),family:"text",maximumPdrGain:.01}));
 assert.equal(c.prepare({hash:H(1),family:"text",maximumPdrGain:.01,influenceBoundVerified:true}).reason,"insufficient-region-coverage");
 const bounded=create({maximumCandidates:1});trial(bounded,1);assert.equal(bounded.prepare({hash:H(2),family:"graphics"}).action,"stop-budget");
 for(const settings of [{patience:0},{patience:1.5},{families:[]},{baseline:{...M(),pdr:NaN}},{hardFailures:.5}])assert.throws(()=>create(settings));
 assert.throws(()=>create().complete({hash:H(1),metrics:M(),hardFailures:0,strictPassed:false}));
});
