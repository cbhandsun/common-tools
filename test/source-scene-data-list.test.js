'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {list}=require('../packages/slideclone-core/scene-plan/source-scene-group-containment');
const {sharedOutputList}=require('../packages/slideclone-core/routing/source-shared-route-output-snapshot');
const {roundedSourceRoute}=require('../packages/slideclone-core/routing/source-route-corner-mode');

test('scene data lists retain empty, dense, frozen and nonenumerable data arrays',()=>{
 const hidden=[];Object.defineProperty(hidden,'0',{value:undefined});
 for(const value of [[],[0,null,undefined],Object.freeze([{x:1}]),hidden]){
  assert.equal(list(value),true);assert.equal(sharedOutputList(value,{checks:0}),true);
 }
});

test('scene data lists reject holes padded with own methods, names or symbols',()=>{
 for(const key of ['every','map','slice','01','4294967295',Symbol.iterator,Symbol('field')]){
  const value=Array(1);Object.defineProperty(value,key,{value:()=>{throw Error('input code executed');}});
  assert.equal(list(value),false,String(key));
  assert.equal(sharedOutputList(value,{checks:0}),false,String(key));
 }
 for(const value of [Array(3),[1,,3],Array(4294967295),null,{},'[]',new Uint8Array(2)])assert.equal(list(value),false);
});

test('scene data lists reject accessors and proxies without executing input code',()=>{
 let calls=0;const hostile=()=>{calls++;throw Error('private-content');};
 const getter=[1];Object.defineProperty(getter,'0',{get:hostile});
 const symbol=Array(1);Object.defineProperty(symbol,Symbol.iterator,{get:hostile});
 const proxy=new Proxy([],{get:hostile,ownKeys:hostile,getPrototypeOf:hostile});
 const revoked=Proxy.revocable([],{});revoked.revoke();
 const inherited=Object.setPrototypeOf([1],Object.create(Array.prototype));
 for(const value of [getter,symbol,proxy,revoked.proxy,inherited]){
  assert.equal(list(value),false);assert.equal(sharedOutputList(value,{checks:0}),false);
 }
 assert.equal(calls,0);
});

test('rounded route rejects sparse method padding before calling array operations',()=>{
 let calls=0;const measured=Array(2);
 measured.every=()=>{calls++;return true;};measured.map=()=>{calls++;return [];};
 assert.throws(()=>roundedSourceRoute({measured,route:[{x:0,y:0},{x:5,y:0}],sx:1,sy:1}),/^TypeError: Rounded route geometry is invalid$/);
 assert.equal(calls,0);
});

test('scene data list boundary regressions are discovered by the unified unit suite',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/source-scene-data-list.test.js'));
});
