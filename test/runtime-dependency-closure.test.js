'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verifyRuntimeDependencyClosure:verify}=require('../scripts/lib/runtime-dependency-closure');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
function fixture(t){
 const parent=fs.realpathSync(os.tmpdir()),temporary=fs.mkdtempSync(path.join(parent,'runtime-dependency-test-'));
 t.after(()=>{assert.equal(path.dirname(temporary),parent);fs.rmSync(temporary,{recursive:true,force:true});});
 const modules=path.join(temporary,'install/node_modules'),root=path.join(modules,'common-tools');
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
 const rootManifest=dependencies=>write(path.join(root,'package.json'),{name:'common-tools',dependencies});
 const workspace=(folder,dependencies)=>write(path.join(root,'packages',folder,'package.json'),{name:'@common-tools/'+folder,version:'0.1.0',dependencies});
 rootManifest({'fixture-production':'^1.2.3'});workspace('consumer',{'fixture-production':'^1.2.3'});
 return {temporary,root,modules,rootManifest,workspace,write};
}
test('aggregate production declarations cover the actual workspace external dependency closure',()=>{
 const root=path.resolve(__dirname,'..'),folders=fs.readdirSync(path.join(root,'packages'),{withFileTypes:true})
  .filter(row=>row.isDirectory()&&fs.existsSync(path.join(root,'packages',row.name,'package.json'))).map(row=>row.name);
 assert.deepEqual(verify(root,folders).externalDependencies,['@aws-sdk/client-s3','@aws-sdk/s3-request-presigner','pg','redis']);
 const bundle=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 for(const name of Object.keys(bundle.dependencies))assert.equal(bundle.dependencies[name],lock.packages['node_modules/'+name].version);
});
test('empty closure and embedded private dependencies use only real workspace identities',t=>{
 const f=fixture(t);f.rootManifest({});assert.deepEqual(verify(f.root,[]),{externalDependencies:[],workspaceCount:0});
 f.workspace('consumer',{'@common-tools/provider':'0.1.0'});
 assert.throws(()=>verify(f.root,['consumer']),/embedded workspace dependency/);
 f.workspace('provider',{});assert.equal(verify(f.root,['consumer','provider']).workspaceCount,2);
 f.workspace('provider',{'@common-tools/consumer':'0.2.0'});assert.throws(()=>verify(f.root,['consumer','provider']),/embedded workspace dependency/);
});
test('missing production declarations mismatched ranges and conflicting workspace ranges fail closed',t=>{
 const f=fixture(t);assert.deepEqual(verify(f.root,['consumer']).externalDependencies,['fixture-production']);
 f.rootManifest({'fixture-production':'1.2.3'});assert.equal(verify(f.root,['consumer']).externalDependencies.length,1);
 for(const value of [{},{'fixture-production':'^2.0.0'},{'fixture-production':'1.2.4'}]){
  f.rootManifest(value);assert.throws(()=>verify(f.root,['consumer']),/missing or mismatched/);
 }
 f.rootManifest({'fixture-production':'^1.2.3'});f.workspace('other',{'fixture-production':'^2.0.0'});
 assert.throws(()=>verify(f.root,['consumer','other']),/ranges conflict/);
 f.rootManifest({'fixture-production':'^1.2.3','@common-tools/consumer':'0.1.0'});
 assert.throws(()=>verify(f.root,['consumer']),/cannot fetch embedded private workspaces/);
});
test('malformed empty extreme and unsafe dependency inputs never expose manifest contents',t=>{
 const f=fixture(t);
 for(const folders of [['../escape'],['consumer','consumer'],Array(129).fill('consumer'),[null]])assert.throws(()=>verify(f.root,folders),/inputs are invalid/);
 for(const value of [null,[],{'../private-token':'^1.2.3'},{'fixture-production':'file:private-token'},{'fixture-production':'^1.2.3 private-token'},
  Object.fromEntries(Array.from({length:129},(_,i)=>['dep'+i,'1.0.0']))]){
  f.rootManifest(value);assert.throws(()=>verify(f.root,['consumer']),error=>/^Runtime /.test(error.message)&&!error.message.includes('private-token'));
 }
 fs.writeFileSync(path.join(f.root,'package.json'),'private-token');assert.throws(()=>verify(f.root,['consumer']),/manifest is invalid/);
 fs.writeFileSync(path.join(f.root,'package.json'),' '.repeat(262145));assert.throws(()=>verify(f.root,['consumer']),/manifest is invalid/);
});
test('hostile sparse and accessor folder lists stop without executing caller code',t=>{
 const f=fixture(t);let calls=0;
 const getter=['consumer'];Object.defineProperty(getter,0,{get(){calls++;throw Error('private-token');}});
 const proxy=new Proxy(['consumer'],{get(){calls++;throw Error('private-token');},getPrototypeOf(){calls++;throw Error('private-token');}});
 const inherited=['consumer'];Object.setPrototypeOf(inherited,{});
 for(const value of [getter,proxy,inherited,Array(1),null,undefined,1,{}])assert.throws(()=>verify(f.root,value),/inputs are invalid/);
 for(const value of ['',null,'relative','x'.repeat(32768),f.root+'\0'])assert.throws(()=>verify(value,[]),/inputs are invalid/);
 assert.equal(calls,0);
});
test('installed closure resolves locally and rejects missing modules and links outside its installation',t=>{
 const f=fixture(t),dependency=path.join(f.modules,'fixture-production');
 assert.throws(()=>verify(f.root,['consumer'],f.modules),/installed production dependency is unavailable/);
 f.write(path.join(dependency,'package.json'),{name:'fixture-production',version:'1.2.3',main:'index.js'});
 fs.writeFileSync(path.join(dependency,'index.js'),'module.exports={};');
 assert.equal(verify(f.root,['consumer'],f.modules).externalDependencies.length,1);
 const external=path.join(f.temporary,'outside-installation');f.write(path.join(external,'package.json'),{name:'fixture-production',version:'1.2.3',main:'index.js'});
 fs.writeFileSync(path.join(external,'index.js'),'module.exports={};');
 fs.renameSync(dependency,path.join(f.modules,'retained-dependency'));
 fs.symlinkSync(external,dependency,process.platform==='win32'?'junction':'dir');
 // A fresh aggregate root avoids Node's successful resolution cache.
 const alternate=path.join(f.modules,'alternate');fs.cpSync(f.root,alternate,{recursive:true});
 assert.throws(()=>verify(alternate,['consumer'],f.modules),/escapes the installation/);
});
test('dependency closure regressions enter unified CI',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
