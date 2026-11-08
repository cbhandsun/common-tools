'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {packSceneInventoryMembers:pack,unpackSceneInventoryMembers:unpack}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {writeSceneInventoryArtifact:write}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-artifact');
function fixture(){
 const plan={sourceHash:'a'.repeat(64),regions:[{id:'r'}],objects:[{id:'object-unit',regionId:'r',kind:'container'}],relations:[],
  observedInventory:[{regionId:'r',containers:1,icons:0,relations:0}]};
 const shapes=Array.from({length:500},(_,i)=>({id:'part-'+i,source:{sceneInventoryId:'object-unit'}}));
 return {plan,shapes,evidence:build(plan,shapes,[])};
}
test('lossless member transport preserves every source unit, type, identity, batch and census after JSON roundtrip',()=>{
 const f=fixture(),before=JSON.stringify(f.evidence),encoded=pack(f.evidence),decoded=unpack(JSON.parse(JSON.stringify(encoded)));
 assert.deepEqual(decoded,f.evidence);assert.equal(JSON.stringify(f.evidence),before);
 assert.deepEqual(audit(encoded,f.shapes,[],f.plan.sourceHash),[]);
 const missing=audit(encoded,f.shapes.slice(1),[],f.plan.sourceHash);
 assert.ok(missing.some(x=>x.reason==='compile-missing'));
 assert.ok(audit(encoded,f.shapes,[],'b'.repeat(64)).some(x=>x.reason==='evidence-invalid'));
 const count=v=>1+(v&&typeof v==='object'?Object.values(v).reduce((sum,x)=>sum+count(x),0):0);
 assert.ok(count(encoded)<count(f.evidence)-900);assert.equal(decoded.units[0].members.length,500);
});
test('invalid, unknown, duplicated, extreme, empty and hostile transports never bypass normal inventory validation',()=>{
 const f=fixture();
 for(const mode of ['null','extra','bad-type','bad-id','duplicate','capacity','unknown-version','empty','missing']){
  const value=pack(f.evidence);
  if(mode==='null')value.evidence=null;
  if(mode==='extra')value.authorized=true;
  if(mode==='bad-type')value.evidence.units[0].members[0]='picture:part-0';
  if(mode==='bad-id')value.evidence.units[0].members[0]='s:../private';
  if(mode==='duplicate')value.evidence.units[0].members[1]=value.evidence.units[0].members[0];
  if(mode==='capacity')value.evidence.units[0].members=Array(10001).fill('s:part');
  if(mode==='unknown-version')value.evidence.version=100;
  if(mode==='empty')value.evidence.units[0].members=[];
  if(mode==='missing')delete value.evidence.units[0].members;
  assert.ok(audit(value,f.shapes,[],f.plan.sourceHash).length,mode);
 }
 let reads=0;const hostile=pack(f.evidence);
 Object.defineProperty(hostile.evidence.units[0],'members',{enumerable:true,get(){reads++;throw Error('private');}});
 assert.equal(unpack(hostile),null);assert.equal(reads,0);
 assert.equal(unpack({format:'scene-inventory-members-v1',evidence:new Proxy({},{get(){reads++;throw Error('private');}})}),null);
 assert.equal(reads,0);assert.equal(unpack(undefined),undefined);
});
test('the complete audit is persisted as an immutable hash-bound asset and tampering or unsafe roots fail',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-inventory-asset-'));t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 const f=fixture(),reference=write(root,f.evidence),file=path.join(root,...reference.assetPath.split('/'));
 const bytes=fs.readFileSync(file);
 assert.deepEqual(JSON.parse(bytes),f.evidence);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),reference.sha256);
 assert.equal(reference.sourceHash,f.plan.sourceHash);assert.equal(reference.unitsCount,1);assert.equal(reference.regionsCount,1);
 assert.deepEqual(write(root,f.evidence),reference);
 fs.writeFileSync(file,'tampered');assert.throws(()=>write(root,f.evidence),/identity is invalid/u);
 for(const bad of ['', 'relative',root+'\0'])assert.throws(()=>write(bad,f.evidence),TypeError);
 assert.throws(()=>write(root,{...f.evidence,sourceHash:'bad'}),TypeError);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});
