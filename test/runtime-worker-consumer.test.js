'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {sceneWorkerConsumerProbe}=require('../scripts/lib/runtime-worker-consumer');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
function run(root){return spawnSync(process.execPath,['-e',sceneWorkerConsumerProbe(),root],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4096});}
test('the formal consumer runs complete Worker export and both explicit and default factory budgets',()=>{
 const result=run(path.resolve(__dirname,'..'));assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');assert.equal(result.stderr,'');
});
test('a syntactically valid broken Worker fails cold loading without exposing its exception',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-consumer-test-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const file=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,"throw new Error('private-token user-content');\n");
 assert.equal(spawnSync(process.execPath,['--check',file],{windowsHide:true}).status,0);
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-cold-load');assert.equal(result.stderr,'');
});
test('a loadable Worker factory that ignores the recognizer cannot pass by returning fake counters',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-consumer-test-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const worker=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'),png=path.join(root,'packages/slideclone-core/png.js');
 for(const file of [worker,png])fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(worker,'module.exports={createNativeRebuilder:()=>async()=>({deck:{meta:{sourceSceneReview:{reviewed:38,reviewAllocation:{batchCount:2}}}}})};');
 fs.writeFileSync(png,"module.exports={writePng(file){require('node:fs').writeFileSync(file,'');}};");
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-consumer-assertions');assert.equal(result.stderr,'');
});
test('installed Worker consumer regressions enter unified CI',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
