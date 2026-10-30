'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/source-inventory-revision.cjs');
const {compileSourceScene,preflightSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {issueSceneInventoryRevision:issue,withSceneInventoryRevision:withRevision,
 markSceneInventoryRevisionSealed:seal}=require('../packages/slideclone-core/scene-plan/source-inventory-revision');

function input(f){return {plan:f.plan,sourceFile:f.sourceFile,root:f.root,
 page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:100,heightPt:100}};}
function receipt(f){return issue({plan:f.plan,sourceFile:f.sourceFile,regionId:'region-owner',
 relations:f.relations,confirmationId:'user-complete-compiler-boundary'});}
function safeError(error){return error instanceof TypeError&&!error.message.includes('private-content');}
const entries=[compileSourceScene,preflightSourceScene];

test('compile and preflight reject malformed records without evaluating provider code',()=>{
 let calls=0;
 const custom=Object.create({get plan(){calls++;throw Error('private-content');}});
 for(const entry of entries)for(const value of [undefined,null,false,0,'',[],()=>{},custom])
  assert.throws(()=>entry(value),safeError);
 assert.equal(calls,0);
});

test('all compiler entry accessors are rejected before reads, including hidden and symbol properties',t=>{
 const f=fixture(t);let calls=0;
 const keys=['plan','sourceFile','page','root','slideSize','surfaceSelection','spatialExterior','cageProgram',
  'jointIconRelations','pictorialMode','connectorCornerMode','sourceRouteCatalogs','deferNativeRoutes','preflight',
  'compilationSession','sourceCropSession','sourceIconReview','unknown',Symbol('provider')];
 for(const entry of entries)for(const key of keys)for(const enumerable of [true,false]){
  const value=input(f);
  Object.defineProperty(value,key,{enumerable,get(){calls++;throw Error('private-content');}});
  assert.throws(()=>entry(value),safeError);
 }
 assert.equal(calls,0);
});

test('compile and preflight reject ordinary and revoked proxies without invoking any trap',t=>{
 const f=fixture(t);let calls=0;
 const trap=()=>{calls++;throw Error('private-content');};
 const value=new Proxy(input(f),{get:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap,has:trap});
 const revoked=Proxy.revocable(input(f),{});revoked.revoke();
 for(const entry of entries)for(const proxy of [value,revoked.proxy])assert.throws(()=>entry(proxy),safeError);
 assert.equal(calls,0);
});

test('invalid compiler controls fail before source file access both with and without a revision',async t=>{
 const f=fixture(t),confirmation=receipt(f);let reads=0;
 const reject=()=>{
  t.mock.method(fs,'readFileSync',()=>{reads++;throw Error('private-content');});
  try{
   for(const entry of entries)for(const key of ['surfaceSelection','spatialExterior','cageProgram','jointIconRelations',
    'pictorialMode','connectorCornerMode','deferNativeRoutes'])for(const value of [null,1,'invalid',{},[]])
     assert.throws(()=>entry({...input(f),[key]:value}),safeError);
   assert.equal(reads,0);
  }finally{t.mock.restoreAll();}
 };
 reject();
 await withRevision(confirmation,()=>{
  reject();
  assert.throws(()=>seal(),/seal is unavailable/,'invalid controls cannot consume the revision');
  compileSourceScene(input(f));seal();
 });
});

test('hostile compiler input cannot read the source or consume an active inventory revision',async t=>{
 const f=fixture(t),confirmation=receipt(f);let reads=0,calls=0;
 await withRevision(confirmation,()=>{
  t.mock.method(fs,'readFileSync',()=>{reads++;throw Error('private-content');});
  try{
   for(const entry of entries)for(const key of ['plan','sourceFile','surfaceSelection','spatialExterior']){
    const value=input(f);Object.defineProperty(value,key,{enumerable:true,get(){calls++;throw Error('private-content');}});
    assert.throws(()=>entry(value),safeError);
   }
   const trap=()=>{calls++;throw Error('private-content');};
   for(const entry of entries)assert.throws(()=>entry(new Proxy(input(f),{get:trap,ownKeys:trap,getPrototypeOf:trap})),safeError);
   assert.equal(reads,0);assert.equal(calls,0);
   assert.throws(()=>seal(),/seal is unavailable/);
  }finally{t.mock.restoreAll();}
  compileSourceScene(input(f));seal();
 });
});

test('validated preflight and final compilation retain the effective census and original history',async t=>{
 const f=fixture(t),before=structuredClone(f.plan),confirmation=receipt(f);
 await withRevision(confirmation,()=>{
  const preflight=preflightSourceScene(input(f));
  const final=compileSourceScene({...input(f),compilationSession:preflight.compilationSession});
  const inventory=final.evidence.observedInventory;
  assert.equal(inventory.regions.find(row=>row.regionId==='region-owner').observed.relations,2);
  assert.equal(inventory.inventoryRevision.historical.observedInventory[0].relations,3);
  assert.deepEqual(f.plan,before);seal();
 });
});

test('compiler input regression is included in the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),root=path.resolve(__dirname,'..');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(root,suite)
  .some(row=>path.resolve(root,row.file)===__filename));
});
