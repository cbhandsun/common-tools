"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {withSceneCompilationSession:open}=require('../packages/slideclone-core/source-scene-compilation-session');
const {readSceneFillRaster:read}=require('../packages/slideclone-core/source-scene-fill-raster-cache');
function fixture(){return {image:{width:130,height:130,rgba:Buffer.alloc(130*130*4,255)},sourceHash:'a'.repeat(64)};}
test('preflight and final geometry re-read one private source snapshot under the same 4M counter',()=>{
 const f=fixture(),first=open(f,s=>{read(s.image,{x:60,y:60,w:10,h:10},s.budget);return s.budget.used;});
 assert.equal(first.result,100);assert.equal(JSON.stringify(first.session),'{}');
 const second=open({...f,session:first.session},s=>{const crop=read(s.image,{x:63,y:63,w:12,h:12},s.budget);
  assert.equal(crop.rgba[0],255);return s.budget.used;});
 assert.equal(second.result,195);assert.equal(first.session,second.session);
 const newSource=open(f,s=>{read(s.image,{x:60,y:60,w:10,h:10},s.budget);return s.budget.used;});assert.equal(newSource.result,100);
});
test('empty compiles, failed probes and exhausted reads keep the session bounded and restore ambient scope',()=>{
 const f=fixture(),opened=open(f,s=>s.budget.used);assert.equal(opened.result,0);
 assert.throws(()=>open({...f,session:opened.session},s=>{read(s.image,{x:0,y:0,w:1,h:1},s.budget);throw Error('probe failed');}),/probe failed/);
 assert.equal(open({...f,session:opened.session},s=>s.budget.used).result,1);
 open({...f,session:opened.session},s=>{s.budget.used=4000000;assert.throws(()=>read(s.image,{x:1,y:1,w:1,h:1},s.budget),RangeError);
  assert.equal(s.budget.used,4000000);read(s.image,{x:0,y:0,w:1,h:1},s.budget);});
 const fresh={used:0};read(f.image,{x:0,y:0,w:1,h:1},fresh);assert.equal(fresh.used,1);
});
test('copied, proxy, cross-source and malformed capabilities cannot reuse private measured pixels',()=>{
 const f=fixture(),opened=open(f,()=>null);let calls=0;
 const getter={};Object.defineProperty(getter,'image',{get(){calls++;throw Error('private');}});
 for(const input of [null,{},getter,new Proxy(f,{}),{...f,session:{}},{...f,session:structuredClone(opened.session)},
  {...f,session:new Proxy(opened.session,{})},{...f,session:opened.session,sourceHash:'b'.repeat(64)},
  {...f,session:opened.session,image:{...f.image,width:65,height:260}},
  {...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(130*130*4))}},
  {...f,image:{...f.image,width:Infinity}},{...f,sourceHash:'unsafe'},{...f,sourceHash:'a'.repeat(65)}])assert.throws(()=>open(input,()=>null),TypeError);
 assert.equal(calls,0);
});
