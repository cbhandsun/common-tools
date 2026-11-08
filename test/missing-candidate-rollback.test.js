"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {rollbackRegressedMissingAdditions:rollback}=require("../packages/slideclone-worker-adapter/missing-candidate-rollback");
const region=(x,severity)=>({pageIndex:0,id:`missing-${x}`,kind:"missing",role:"missing-native-component",
  box:{x,y:20,w:20,h:20},severity,source:{detector:"missing-native-component-quality"}});
function fixture(){
  const original={id:"original",type:"rect",box:{x:150,y:10,w:10,h:10}};
  const added=(id,x)=>({id,type:"freeform",box:{x,y:20,w:20,h:20},source:{detector:"missing-native-blob-freeform-component",sourceMissingNativeComponentIds:[`missing-${x}`]}});
  const baselineDeck={pages:[{textBoxes:[],images:[],shapes:[original]}]};
  const candidateDeck={pages:[{textBoxes:[],images:[],shapes:[structuredClone(original),added("good",20),added("bad",80)]}]};
  return {baselineDeck,candidateDeck,baselineQuality:{componentWorst:[region(20,8),region(80,4)]},
    candidateQuality:{componentReferenceMetrics:[region(80,6),region(20,2)]}};
}
test("rollback removes only regressed additive groups while retaining independently improved source geometry",()=>{
  const f=fixture(),before=structuredClone(f),v=rollback(f);
  assert.deepEqual(v.deck.pages[0].shapes.map(s=>s.id),["original","good"]);
  assert.equal(v.rolledBackShapes,1);assert.equal(v.retainedShapes,1);
  assert.deepEqual(f,before);assert.equal(v.passed,undefined);
});
test("all changes can be rejected and exact existing objects and non-shape collections are preserved",()=>{
  const f=fixture();f.candidateQuality.componentReferenceMetrics=[region(20,9),region(80,6)];
  assert.deepEqual(rollback(f).deck,f.baselineDeck);
  const empty=fixture();empty.candidateDeck=structuredClone(empty.baselineDeck);
  assert.equal(rollback(empty).retainedShapes,0);
});
test("coupled and overlapping additions roll back together and do not leave partial icons",()=>{
  const f=fixture();
  f.candidateDeck.pages[0].shapes.push({id:"coupled",type:"freeform",box:{x:40,y:20,w:50,h:20},
    source:{detector:"missing-native-blob-freeform-component",sourceMissingNativeComponentIds:["missing-20","missing-80"]}});
  assert.deepEqual(rollback(f).deck,f.baselineDeck);
});
test("measured single-target curve and primitive provenance remains valid rollback ownership",()=>{
  const f=fixture();
  for(const shape of f.candidateDeck.pages[0].shapes.slice(1)) {
    shape.source.missingNativeComponentId=shape.source.sourceMissingNativeComponentIds[0];
    delete shape.source.sourceMissingNativeComponentIds;
  }
  assert.deepEqual(rollback(f).deck.pages[0].shapes.map(s=>s.id),["original","good"]);
  f.candidateDeck.pages[0].shapes[1].source.missingNativeComponentId="stale";
  assert.throws(()=>rollback(f),/ownership/);
});
test("shared visual atom detector requires measured missing ownership and generated identity",()=>{
  const f=fixture();
  f.candidateDeck.pages[0].shapes[1].id="missing-native-visual-atom-1-1";
  f.candidateDeck.pages[0].shapes[1].source.detector="visual-atom-native-team";
  assert.equal(rollback(f).retainedShapes,1);
  f.candidateDeck.pages[0].shapes[1].id="unrelated-atom";
  assert.throws(()=>rollback(f),/Unowned/);
});
test("fixed geometry is required, per-render rank IDs never substitute for reference boxes",()=>{
  for(const mode of ["missing","duplicate","moved","unowned","mutated","deleted","non-shape"]){
    const f=fixture();
    if(mode==="missing")f.candidateQuality.componentReferenceMetrics.pop();
    if(mode==="duplicate")f.candidateQuality.componentReferenceMetrics=[region(20,2),region(20,2)];
    if(mode==="moved")f.candidateQuality.componentReferenceMetrics[0].box.x++;
    if(mode==="unowned")delete f.candidateDeck.pages[0].shapes[1].source.sourceMissingNativeComponentIds;
    if(mode==="mutated")f.candidateDeck.pages[0].shapes[0].box.x++;
    if(mode==="deleted")f.candidateDeck.pages[0].shapes.shift();
    if(mode==="non-shape")f.candidateDeck.pages[0].images.push({id:"extra"});
    assert.throws(()=>rollback(f),undefined,mode);
  }
});
test("unchanged local regression tolerance is 0.08 and invalid, extreme, hostile data fails without accessors",()=>{
  const f=fixture();f.candidateQuality.componentReferenceMetrics=[region(20,8.08),region(80,4.08)];
  assert.equal(rollback(f).rolledBackShapes,0);
  f.candidateQuality.componentReferenceMetrics[0].severity=8.081;
  assert.equal(rollback(f).rolledBackShapes,1);
  for(const value of [null,{},new Proxy(f,{}),{...f,candidateQuality:{componentReferenceMetrics:new Array(81).fill(region(20,2))}}])assert.throws(()=>rollback(value));
  let executed=false;
  const hostile=fixture();Object.defineProperty(hostile.candidateDeck.pages[0].shapes[1],"style",{enumerable:true,get(){executed=true;throw Error("private-content");}});
  assert.throws(()=>rollback(hostile));assert.equal(executed,false);
});
