"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const {paintOrder}=require('../packages/slideclone-core/scene-plan/source-scene-group-paint');
const box={x:10,y:10,w:30,h:20};
const image=(id,group)=>({id,type:'fidelity-crop',box,assetPath:'pixel.png',source:group===undefined?{}:{nativeComponentGroupId:group}});
const text=(id,group)=>({id,text:id,box,source:group===undefined?{}:{nativeComponentGroupId:group}});
function build(t,page){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'component-order-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8fK8QAAAABJRU5ErkJggg==','base64'));
 const input={version:'1.0',slideSize:{widthPt:100,heightPt:100},pages:[{pageIndex:0,background:{},tables:[],charts:[],...page}]};
 const ir=path.join(root,'deck.json'),pptx=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(input));
 runBuilder(['--ir',ir,'--out',pptx]);return readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8');
}
function assertOrder(xml,ids){
 let previous=-1;
 for(const id of ids){const at=xml.indexOf(`name="${id}"`);assert.ok(at>previous,`${id} must follow ${ids[ids.indexOf(id)-1]??'the slide start'}`);previous=at;}
 for(const id of ids)assert.equal(xml.split(`name="${id}"`).length-1,1,`${id} must be emitted once`);
 const drawingIds=[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/gu)].map(m=>m[1]);
 assert.equal(new Set(drawingIds).size,drawingIds.length,'all drawing IDs remain unique across deferred groups');
}
test('an image-led group stays after preceding independent pictures and before later pictures',t=>{
 const page={shapes:[],images:[image('before'),image('icon','card'),image('after')],textBoxes:[text('label','card')]};
 assertOrder(build(t,page),['before','card','icon','label','after']);
});
test('text-only groups stay among ordinary labels and after independent pictures',t=>{
 const page={shapes:[],images:[image('picture')],textBoxes:[text('before'),text('first','labels'),text('after'),text('second','labels')]};
 assertOrder(build(t,page),['picture','before','labels','first','second','after']);
});
test('interleaved groups preserve the same flattened order as the production grouping proof',t=>{
 const page={shapes:[],images:[image('backdrop'),image('a-icon','a'),image('middle'),image('b-icon','b')],
  textBoxes:[text('plain'),text('b-label','b'),text('a-label','a'),text('tail')]};
 const expected=[...paintOrder(page.shapes,page.images,page.textBoxes)].sort((a,b)=>a[1]-b[1]).map(([item])=>item.id);
 const xml=build(t,page);assertOrder(xml,expected);
 assertOrder(xml,['backdrop','a','middle','b','plain','tail']);
});
test('shape-led groups keep their original first-shape position and all members',t=>{
 const page={shapes:[{id:'body',type:'rect',box,style:{fill:'#FFFFFF'},source:{nativeComponentGroupId:'card'}}],
  images:[image('before'),image('icon','card')],textBoxes:[text('ordinary'),text('label','card')]};
 assertOrder(build(t,page),['card','body','icon','label','before','ordinary']);
});
test('singletons, invalid IDs, and style-only label membership do not reorder independent items',t=>{
 const page={shapes:[],images:[image('first','singleton'),image('second',42),image('third','   ')],
  textBoxes:[text('ordinary'),{...text('one'),style:{nativeComponentGroupId:'labels'}},
   {...text('two'),style:{nativeComponentGroupId:'labels'}},text('last')]};
 const xml=build(t,page);assertOrder(xml,['first','second','third','ordinary','labels','one','two','last']);
 assert.doesNotMatch(xml,/name="singleton"/u);
});
test('explicit empty source groups do not acquire style membership, and groups stay after tables',t=>{
 const page={shapes:[],images:[],tables:[{id:'table',type:'table',box,rows:[['A']]}],
  textBoxes:[{...text('empty',''),style:{nativeComponentGroupId:'labels'}},
   text('first','labels'),text('last','labels')]};
 const xml=build(t,page);assertOrder(xml,['table','empty','labels','first','last']);
 const group=xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];
 assert.ok(group);assert.equal(group.includes('name="empty"'),false);
});
test('empty component lists do not manufacture groups and the regression enters unified CI',t=>{
 assert.doesNotMatch(build(t,{shapes:[],images:[],textBoxes:[]}),/<p:grpSp>/u);
 const {includesSuite}=require('../scripts/test-suites');
 assert.equal(includesSuite('test/openxml-component-group-order-contract.test.js','all'),true);
 assert.equal(includesSuite('test/openxml-component-group-order-contract.test.js','contract'),true);
 const {IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeComponentGroupPlan.cs'));
});
