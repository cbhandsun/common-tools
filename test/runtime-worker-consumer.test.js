'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {sceneWorkerConsumerProbe}=require('../scripts/lib/runtime-worker-consumer');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
function run(root,prefix=''){return spawnSync(process.execPath,['-e',prefix+sceneWorkerConsumerProbe(),root],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4096});}
test('the formal consumer runs complete Worker export and both explicit and default factory budgets',()=>{
 const result=run(path.resolve(__dirname,'..'));assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');assert.equal(result.stderr,'');
});

test('the installed consumer rejects a real Worker factory that silently drops the settings connector mode',()=>{
 const root=path.resolve(__dirname,'..');
 const result=run(root,`const factoryFile=require('node:path').join(process.argv[1],'packages/remote-mcp-server/image-native-rebuilder.js');
 const actualFactory=require(factoryFile).createNativeRebuilder;
 require.cache[require.resolve(factoryFile)].exports={createNativeRebuilder(settings,options){return actualFactory({...settings,connectorCornerMode:undefined},options);}};
 `);
 assert.equal(result.status,2);assert.equal(result.stdout,'worker-consumer-assertions');assert.equal(result.stderr,'');
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
 const worker=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'),png=path.join(root,'packages/slideclone-core/png.js'),engine=path.join(root,'packages/slideclone-native-engine/index.js');
 for(const file of [worker,png,engine])fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(worker,'module.exports={createNativeRebuilder:()=>async()=>({deck:{meta:{sourceSceneReview:{reviewed:38,reviewAllocation:{batchCount:2}}}}})};');
 fs.writeFileSync(png,"module.exports={writePng(file){require('node:fs').writeFileSync(file,'');}};");
 fs.writeFileSync(engine,'module.exports={loadNativeImageRebuilder:()=>({rebuildDeckFromWorkDir(){}})};');
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-consumer-assertions');assert.equal(result.stderr,'');
});

for(const [name,source]of [
 ['missing',null],
 ['throwing',"module.exports={loadNativeImageRebuilder(){throw Error('private-token user-content');}};"],
 ['invalid-export','module.exports={loadNativeImageRebuilder:()=>({})};']
])test(`a ${name} real engine stops before the fixture and reports only its cold-load stage`,t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-consumer-test-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const worker=path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'),engine=path.join(root,'packages/slideclone-native-engine/index.js');
 fs.mkdirSync(path.dirname(worker),{recursive:true});
 fs.writeFileSync(worker,"module.exports={createNativeRebuilder(){require('node:fs').writeFileSync(require('node:path').join(__dirname,'../../../fixture-called'),'unexpected');throw Error('factory was called');}};");
 if(source!==null){fs.mkdirSync(path.dirname(engine),{recursive:true});fs.writeFileSync(engine,source);}
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-native-engine-cold-load');assert.equal(result.stderr,'');
 assert.equal(fs.existsSync(path.join(root,'fixture-called')),false);
});
test('installed Worker consumer regressions enter unified CI',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
