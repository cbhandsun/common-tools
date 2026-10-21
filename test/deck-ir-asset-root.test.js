'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {validateDeckIr}=require('../packages/slideclone-core/deck-ir-admission');
const deck=asset=>({version:'1.0',slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,shapes:[],textBoxes:[],tables:[],charts:[],
 images:[{id:'image',assetPath:asset,box:{x:0,y:0,w:10,h:10}}]}]});
test('mixed and trailing host separators resolve to one asset root before containment and existence checks',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'deck-root-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets','image.png'),'fixture');
 const input=deck('assets/image.png'),before=structuredClone(input);
 for(const base of [root,root+path.sep,root.replaceAll('\\','/'),root.replaceAll('\\','/')+'/',path.join(root,'assets','..')])
  assert.deepEqual(validateDeckIr(input,base),{pages:1,assets:1});
 assert.deepEqual(input,before);
 for(const asset of ['assets/missing.png','assets/../image.png','../assets/image.png','assets/../../outside.png','/assets/image.png','assets\\image.png'])
  assert.throws(()=>validateDeckIr(deck(asset),root),Error);
});
test('asset-root boundary rejects empty, invalid and hostile controls without coercion or content leakage',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-key');};
 for(const root of ['',null,undefined,4,{},'bad\0root',{toString:trap},new Proxy({},{get:trap})])
  assert.throws(()=>validateDeckIr(deck('assets/image.png'),root),e=>e instanceof TypeError&&!e.message.includes('private-key'));
 assert.equal(calls,0);
});
test('asset-root normalization regression is discovered by both unified CI suites',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});
