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
