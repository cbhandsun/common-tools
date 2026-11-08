'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {fixture}=require('./helpers/approved-backdrop-pixels.cjs');
const {parseApprovedBackdropPixels:parse}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-input');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');

test('manifest admission rejects empty, malformed, extreme, duplicate and out-of-scope input',t=>{
 const f=fixture(t);
 for(const input of [undefined,null,true,[],{},'sensitive'])assert.throws(()=>parse(input),TypeError);
 for(const mutate of [r=>r.pixels=[],r=>r.pixels.reverse(),r=>r.pixels.push(r.pixels.at(-1)),r=>r.pixels[0].cell=-1,r=>r.pixels[0].cell=80,
  r=>r.pixels[0].cell=Infinity,r=>r.pixels[0].cell=.5,r=>r.pixels[0].color=[1,2],r=>r.pixels[0].color=[1,2,256],r=>r.pixels[0].color=[1,2,-1],
  r=>r.pixels[0].color=[1,2,'3'],r=>r.pixels[0].kind='other',r=>r.pixels[0].extra=true,r=>r.assets=[],r=>r.assets.push(r.assets[0]),
  r=>r.source.width=0,r=>r.source.height=16385,r=>r.source.width=100000000,r=>r.source.sha256='sensitive',r=>r.approvalId='../sensitive',
  r=>r.scopeFingerprint='a'.repeat(64),r=>r.pageFingerprint='sensitive',r=>r.extra=true]){
  const review=structuredClone(f.review);mutate(review);assert.throws(()=>parse(review),error=>error instanceof TypeError&&!error.message.includes('sensitive'));
 }
});
test('admission executes no proxy traps, getters, hooks or overridden array methods',t=>{
 const f=fixture(t);let calls=0;const trap=()=>{calls++;throw Error('sensitive');},handler={get:trap,ownKeys:trap,getPrototypeOf:trap};
 for(const key of [null,'source','pixels','assets']){const review=structuredClone(f.review);if(key)review[key]=new Proxy(review[key],handler);
  assert.throws(()=>parse(key?review:new Proxy(review,handler)),TypeError);}
 for(const mode of ['cell','color','hook','array','symbol']){
  const review=structuredClone(f.review);
  if(mode==='cell')Object.defineProperty(review.pixels[0],'cell',{get:trap});
  if(mode==='color')review.pixels[0].color[0]={valueOf:trap};
  if(mode==='hook')review.toJSON=trap;
  if(mode==='array')review.pixels.map=trap;
  if(mode==='symbol')review[Symbol.toPrimitive]=trap;
  assert.throws(()=>parse(review),TypeError);
 }
 assert.equal(calls,0);
});
test('parsed policy is detached and deeply immutable, including channel arrays',t=>{
 const f=fixture(t),parsed=parse(f.review);f.review.pixels[0].color[0]=99;assert.equal(parsed.pixels[0].color[0],10);
 for(const value of [parsed,parsed.source,parsed.assets,parsed.assets[0],parsed.pixels,parsed.pixels[0],parsed.pixels[0].color])assert.ok(Object.isFrozen(value));
});
test('source boundary and maximum bounded manifest are supported without admitting an oversized list',()=>{
 const source={width:100,height:100,sha256:'a'.repeat(64)},pixels=Array.from({length:10000},(_,cell)=>({cell,color:[0,127,255],kind:'source-interpolation'}));
 const review={approvalId:'host-review',source,pixels,scopeFingerprint:fingerprint({source,pixels}),pageFingerprint:'b'.repeat(64),assets:[{imageId:'image',beforeSha256:'c'.repeat(64),imageFingerprint:'d'.repeat(64)}]};
 assert.equal(parse(review).pixels.length,10000);review.pixels.push({cell:10000,color:[0,0,0],kind:'neighbor-inference'});assert.throws(()=>parse(review),TypeError);
});
test('new input/application suites and package files enter unified CI and runtime installation verification',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all']){
  const files=discoverTestFiles(process.cwd(),suite).map(row=>path.basename(row.file));
  for(const file of ['approved-backdrop-pixel-input.test.js','approved-backdrop-pixels.test.js','approved-backdrop-pipeline.test.js'])assert.ok(files.includes(file));
 }
 const verifier=fs.readFileSync(path.join(__dirname,'../scripts/verify-runtime-package.js'),'utf8');
 for(const file of ['approved-backdrop-budget','approved-backdrop-pixel-input','approved-backdrop-pixel-patch','approved-backdrop-pixel-application'])assert.ok(verifier.includes('scene-plan/'+file+'.js'));
});
