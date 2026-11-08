'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inventoryRevisionSnapshot:snapshot,immutableInventoryRevisionCopy:copy,inventoryRevisionFileBytes:readBytes}=require('../packages/slideclone-core/scene-plan/source-inventory-revision-snapshot');
const invalid=/^Scene inventory revision snapshot is invalid$/u,capacity=/^Scene inventory revision snapshot exceeds capacity$/u;
const unavailable=/^Scene inventory revision file is unavailable$/u;
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-revision-snapshot-'));
 t.after(()=>{
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  fs.rmSync(root,{recursive:true,force:true});
 });
 const file=path.join(root,'ordinary.bin'),bytes=Buffer.from([0,255,42,10,13,83]);fs.writeFileSync(file,bytes);
 return {root,file,bytes};
}
function rejects(value,pattern=invalid){assert.throws(()=>snapshot(value),{name:'TypeError',message:pattern});}
function withMock(t,method,implementation,action){
 const mocked=t.mock.method(fs,method,implementation);
 try{action();}finally{mocked.mock.restore();}
}
test('canonical data preserves primitive type, undefined presence, negative zero and array order',()=>{
 for(const value of [undefined,null,true,false,0,-0,1.25,'',[],{},[undefined]])assert.match(snapshot(value),/^[a-f0-9]{64}$/u);
 assert.equal(snapshot({b:[1,undefined],a:null}),snapshot({a:null,b:[1,undefined]}));
 assert.equal(snapshot(Object.assign(Object.create(null),{a:1})),snapshot({a:1}));
 for(const [a,b]of [[undefined,null],[{},[]],[{}, {a:undefined}],[0,-0],['1',1],[[1,2],[2,1]]])assert.notEqual(snapshot(a),snapshot(b));
 const child={value:true};assert.equal(snapshot([child,child]),snapshot([{value:true},{value:true}]));
});
test('immutable copies are independent, deeply frozen and retain undefined and negative zero',()=>{
 const original={a:[{value:-0},undefined],empty:{}};const cloned=copy(original);
 assert.notEqual(cloned,original);assert.notEqual(cloned.a,original.a);assert.equal(snapshot(cloned),snapshot(original));
 assert(Object.is(cloned.a[0].value,-0));assert.equal(cloned.a[1],undefined);
 for(const item of [cloned,cloned.a,cloned.a[0],cloned.empty])assert(Object.isFrozen(item));
 original.a[0].value=5;assert(Object.is(cloned.a[0].value,-0));
 assert.throws(()=>{cloned.empty.value=1;},TypeError);
 assert.equal(copy(undefined),undefined);
});
test('nonfinite numbers, unsupported primitives and nonplain objects reject explicitly',()=>{
 for(const value of [NaN,Infinity,-Infinity,1n,Symbol('s'),()=>{},new Date(),/x/u,Buffer.from('x'),new Number(1),new String('x'),new Map(),new Set(),Object.create({})])rejects(value);
});
test('provider getters, setters, proxies and revoked proxies never execute traps',()=>{
 let called=0;const trap=()=>{called++;throw Error('provider content must stay private');};
 const accessor={};Object.defineProperty(accessor,'value',{get:trap,enumerable:true});
 const setter={};Object.defineProperty(setter,'value',{set:trap,enumerable:true});
 const array=[];Object.defineProperty(array,'0',{get:trap,enumerable:true});
 const handler=Object.fromEntries(['get','set','getPrototypeOf','setPrototypeOf','ownKeys','getOwnPropertyDescriptor','defineProperty','has','deleteProperty','isExtensible','preventExtensions','apply','construct'].map(key=>[key,trap]));
 const revoked=Proxy.revocable({},handler);revoked.revoke();
 for(const value of [accessor,setter,array,new Proxy({},handler),new Proxy([],handler),revoked.proxy,{nested:new Proxy({},handler)}]){
  rejects(value);assert.throws(()=>copy(value),TypeError);
 }
 assert.equal(called,0);
});
test('symbols and every nonarray hidden property, including length, are rejected',()=>{
 for(const key of ['hidden','length','toJSON']){
  const value={visible:true};Object.defineProperty(value,key,{value:undefined});rejects(value);
 }
 const symbol={};symbol[Symbol('hidden')]=1;rejects(symbol);
 const hiddenSymbol={};Object.defineProperty(hiddenSymbol,Symbol('hidden'),{value:1});rejects(hiddenSymbol);
 assert.notEqual(snapshot({length:undefined}),snapshot({}));
 assert.notEqual(snapshot({length:0}),snapshot([]));
});
test('sparse arrays, extra properties, hidden indices and fake index substitutions reject',()=>{
 const extra=[];extra.extra=1;
 const hidden=[1];Object.defineProperty(hidden,'0',{enumerable:false});
 const fake=Array(1);fake['01']=1;
 const sparse=Array(2);sparse[1]=undefined;
 const arraySymbol=[];arraySymbol[Symbol('s')]=1;
 for(const value of [Array(1),extra,hidden,fake,sparse,arraySymbol])rejects(value);
 assert.match(snapshot([undefined]),/^[a-f0-9]{64}$/u);
});
test('array capacity is checked before own-key or element traversal',t=>{
 const huge=Array(0xffffffff);let enumerated=0,accessed=0;
 Object.defineProperty(huge,'0',{get(){accessed++;throw Error('must not visit');},enumerable:true});
 const original=Reflect.ownKeys,mocked=t.mock.method(Reflect,'ownKeys',value=>{
  if(value===huge){enumerated++;throw Error('must not enumerate');}return original(value);
 });
 try{rejects(huge,capacity);}finally{mocked.mock.restore();}
 assert.equal(enumerated,0);assert.equal(accessed,0);
});
test('cycles, depth, node count, string keys, total characters and encoded size stay bounded',()=>{
 const cycle={};cycle.self=cycle;rejects(cycle);
 const arrayCycle=[];arrayCycle.push(arrayCycle);rejects(arrayCycle);
 let deep=null;for(let index=0;index<32;index++)deep=[deep];assert.match(snapshot(deep),/^[a-f0-9]{64}$/u);rejects([deep],capacity);
 assert.match(snapshot(Array(99999).fill(null)),/^[a-f0-9]{64}$/u);rejects(Array(100000).fill(null),capacity);
 rejects(Object.fromEntries(Array.from({length:100000},(_,index)=>['k'+index,0])),capacity);
 assert.match(snapshot('x'.repeat(32000)),/^[a-f0-9]{64}$/u);rejects('x'.repeat(32001),capacity);
 rejects({['k'.repeat(32001)]:0},capacity);
 rejects(Array(63).fill('x'.repeat(32000)),capacity);
 rejects(Array(21).fill('\0'.repeat(32000)),capacity);
});
test('ordinary file reads return exactly the bounded bytes, including partial read progress',t=>{
 const {file,bytes}=fixture(t);assert.deepEqual(readBytes(file),bytes);assert.deepEqual(readBytes(file,undefined),bytes);
 assert.deepEqual(readBytes(file,bytes.length),bytes);
 const read=fs.readSync;let calls=0;
 withMock(t,'readSync',(fd,buffer,offset,length,position)=>{calls++;return read(fd,buffer,offset,Math.min(length,2),position);},()=>assert.deepEqual(readBytes(file),bytes));
 assert.equal(calls,3);
});
test('file arguments and maximum are validated before any filesystem call or provider coercion',t=>{
 const {file}=fixture(t);let called=0;const trap=()=>{called++;throw Error('secret provider');};
 const hostile={toString:trap,valueOf:trap,[Symbol.toPrimitive]:trap};
 const proxy=new Proxy({}, {get:trap,getPrototypeOf:trap,ownKeys:trap});
 const mocked=t.mock.method(fs,'lstatSync',trap);
 try{
  for(const maximum of [0,-0,-1,1.5,NaN,Infinity,-Infinity,12*1024*1024+1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,'1',null,true,[],{},1n,Symbol('s'),hostile,proxy])
   assert.throws(()=>readBytes(file,maximum),{name:'TypeError',message:unavailable});
  for(const input of ['', 'x'.repeat(32768),'bad\0file',undefined,null,1,[],hostile,proxy,Symbol('s'),Buffer.from('x')])
   assert.throws(()=>readBytes(input),{name:'TypeError',message:unavailable});
 }finally{mocked.mock.restore();}
 assert.equal(called,0);
});
test('missing, empty, oversized and directory files fail with sanitized errors',t=>{
 const {root,file,bytes}=fixture(t);
 for(const input of [root,path.join(root,'private-missing')])assert.throws(()=>readBytes(input),{name:'TypeError',message:unavailable});
 assert.throws(()=>readBytes(file,bytes.length-1),{name:'TypeError',message:unavailable});
 fs.writeFileSync(file,'');assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable});
 fs.truncateSync(file,12*1024*1024+1);assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable});
});
test('symlink, nonfile, invalid stat size and opened identity changes never grant file bytes',t=>{
 const {file}=fixture(t),lstat=fs.lstatSync,fstat=fs.fstatSync;
 for(const change of [stat=>({...stat,isFile:()=>true,isSymbolicLink:()=>true}),stat=>({...stat,isFile:()=>false,isSymbolicLink:()=>false}),stat=>({...stat,size:NaN,isFile:()=>true,isSymbolicLink:()=>false})])
  withMock(t,'lstatSync',input=>change(lstat(input)),()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 for(const field of ['ino','dev','size'])withMock(t,'fstatSync',fd=>{
  // Windows inode numbers can exceed safe integer precision; +1 may be equal.
  const stat=fstat(fd);return Object.assign(stat,{[field]:stat[field]===0?1:0});
 },()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 withMock(t,'fstatSync',fd=>Object.assign(fstat(fd),{isFile:()=>false}),()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
});
test('read, open, close and post-read drift failures remain sanitized and descriptors close',t=>{
 const {file}=fixture(t),close=fs.closeSync,fstat=fs.fstatSync,lstat=fs.lstatSync;let closed=0;
 const closeMock=t.mock.method(fs,'closeSync',fd=>{closed++;return close(fd);});
 try{
  for(const behavior of [()=>{throw Error('private OS details');},()=>0])withMock(t,'readSync',behavior,()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 }finally{closeMock.mock.restore();}
 assert.equal(closed,2);
 withMock(t,'openSync',()=>{throw Error('private path');},()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 withMock(t,'closeSync',fd=>{close(fd);throw Error('private close details');},()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 for(const field of ['size','mtimeMs','ctimeMs']){
  let reads=0;withMock(t,'fstatSync',fd=>{const stat=fstat(fd);return ++reads===2?Object.assign(stat,{[field]:stat[field]+1}):stat;},()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
 }
 let paths=0;withMock(t,'lstatSync',input=>{const stat=lstat(input);return ++paths===2?Object.assign(stat,{isSymbolicLink:()=>true}):stat;},()=>assert.throws(()=>readBytes(file),{name:'TypeError',message:unavailable}));
});
test('snapshot regressions are in unified unit/all discovery and the runtime/type boundary',()=>{
 const root=path.resolve(__dirname,'..'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(root,suite).some(file=>path.normalize(file.file)===path.normalize('test/source-inventory-revision-snapshot.test.js')));
 const helper='packages/slideclone-core/scene-plan/source-inventory-revision-snapshot.js';
 assert(JSON.parse(fs.readFileSync(path.join(root,'tsconfig.boundaries.json'),'utf8')).include.includes(helper));
 assert(fs.readFileSync(path.join(root,'scripts/verify-runtime-package.js'),'utf8').includes('"'+helper+'"'));
});
