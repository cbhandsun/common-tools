"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {encodeNativeFreeformPath:encode,decodeNativeFreeformPath:decode,readNativeFreeformSegments:read,compactNativeFreeformPaths:compact}=require("../packages/slideclone-core/native-freeform-path");
const {isClosedNativeFreeformSurface:closed}=require("../packages/slideclone-core/native-freeform-path");
const {freeformResidualMasks}=require("../packages/slideclone-core/residual-freeform-mask");
const {validateDeckIrTree}=require("../packages/slideclone-core/deck-ir-tree");
const path=[{type:"moveTo",points:[{x:0,y:0}]},{type:"lnTo",points:[{x:1,y:0}]},
 {type:"cubicBezTo",points:[{x:1,y:.5},{x:1,y:1},{x:.5,y:1}]},{type:"lnTo",points:[{x:0,y:1}]},{type:"close",points:[]}];
function fixture(segments=path){return {pages:[{shapes:[{id:"node",type:"freeform",box:{x:0,y:0,w:100,h:100},
 style:{fill:"#123456",stroke:"none",freeformSegments:structuredClone(segments)},source:{editable:true,sourcePerimeterSupport:1}}]}]};}
test("native command transport preserves every double, curve control, command and winding",()=>{
 const precise=[...path,{type:"moveTo",points:[{x:Number.MIN_VALUE,y:1/3}]},{type:"quadBezTo",points:[{x:.9,y:.8},{x:.7,y:.6}]}];
 assert.deepEqual(decode(encode(precise)),precise);assert.notEqual(encode(precise),encode(path));
 assert.deepEqual(decode("[[0.0,0,0],[4e0]]"),[{type:"moveTo",points:[{x:0,y:0}]},{type:"close",points:[]}]);
 const f=fixture(),before=structuredClone(f),style=f.pages[0].shapes[0].style;
 assert.equal(compact(f),f);assert.deepEqual(read(style),before.pages[0].shapes[0].style.freeformSegments);
 assert.equal(style.freeformSegments,undefined);assert.deepEqual(f.pages[0].shapes[0].source,before.pages[0].shapes[0].source);
 const once=JSON.stringify(f);compact(f);assert.equal(JSON.stringify(f),once);
});
test("compact and expanded curves erase exactly the same original source cells",()=>{
 const expanded=fixture().pages[0].shapes[0],encoded=fixture();compact(encoded);
 assert.deepEqual(freeformResidualMasks(encoded.pages[0].shapes[0],{width:200,height:200},{w:100,h:100}),
  freeformResidualMasks(expanded,{width:200,height:200},{w:100,h:100}));
});
test("transport does not truncate over-limit paths, controls, point ranges or ambiguous geometry",()=>{
 const invalid=[null,"","[]","{}","[[0,0,0],[9]]","[[1,0,0]]","[[0,0]]","[[0,0,0],[2,0,0]]",
  "[[0,0,0],[1,-0.01,1]]","[[0,0,0],[1,1e400,1]]","[[0,0,0],[1,0,0,0]]","["+"[0,0,0],".repeat(120)+"[4]]","x".repeat(32769)];
 for(const value of invalid)assert.throws(()=>decode(value),TypeError);
 assert.throws(()=>read({freeformPath:encode(path),freeformSegments:path}),/ambiguous/);
 assert.throws(()=>encode([]),TypeError);assert.throws(()=>encode(new Array(1)),TypeError);
 assert.throws(()=>encode([...path,...Array(120).fill(path[0])]),TypeError);
});
test("hostile inputs and immutable styles fail before any compaction and without exposing content",()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,"type",{get(){calls++;throw Error("private-token");}});
 const f=fixture(),first=f.pages[0].shapes[0].style;f.pages[0].shapes.push({type:"freeform",style:Object.freeze({freeformSegments:path})});
 assert.throws(()=>compact(f),/immutable/);assert.ok(first.freeformSegments);assert.equal(first.freeformPath,undefined);
 for(const descriptor of [{value:undefined,writable:false,enumerable:true},{value:undefined,writable:true,enumerable:false}]){
  const blocked=fixture(),style=blocked.pages[0].shapes[0].style;Object.defineProperty(style,"freeformPath",descriptor);
  assert.throws(()=>compact(blocked),/immutable/);assert.deepEqual(style.freeformSegments,path);assert.equal(style.freeformPath,undefined);
 }
 for(const v of [null,new Proxy(path,{}),[hostile],[{type:"moveTo",points:new Array(1)}],
  [{type:"moveTo",points:[new Proxy({x:0,y:0},{})]}]])assert.throws(()=>encode(v),e=>e instanceof TypeError&&!e.message.includes("private-token"));
 assert.throws(()=>compact(new Proxy({pages:[]},{})),TypeError);assert.throws(()=>compact({pages:new Array(1)}),TypeError);
 assert.equal(calls,0);assert.deepEqual(compact({pages:[]}),{pages:[]});
});
test("the original deck structure node ceiling is unchanged and command streams retain their own original cap",()=>{
 assert.throws(()=>validateDeckIrTree(Array(30000).fill(0)),/safe limits/);
 const f=fixture();compact(f);validateDeckIrTree(f);
 const count=v=>v&&typeof v==="object"?1+Object.values(v).reduce((n,x)=>n+count(x),0):1;
 assert.ok(count(f)<count(fixture()));
 const {includesSuite}=require("../scripts/test-suites");assert.ok(includesSuite(__filename,"unit"));
});

test("surface topology requires every compact or expanded subpath to be closed",()=>{
 for(const segments of [path,[...path,...path]]){
  assert.equal(closed({freeformSegments:segments}),true);
  assert.equal(closed({freeformPath:encode(segments)}),true);
 }
 for(const segments of [path.slice(0,-1),[...path,...path.slice(0,-1)],
  [path[0],path.at(-1)],[...path,{type:'lnTo',points:[{x:0,y:0}]}],
  [path[0],path[0],...path.slice(1)]]){
  assert.equal(closed({freeformSegments:segments}),false);
  assert.equal(closed({freeformPath:encode(segments)}),false);
 }
 assert.equal(closed({}),false);
});

test("surface topology rejects empty malformed oversized and conflicting geometry",()=>{
 for(const style of [null,{freeformPath:'[]'},{freeformPath:'private-token'},
  {freeformSegments:[]},{freeformSegments:Array(121).fill(path[0])},
  {freeformPath:'x'.repeat(32769)},{freeformPath:encode(path),freeformSegments:path},
  {freeformPath:'[[0,0,0],[1,1.1,0],[1,0,1],[4]]'}])
  assert.throws(()=>closed(style),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 const extreme=[{type:'moveTo',points:[{x:Number.MIN_VALUE,y:0}]},
  {type:'lnTo',points:[{x:1,y:0}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}];
 assert.equal(closed({freeformSegments:extreme}),true);
});

test("surface topology never invokes getters proxy traps or hostile source content",()=>{
 let calls=0;
 const style={};Object.defineProperty(style,'freeformPath',{enumerable:true,get(){calls++;throw Error('private-token');}});
 const segment={};Object.defineProperty(segment,'type',{enumerable:true,get(){calls++;throw Error('private-token');}});
 const proxy=new Proxy({freeformSegments:path},{get(){calls++;throw Error('private-token');}});
 for(const input of [style,proxy,{freeformSegments:[segment]},
  {freeformSegments:new Proxy(path,{get(){calls++;throw Error('private-token');}})}])
  assert.throws(()=>closed(input),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(calls,0);
});
