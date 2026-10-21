'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedContactTerminals:bind}=require('../packages/slideclone-core/source-shared-contact-terminals');
function fixture(){
 const width=32,height=32,skeleton=new Uint8Array(width*height);
 for(let x=8;x<=12;x++)skeleton[5*width+x]=1;
 for(let y=5;y<=15;y++)skeleton[y*width+8]=1;
 for(let x=4;x<=24;x++)skeleton[15*width+x]=1;
 for(const x of [4,24])for(let y=15;y<=26;y++)skeleton[y*width+x]=1;
 return {skeleton,width,height,contacts:[{index:5*width+10,alternatives:[8,9,10,11,12].map(x=>5*width+x),fixed:false},
  {index:26*width+4,alternatives:[26*width+4],fixed:true},{index:26*width+24,alternatives:[26*width+24],fixed:true}],work:{checks:0}};
}
test('a contact span binds its unique natural skeleton endpoint instead of protecting the span centre',()=>{
 const f=fixture(),before=f.skeleton.slice();assert.deepEqual(bind(f),[5*32+12,26*32+4,26*32+24]);
 assert.deepEqual(f.skeleton,before);assert.ok(f.work.checks>0&&f.work.checks<=4000000);
 const {sourceSharedShaftTree:tree}=require('../packages/slideclone-core/source-shared-shaft-tree');
 assert.equal(tree({mask:f.skeleton,width:32,height:32,terminals:f.contacts.map(c=>c.index),work:{checks:0}}),null);
 const accepted=tree({mask:f.skeleton,width:32,height:32,terminals:bind(f),work:{checks:0}});assert.ok(accepted);
 assert.deepEqual(accepted.skeleton,before);assert.equal(accepted.edges.length,3);
 for(const reverse of [false,true])for(const transpose of [false,true]){
  const index=n=>{const x=reverse?31-n%32:n%32,y=Math.floor(n/32);return transpose?x*32+y:y*32+x;};
  const skeleton=new Uint8Array(1024);for(let n=0;n<1024;n++)skeleton[index(n)]=f.skeleton[n];
  const contacts=f.contacts.map(c=>({...c,index:index(c.index),alternatives:c.alternatives.map(index)})).reverse();
  assert.deepEqual(bind({...f,skeleton,contacts,work:{checks:0}}),[26*32+24,26*32+4,5*32+12].map(index));
 }
});
test('missing, ambiguous and overlapping contact endpoints do not create a mapping or delete a branch',()=>{
 const missing=fixture();missing.contacts[0].alternatives=[5*32+9,5*32+10];assert.equal(bind(missing),null);
 const ambiguous=fixture();for(let y=3;y<5;y++)ambiguous.skeleton[y*32+9]=1;
 ambiguous.contacts[0].alternatives.push(3*32+9);assert.equal(bind(ambiguous),null);
 const overlap=fixture();overlap.contacts[1]={...overlap.contacts[0]};assert.equal(bind(overlap),null);
 const branch=fixture();for(let x=8;x<=12;x++)branch.skeleton[10*32+x]=1;
 const before=branch.skeleton.slice();assert.ok(bind(branch));assert.deepEqual(branch.skeleton,before);
 // The binder maps contacts only. It cannot grant complete-tree authority:
 // the ordinary shaft tree must still reject the unrepresented extra branch.
 const {sourceSharedShaftTree}=require('../packages/slideclone-core/source-shared-shaft-tree');
 assert.equal(sourceSharedShaftTree({mask:branch.skeleton,width:32,height:32,terminals:bind(branch),work:{checks:0}}),null);
});
test('malformed, empty, hostile and exhausted controls fail without invoking user getters',()=>{
 for(const value of [null,{}, {...fixture(),contacts:[]},{...fixture(),skeleton:new Uint8Array(1)},
  {...fixture(),width:100000},{...fixture(),work:{checks:NaN}},
  {...fixture(),contacts:[...fixture().contacts,{index:-1,alternatives:[-1],fixed:false}]}])assert.throws(()=>bind(value),TypeError);
 const empty=fixture();empty.skeleton.fill(0);assert.equal(bind(empty),null);
 const exhausted=fixture();exhausted.work.checks=4000000;assert.equal(bind(exhausted),null);assert.ok(exhausted.work.checks>4000000);
 const boundary=fixture();boundary.work.checks=3999998;assert.equal(bind(boundary),null);assert.ok(boundary.work.checks>4000000);
 const outside=fixture();outside.contacts[0].alternatives=[5*32+12];assert.equal(bind(outside),null);
 const sparse=fixture();sparse.contacts[0].alternatives=new Array(3);assert.throws(()=>bind(sparse),TypeError);
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter=fixture();Object.defineProperty(getter,'contacts',{get:trap});
 const nested=fixture();Object.defineProperty(nested.contacts[0],'alternatives',{get:trap});
 for(const value of [getter,nested,new Proxy({}, {get:trap}),{...fixture(),skeleton:new Proxy(new Uint8Array(1024),{get:trap})}])assert.throws(()=>bind(value),TypeError);
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-shared-contact-terminals.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-shared-route-edges.js'));
});
test('the maximum bounded raster and contact count retain exact original terminal cells',()=>{
 const width=512,height=512,skeleton=new Uint8Array(width*height),contacts=[];
 for(let i=0;i<32;i++){
  const index=(i*4+4)*width+10;skeleton[index]=1;skeleton[index+1]=1;
  contacts.push({index,alternatives:[index],fixed:false});
 }
 const work={checks:0};assert.deepEqual(bind({skeleton,width,height,contacts,work}),contacts.map(c=>c.index));
 assert.ok(work.checks>0&&work.checks<=4000000);
 assert.throws(()=>bind({skeleton,width,height,contacts:[...contacts,contacts[0]],work:{checks:0}}),TypeError);
});
