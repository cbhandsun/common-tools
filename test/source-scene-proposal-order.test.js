"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {orderSourceSceneProposals:order}=require("../packages/slideclone-core/source-scene-proposal-order");
test("text-covered wide backgrounds precede small units without changing source proposals or node ordering",()=>{
 const small={id:"badge",kind:"container",box:{x:0,y:0,w:20,h:20}},title={id:"title",kind:"container",box:{x:30,y:0,w:400,h:50}},
  node={id:"node",kind:"container",box:{x:0,y:70,w:300,h:50}},icon={id:"icon",kind:"icon",box:{x:0,y:0,w:10,h:10}};
 const proposals=[small,title,node,icon],masks=[title.box,node.box],relations=[{fromId:"node",toId:"badge"}],before=structuredClone({proposals,masks,relations});
 assert.deepEqual(order(proposals,masks,relations).map(item=>item.id),["title","icon","badge","node"]);
 assert.deepEqual({proposals,masks,relations},before);assert.equal(order(proposals,masks,relations)[0],title);
 assert.deepEqual(order(proposals,[],relations).map(item=>item.id),["icon","badge","node","title"]);
 assert.deepEqual(order([],[],[]),[]);
});
test("equal priority is stable and existing collection ceilings remain unchanged",()=>{
 const proposals=Array.from({length:88},(_,index)=>({id:String(index),kind:"unknown",box:{x:0,y:0,w:1,h:1}}));
 assert.deepEqual(order(proposals,Array(10000).fill({x:0,y:0,w:1,h:1}),Array(24).fill({fromId:"a",toId:"b"})),proposals);
 assert.throws(()=>order([...proposals,proposals[0]],[],[]),TypeError);
 assert.throws(()=>order([],Array(10001).fill({x:0,y:0,w:1,h:1}),[]),TypeError);
 assert.throws(()=>order([],[],Array(25).fill({fromId:"a",toId:"b"})),TypeError);
});
test("unknown controls reject accessors, proxies, sparse input and impossible source frames safely",()=>{
 let calls=0;const getter={get box(){calls++;throw Error("private-source");}},array=[];
 Object.defineProperty(array,"0",{get(){calls++;throw Error("private-source");}});array.length=1;
 const row={id:"title",kind:"container",box:{x:0,y:0,w:300,h:50}};
 for(const proposals of [null,new Proxy([],{}),new Array(1),array,[getter],[{...row,box:new Proxy(row.box,{})}],
  [{...row,box:{x:0,y:0,w:Infinity,h:50}}],[{...row,box:{x:0,y:0,w:20000,h:50}}]])
  assert.throws(()=>order(proposals,[],[]),error=>error instanceof TypeError&&!error.message.includes("private-source"));
 assert.throws(()=>order([row],[getter],[]),TypeError);assert.throws(()=>order([row],[],[new Proxy({},{})]),TypeError);
 assert.equal(calls,0);
});
