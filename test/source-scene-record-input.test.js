'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {record}=require('../packages/slideclone-core/scene-plan/source-scene-group-containment');

test('source records admit plain and null-prototype data, including hidden and symbol data',()=>{
 const symbol=Symbol('data');
 for(const value of [{},Object.create(null),{[symbol]:null},Object.freeze({value:0})])assert.equal(record(value),true);
 const hidden={};Object.defineProperty(hidden,'data',{value:undefined});assert.equal(record(hidden),true);
});

test('source records reject all accessors without executing them',()=>{
 let calls=0;
 const accessor=()=>{calls++;throw Error('private-content');};
 for(const key of ['data',Symbol('data')])for(const enumerable of [true,false])for(const descriptor of [
  {get:accessor},{set:accessor},{get:accessor,set:accessor}]){
  const value={};Object.defineProperty(value,key,{...descriptor,enumerable});
  assert.equal(record(value),false);
 }
 assert.equal(calls,0);
});

test('source records reject invalid prototypes and proxies without any provider trap',()=>{
 let calls=0;
 const trap=()=>{calls++;throw Error('private-content');};
 const revoked=Proxy.revocable({},{});revoked.revoke();
 for(const value of [undefined,null,false,1,'',[],()=>{},new Date(),Object.create({}),revoked.proxy,
  new Proxy({},{get:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap})])assert.equal(record(value),false);
 assert.equal(calls,0);
});
