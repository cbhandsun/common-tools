'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
const {invokeBuilder,runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
function fixture(){
 const node=(id,x)=>({id,type:'rect',box:{x,y:20,w:40,h:30},style:{fill:'#FFFFFF'}});
 return {version:'1.0',slideSize:{widthPt:300,heightPt:150},pages:[{pageIndex:0,sourceImage:'',images:[],textBoxes:[],tables:[],charts:[],
  shapes:[node('a',10),node('b',150),{id:'route',type:'line',box:{x:50,y:35,w:100,h:0},
   style:{stroke:'#123456',startAnchor:{elementId:'a',side:'right',position:.5},endAnchor:{elementId:'b',side:'left',position:.5}},
   source:{nativeConnectorRoute:true,sceneRelationId:'relationship',sourceRouteParts:1}}]}]};
}
function build(t,deck,name='deck'){
 const root=createTemporaryTestDirectory('native-relationship-attachment-');t.after(()=>removeTemporaryTestDirectory(root));
 const ir=path.join(root,name+'.json'),output=path.join(root,name+'.pptx');
 fs.writeFileSync(ir,JSON.stringify(deck));return {ir,output};
}
test('complete native relation export requires two actual writer attachments, including output-grouped endpoints',t=>{
 const deck=fixture(),page=deck.pages[0];
 page.textBoxes=[{id:'label',text:'Node',box:{x:12,y:22,w:20,h:10}}];
 page.outputEditGroups=[{id:'node',members:['a','label']}];
 const files=build(t,deck);runBuilder(['--ir',files.ir,'--out',files.output]);
 const xml=readZipEntryText(files.output,'ppt/slides/slide1.xml');
 assert.equal((xml.match(/<p:cxnSp>/gu)||[]).length,1);
 assert.equal((xml.match(/<a:stCxn /gu)||[]).length,1);assert.equal((xml.match(/<a:endCxn /gu)||[]).length,1);
});
test('missing, unsupported and self-referencing endpoints cannot silently export a complete native relation',t=>{
 for(const [index,change]of [
  p=>delete p.shapes[2].style.startAnchor,p=>delete p.shapes[2].style.endAnchor,
  p=>p.shapes[2].style.startAnchor.elementId='missing',p=>p.shapes[2].style.endAnchor.elementId='route',
  p=>p.shapes[2].style.startAnchor.side='unknown',p=>p.shapes[2].style.startAnchor.position=2,
  p=>{p.shapes[0].type='ellipse';p.shapes[2].style.startAnchor.position=.25;},
  p=>p.shapes[2].type='freeform',p=>p.shapes.push(structuredClone(p.shapes[0])),
  p=>p.shapes[2].source.sceneRelationId='',p=>p.shapes[2].source.sceneRelationId=null,
  p=>p.shapes[2].style.startAnchor.position='0.5',p=>p.shapes[2].style.startAnchor.dxPt=1e308,
  p=>p.shapes[2].style.endAnchor={},p=>p.shapes[2].style.endAnchor=null
 ].entries()){
  const deck=fixture();change(deck.pages[0]);const files=build(t,deck,'invalid-'+index);
  const result=invokeBuilder(['--ir',files.ir,'--out',files.output]);
  assert.notEqual(result.status,0,`case ${index}`);
  assert.match(result.stderr+result.stdout,/Native relationship attachments are invalid/u,`case ${index} must fail for the attachment contract`);
  assert.equal(fs.existsSync(files.output),false);
 }
});
test('one claimed complete relation cannot retain another visible fragment or second complete connector',t=>{
 for(const fragment of [false,true]){
  const deck=fixture(),page=deck.pages[0],extra=structuredClone(page.shapes[2]);extra.id='duplicate';
  if(fragment){extra.source.nativeConnectorRoute=false;extra.source.sourceRouteParts=2;}
  page.shapes.push(extra);const files=build(t,deck);
  const result=invokeBuilder(['--ir',files.ir,'--out',files.output]);assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/Native relationship attachments are invalid/u);assert.equal(fs.existsSync(files.output),false);
 }
});
test('legacy multiple-part routes and ordinary unclaimed drawings keep their compatibility path',t=>{
 for(const claim of ['legacy','ordinary']){
  const deck=fixture(),part=deck.pages[0].shapes[2];
  if(claim==='legacy')part.source.sourceRouteParts=2;else delete part.source;
  delete part.style.startAnchor;const files=build(t,deck);runBuilder(['--ir',files.ir,'--out',files.output]);
  assert.ok(fs.existsSync(files.output));
 }
});
test('semantic direct relationships require actual bindings even without route fitting metadata',t=>{
 for(const kind of ['visible-gap-logical','source-body-contact'])for(const invalid of [false,true]){
  const deck=fixture(),part=deck.pages[0].shapes[2];
  part.source={sceneRelationId:'relationship',semanticNativeStructure:true,role:'relationship',sourceAttachmentKind:kind};
  if(invalid)delete part.style.endAnchor;
  const files=build(t,deck),result=invokeBuilder(['--ir',files.ir,'--out',files.output]);
  if(invalid){assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/Native relationship attachments are invalid/u);assert.equal(fs.existsSync(files.output),false);}
  else assert.equal(result.status,0,result.stderr);
 }
});
test('native relation attachment contracts enter unified contract and all CI gates',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['contract','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/openxml-native-relationship-attachments-contract.test.js'));
});
