"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSourceOutlineColor}=require("../packages/slideclone-core/source-outline-color");
function fixture(){return {width:10,points:[{x:1,y:1},{x:2,y:1},{x:3,y:1}],colors:new Map([[11,[20,40,60]],[12,[20,40,60]],[13,[180,200,220]]])};}
test("cached source winding color uses the observed per-channel median including extreme channels",()=>{
 assert.equal(measureSourceOutlineColor(fixture()),"#14283c");
 assert.equal(measureSourceOutlineColor({width:1,points:[{x:0,y:0}],colors:new Map([[0,[0,255,128]]])}),"#00ff80");
});
test("missing, empty, invalid, extreme and incomplete color evidence fails closed",()=>{
 const changes=[v=>v.points=[],v=>v.points=Array(262145).fill({x:1,y:1}),v=>v.width=0,v=>v.width=Infinity,
  v=>v.points[0].x=10,v=>v.points[0].y=16384,v=>v.points[0].x=NaN,v=>v.colors.delete(11),
  v=>v.colors.set(11,[1,2]),v=>v.colors.set(11,[1,-1,2]),v=>v.colors.set(11,[1,256,2]),v=>v.colors.set(11,[1,NaN,2])];
 for(const change of changes){const value=fixture();change(value);assert.throws(()=>measureSourceOutlineColor(value),TypeError);}
 for(const value of [undefined,null,[],{},new Map()])assert.throws(()=>measureSourceOutlineColor(value),TypeError);
});
test("provider accessors, proxies and map method overrides cannot read user data",()=>{
 let reads=0;const hostile={get points(){reads++;throw Error("private-token");}};
 const nested=fixture();Object.defineProperty(nested.points[0],"x",{get(){reads++;throw Error("private-token");}});
 const color=fixture();color.colors.set(11,new Proxy([1,2,3],{get(){reads++;throw Error("private-token");}}));
 const map=fixture();map.colors.get=()=>{reads++;throw Error("private-token");};assert.equal(measureSourceOutlineColor(map),"#14283c");
 for(const value of [hostile,new Proxy(fixture(),{}),nested,color,{...fixture(),colors:new Proxy(new Map(),{})}])
  assert.throws(()=>measureSourceOutlineColor(value),error=>error instanceof TypeError&&!error.message.includes("private-token"));
 assert.equal(reads,0);
});
