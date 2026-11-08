'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
const {namespaceRawPageAssets:namespace}=require('../packages/slideclone-worker-adapter/worker-asset-namespace');
function fixture(t){
 const root=createTemporaryTestDirectory('worker-asset-namespace-');t.after(()=>removeTemporaryTestDirectory(root));
 const pageRoot=path.join(root,'.raw-pages','001'),assets=path.join(pageRoot,'assets');fs.mkdirSync(assets,{recursive:true});
 const deck={version:'1.0',slideSize:{widthPt:120,heightPt:120},pages:[{shapes:[],images:[],textBoxes:[]}]};
 return {root,pageRoot,assets,deck,run:()=>namespace(deck,pageRoot,root,1),published:()=>fs.existsSync(path.join(root,'assets','page-001'))};
}
test('flat and nested source assets publish with exact byte copies and rewritten references, preserving input',t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.assets,'scene-owned','inner'),{recursive:true});
 for(const name of ['source.png','scene-owned/inner/crop.png'])fs.writeFileSync(path.join(f.assets,name),Buffer.from(name));
 f.deck.pages[0].images=[{id:'icon',box:{x:1,y:1,w:10,h:10},assetPath:'assets/scene-owned/inner/crop.png',
  style:{assetPath:'assets/scene-owned/inner/crop.png'},source:{pageImage:'assets/source.png'}}];
 const before=structuredClone(f.deck),out=f.run(),image=out.pages[0].images[0];
 assert.deepEqual(f.deck,before);assert.equal(image.assetPath,'assets/page-001/scene-owned/inner/crop.png');
 assert.equal(image.style.assetPath,image.assetPath);assert.equal(image.source.pageImage,'assets/page-001/source.png');
 assert.deepEqual(fs.readFileSync(path.join(f.root,image.assetPath)),Buffer.from('scene-owned/inner/crop.png'));
 assert.equal(fs.readdirSync(path.join(f.root,'assets')).some(name=>name.startsWith('.namespace-')),false);
});
test('an empty asset tree is valid and an existing namespace is never overwritten',t=>{
 const f=fixture(t);assert.deepEqual(f.run(),f.deck);assert.equal(f.published(),true);
 fs.writeFileSync(path.join(f.root,'assets/page-001/keep'),'original');
 assert.throws(f.run,/already exists/);assert.equal(fs.readFileSync(path.join(f.root,'assets/page-001/keep'),'utf8'),'original');
});
test('linked directories, excessive depth and oversized trees reject before publishing',t=>{
 for(const mode of ['link','depth','size']){
  const f=fixture(t);
  if(mode==='link'){
   const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret'),'untouched');
   fs.symlinkSync(outside,path.join(f.assets,'linked'),process.platform==='win32'?'junction':'dir');
  }else if(mode==='depth')fs.mkdirSync(path.join(f.assets,...Array(18).fill('nested')),{recursive:true});
  else{const file=path.join(f.assets,'huge');fs.writeFileSync(file,'');fs.truncateSync(file,128*1024*1024+1);}
  assert.throws(f.run,/raw asset namespace (?:link|depth|byte)/);assert.equal(f.published(),false);
 }
});
test('invalid, extreme and hostile controls reject without invoking getters or Proxy traps',t=>{
 const f=fixture(t);let calls=0;const hostile={get version(){calls++;throw Error('private');}};
 for(const value of [null,{},hostile,new Proxy(f.deck,{get(){calls++;throw Error('private');}})])
  assert.throws(()=>namespace(value,f.pageRoot,f.root,1));
 for(const number of [0,51,-1,1.5,NaN,Infinity,'1'])assert.throws(()=>namespace(f.deck,f.pageRoot,f.root,number),/controls/);
 assert.equal(calls,0);assert.equal(f.published(),false);
});
test('a copy failure removes staging and does not publish any partial namespace',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.assets,'source.png'),'source');
 const copy=fs.copyFileSync;fs.copyFileSync=()=>{throw Error('test-copy-failure');};
 try{assert.throws(f.run,/test-copy-failure/);}finally{fs.copyFileSync=copy;}
 assert.equal(f.published(),false);assert.deepEqual(fs.readdirSync(path.join(f.root,'assets')),[]);
});
test('nested asset regression and runtime module enter unified CI and release checks',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),{REQUIRED_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.endsWith('worker-asset-namespace.test.js')));
 assert.ok(REQUIRED_FILES.includes('packages/slideclone-worker-adapter/worker-asset-namespace.js'));
});
