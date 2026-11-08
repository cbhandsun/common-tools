'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {sceneProgramConsumerProbe}=require('../scripts/lib/runtime-program-consumer');
const run=(root,probe=sceneProgramConsumerProbe())=>spawnSync(process.execPath,['-e',probe,root],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4096});

test('complete Worker factory consumes an untemplated program through client transport and final native compilation',()=>{
 const result=run(path.resolve(__dirname,'..'));assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');assert.equal(result.stderr,'');
});

test('the program consumer fails safely before execution when the installed Worker is broken',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-program-gate-test-'));t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const file=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"throw Error('private-token user-content');");
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-program-cold-load');assert.equal(result.stderr,'');
});

test('the final program consumer rejects deleted or corrupted native members despite unchanged completion counts',()=>{
 const root=path.resolve(__dirname,'..');
 const mutations=[
  "page.shapes=page.shapes.filter(s=>s.source?.sceneInventoryId!=='relation-link');",
  "page.shapes.push(page.shapes.find(s=>s.source?.sceneInventoryId==='relation-link'));",
  "delete page.shapes.find(s=>s.source?.sceneInventoryId==='relation-link').style.endArrow;",
  "page.shapes.find(s=>s.source?.sceneInventoryId==='relation-link').style.endAnchor.elementId='missing';",
  "page.shapes=page.shapes.filter(s=>s.id!==page.shapes.find(r=>r.source?.sceneInventoryId==='relation-link').style.startAnchor.elementId);"
 ];
 for(const mutation of mutations){
  const probe=sceneProgramConsumerProbe().replace("stage='worker-program-native-members';","stage='worker-program-native-members';"+mutation);
  const result=run(root,probe);assert.equal(result.status,2,result.stdout);assert.equal(result.stdout,'worker-program-native-members');assert.equal(result.stderr,'');
 }
});

test('program-consumer regressions enter unified CI',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/runtime-program-consumer.test.js'));
});

test('installed Worker detects a disabled or unconditional shared dash paint proof',()=>{
 const root=path.resolve(__dirname,'..');
 for(const [replacement,stage] of [['null','worker-program-dash-confirmed'],['[30,60,90]','worker-program-dash-foreign']]){
  const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&request.endsWith('source-dash-coverage-paint')?{...value,sourceDashCoveragePaint:()=>"+replacement+"}:value;};";
  const result=run(root,hook+sceneProgramConsumerProbe());assert.equal(result.status,2,result.stdout);assert.equal(result.stdout,stage);assert.equal(result.stderr,'');
 }
});
test('installed Worker detects disabled legacy dash retirement through actual final compilation',()=>{
 const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&request.endsWith('source-scene-dash-retirement')?{...value,retireMeasuredSceneDashApproximations:()=>[]}:value;};";
 const result=run(path.resolve(__dirname,'..'),hook+sceneProgramConsumerProbe());
 assert.equal(result.status,2);assert.equal(result.stdout,'worker-program-dash-retired');assert.equal(result.stderr,'');
});

test('installed Worker detects disabled crop registration or pixel erasure through actual final assets',()=>{
 for(const [file,field,replacement] of [['source-crop-registration','registerSourceCrop','false'],['source-crop-connector-erasure','eraseRegisteredConnectorPixels','null']]){
  const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&(request.endsWith('"+file+"')||request.endsWith('"+file+".js'))?{...value,"+field+":()=>"+replacement+"}:value;};";
  const result=run(path.resolve(__dirname,'..'),hook+sceneProgramConsumerProbe());
  assert.equal(result.status,2);assert.equal(result.stdout,'worker-program-crop-erased');assert.equal(result.stderr,'');
 }
});

test('installed Worker detects disabled detached-head geometry or spatial paint, and an unconditional foreign-head acceptance',()=>{
 for(const [file,field,replacement,stage] of [
  ['source-detached-dash-head','sourceDetachedDashHead','null','worker-program-detached-confirmed'],
  ['source-dash-spatial-paint','sourceDashSpatialPaint','null','worker-program-detached-confirmed']]){
  const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&(request.endsWith('"+file+"')||request.endsWith('"+file+".js'))?{...value,"+field+":()=> ("+replacement+")}:value;};";
  const result=run(path.resolve(__dirname,'..'),hook+sceneProgramConsumerProbe());assert.equal(result.status,2);assert.equal(result.stdout,stage);assert.equal(result.stderr,'');
 }
 const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&request.endsWith('source-dash-spatial-paint')?{...value,sourceDashSpatialPaint:(...input)=>value.sourceDashSpatialPaint(...input)??{color:'#1E3C5A'}}:value;};";
 const result=run(path.resolve(__dirname,'..'),hook+sceneProgramConsumerProbe());assert.equal(result.status,2);assert.equal(result.stdout,'worker-program-detached-foreign');assert.equal(result.stderr,'');
});
