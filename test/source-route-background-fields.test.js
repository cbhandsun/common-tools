'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createCoreBackgroundFields:create}=require('../packages/slideclone-core/routing/source-route-background-fields');
const field=(cx,cy,radius,verticalRadius)=>({cx,cy,flank:radius-2,verticalFlank:verticalRadius-2,corners:Array.from({length:4},()=>[235,248,241])});

test('identical complete windows across search phases share source work inside the original remaining budget',()=>{
 const work={checks:3999880},calls=[];
 const read=create({work,measure:(...query)=>{calls.push(query);work.checks+=100;return field(...query);}});
 const expected=field(40,48,24,12);
 for(let i=0;i<12;i++)assert.deepEqual(read(40,48,24,12),expected);
 assert.equal(calls.length,1);assert.ok(work.checks<=4000000);
});

test('both radii, both coordinates and observer identity remain part of the exact immutable source scope',()=>{
 const work={checks:0},calls=[],read=create({work,measure:(...query)=>{calls.push(query);return field(...query);}});
 for(const query of [[40,48,24,12],[41,48,24,12],[40,49,24,12],[40,48,20,12],[40,48,24,16],[40,48,12,24]]){
  assert.deepEqual(read(...query),field(...query));assert.deepEqual(read(...query),field(...query));
 }
 assert.equal(calls.length,6);
 let observed=0;const input={work,measure:()=>{observed++;return null;}};
 const a=create(input),b=create(input);assert.equal(a(40,48,12),null);assert.equal(a(40,48,12,12),null);
 assert.equal(b(40,48,12),null);assert.equal(observed,2);
});

test('unavailable fields stay unavailable and thrown or exhausted observations never populate the cache',()=>{
 const work={checks:0};let calls=0,mode='throw';
 const read=create({work,measure:(...query)=>{calls++;if(mode==='throw')throw Error('Controlled field failure');if(mode==='budget')work.checks=4000001;return field(...query);}});
 assert.throws(()=>read(40,48,24,12),/Controlled field failure/);
 mode='budget';assert.equal(read(40,48,24,12),null);mode='complete';work.checks=0;
 assert.deepEqual(read(40,48,24,12),field(40,48,24,12));assert.equal(calls,3);
 work.checks=4000000;assert.equal(read(40,48,24,12),null);assert.equal(calls,3);
});

test('empty, invalid, extreme and failed work controls never invoke source measurement',()=>{
 let calls=0;const measure=()=>{calls++;return null;};
 for(const checks of [-1,NaN,Infinity,0.5])assert.throws(()=>create({work:{checks},measure})(40,48,12),RangeError);
 for(const query of [[NaN,48,12],[40,Infinity,12],[40,48,2],[40,48,12,0],[Number.MAX_SAFE_INTEGER+1,48,12],[40,48,'12']])
  assert.throws(()=>create({work:{checks:0},measure})(...query),RangeError);
 for(const checks of [4000000,4000001])assert.equal(create({work:{checks},measure})(40,48,12),null);
 assert.throws(()=>create({work:{checks:0},measure:null}),TypeError);assert.equal(calls,0);
 const work={checks:0},read=create({work,measure:()=>{work.checks=NaN;return field(40,48,12,12);}});
 assert.throws(()=>read(40,48,12),/field work/);
});

test('complete field budget regression runs through both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-fields.test.js'));
});
