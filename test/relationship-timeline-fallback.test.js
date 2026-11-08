"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createRelationshipNativeShell: shell } = require("../packages/slideclone-core/archetypes/relationship-native-shell");
const { looksLikeVisualTimelineRoadmap: timeline } = require("../packages/slideclone-core/archetypes/diagram-archetypes");
function fixture(scale = 1, offset = 0) {
  const box = value => ({x:value.x*scale+offset,y:value.y*scale+offset,w:value.w*scale,h:value.h*scale});
  const nodes = [0,1,2].map(index=>({id:`n${index}`,kind:"native-rect-candidate",box:box({x:40+180*index,y:80,w:80,h:48}),color:"#2468AC",nativeCandidate:true}));
  const lines = [0,1].map(index=>({id:`e${index}`,kind:"connector-line-candidate",box:box({x:120+180*index,y:104,w:100,h:1}),lineEndpoints:{from:{x:(120+180*index)*scale+offset,y:104*scale+offset},to:{x:(220+180*index)*scale+offset,y:104*scale+offset}},color:"#2468AC"}));
  return {image:{id:"arbitrary",box:box({x:0,y:0,w:540,h:260})},atoms:[...nodes,...lines],understanding:{archetype:"timeline-roadmap",confidence:0.92,visualConnectors:lines.map((line,index)=>({atomId:line.id,fromAtomId:`n${index}`,toAtomId:`n${index+1}`}))}};
}
test("stale timeline hints fall through only to complete measured generic geometry",()=>{
  for(const [scale,offset] of [[1,0],[2,30],[0.8,50]]) {
    const f=fixture(scale,offset), result=shell(f.image,f.atoms,{layerType:"diagram-zone"},f.understanding);
    assert.equal(result.fullyObjectified,true); assert.equal(result.shellKind,"measured-generic-graph");
    assert.equal(result.shapes.length,5); assert.equal(result.preserveWhole,undefined);
  }
});
test("missing, unmeasured, duplicate, disconnected and residual topology stays preserved",()=>{
  for(const kind of ["missing","unmeasured","duplicate","duplicate-id","misattached","self","unknown","residual","empty"]) {
    const f=fixture();
    if(kind==="missing") f.understanding.visualConnectors.pop();
    if(kind==="unmeasured") delete f.atoms[4].lineEndpoints;
    if(kind==="duplicate") f.understanding.visualConnectors[1]={...f.understanding.visualConnectors[0]};
    if(kind==="duplicate-id") f.atoms[1].id=f.atoms[0].id;
    if(kind==="misattached") f.atoms[4].lineEndpoints.to.y=180;
    if(kind==="self") f.understanding.visualConnectors[1].toAtomId="n1";
    if(kind==="unknown") f.understanding.visualConnectors[1].toAtomId="unknown";
    if(kind==="residual") f.atoms.push({id:"unexplained",kind:"complex",box:{x:0,y:0,w:40,h:40},residualCandidate:true});
    if(kind==="empty") f.atoms=[];
    const result=shell(f.image,f.atoms,{layerType:"diagram-zone"},f.understanding);
    assert.equal(result.preserveWhole,true,kind); assert.deepEqual(result.shapes,[],kind);
  }
});
test("aligned architecture cards and a long connector cannot masquerade as a timeline",()=>{
  const f=fixture(), nodes=f.atoms.slice(0,3).map(node=>({...node,center:{x:node.box.x+40,y:104}}));
  const axis={kind:"connector-line-candidate",box:{x:40,y:104,w:440,h:2}};
  assert.equal(timeline([axis],nodes,f.image.box,"arbitrary labels"),false);
  assert.equal(timeline([],nodes,f.image.box,"2024 2025 2026"),false);
  assert.equal(timeline([axis],nodes,f.image.box,"2024 2025 2026"),true);
});
