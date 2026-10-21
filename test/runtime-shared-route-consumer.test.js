'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {sceneSharedRouteConsumerProbe}=require('../scripts/lib/runtime-shared-route-consumer');
const run=(root,probe=sceneSharedRouteConsumerProbe())=>spawnSync(process.execPath,['-e',probe,root],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4096});

test('Worker factory consumes shared multi-contact paths, mixed directions and old-arrow retirement',()=>{
 const result=run(path.resolve(__dirname,'..'));assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');assert.equal(result.stderr,'');
});

test('shared consumer fails safely when a required installed module is unavailable',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-shared-gate-test-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-shared-cold-load');assert.equal(result.stderr,'');
});

test('shared consumer rejects missing trunk, altered endpoint, duplicate identity and retained old arrow',()=>{
 const root=path.resolve(__dirname,'..');
 for(const mutation of [
  "page.shapes=page.shapes.filter(s=>s.id!==inventory.sharedRouteGraphs[0].edges[0].memberId);",
  "page.shapes.find(s=>s.id===inventory.sharedRouteGraphs[0].edges[0].memberId).style.endAnchor.elementId='missing';",
  "page.shapes.push(page.shapes[0]);",
  "page.shapes.push({id:'prior-shared-arrow'});"
 ]){
  const probe=sceneSharedRouteConsumerProbe().replace("stage='worker-shared-native-members';","stage='worker-shared-native-members';"+mutation);
  const result=run(root,probe);assert.equal(result.status,2,result.stdout);assert.match(result.stdout,/^worker-shared-(native-members|retirement)$/);assert.equal(result.stderr,'');
 }
});

test('shared consumer regressions are found by the unified unit suite',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/runtime-shared-route-consumer.test.js'));
});
