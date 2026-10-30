'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {preserveGroupedShapeGeometry:preserve,preserveAuthoredConnectorGeometry:authored,stageGroupedTextConnections:stage}=require('../packages/slideclone-core/libreoffice-grouped-text-connections');
const {writeStoredZipAtomic,readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
const header='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
const shape='<p:sp><p:nvSpPr><p:cNvPr id="2" name="body" /></p:nvSpPr><p:spPr><a:custGeom><a:cxnLst><a:cxn /></a:cxnLst></a:custGeom></p:spPr></p:sp>';
const edge='<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="3" /><a:stCxn id="2" idx="4" /><a:endCxn id="4" idx="0" /></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="100" y="200" /><a:ext cx="300" cy="400" /></a:xfrm><a:prstGeom prst="line" /></p:spPr></p:cxnSp>';
const xml=header+'<p:grpSp>'+shape+'</p:grpSp>'+edge+'</p:sld>';
function temporaryRoot(t,prefix){const root=createTemp(prefix);t.after(()=>removeTemp(root));return root;}

test('render-only compatibility covers grouped custom-site card shapes without text',()=>{
 const r=preserve(xml);assert.equal(r.connections,1);assert.equal(r.textConnections,0);
 assert.equal(r.xml,xml.replace('<a:stCxn id="2" idx="4" />',''));
 for(const variant of [header+shape+edge+'</p:sld>',xml.replace('<a:cxnLst><a:cxn /></a:cxnLst>','<a:cxnLst />'),
  xml.replace('<a:custGeom>','<a:other>'),xml.replace('<a:xfrm>','<a:other>')])assert.equal(preserve(variant).connections,0);
});

test('nested cards and grouped labels have separate compatibility counts and keep unrelated bindings',()=>{
 const text=shape.replace('id="2"','id="5"').replace('</p:sp>','<p:txBody>label</p:txBody></p:sp>');
 const second=edge.replace('id="3"','id="6"').replace('id="2"','id="5"');
 const r=preserve(header+'<p:grpSp>'+shape+'<p:grpSp>'+text+'</p:grpSp></p:grpSp>'+edge+second+'</p:sld>');
 assert.equal(r.connections,2);assert.equal(r.textConnections,1);
 assert.equal((r.xml.match(/<a:endCxn id="4"/gu)??[]).length,2);
});

test('the source package retains every native binding and only the disposable render copy is adjusted',t=>{
 const root=temporaryRoot(t,'lo-card-port-');
 const source=path.join(root,'source.pptx'),output=path.join(root,'render.pptx');
 writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:xml},{name:'untouched.bin',data:'retained'}]);
 const before=fs.readFileSync(source),r=stage(source,output);
 assert.equal(r.groupedShapeBindingsRenderedAsGeometry,1);assert.equal(r.groupedTextBindingsRenderedAsGeometry,0);
 assert.equal(r.authoredConnectorBindingsRenderedAsGeometry,2);
 assert.deepEqual(fs.readFileSync(source),before);assert.equal(readZipEntryText(output,'ppt/slides/slide1.xml'),authored(xml).xml);
 assert.equal(readZipEntryText(output,'untouched.bin'),'retained');
});

test('card render compatibility rejects ambiguous, hostile and exhausted XML before publishing a staged copy',()=>{
 for(const bad of [null,{},header+'<!DOCTYPE x>'+xml,xml.replace('</p:grpSp>',''),xml.replace('id="3"','id="2"'),
  header+'<p:grpSp>'.repeat(33),header+'<p:cNvPr />'.repeat(100001),'x'.repeat(4*1024*1024+1)])assert.throws(()=>preserve(bad),TypeError);
});

test('card render compatibility is included in the unified integration gate',()=>{
 for(const suite of ['integration','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/libreoffice-grouped-card-connections.test.js'));
});

test('actual writer card groups retain their native attachments while render staging preserves authored geometry',{timeout:60000},t=>{
 const root=temporaryRoot(t,'lo-real-card-port-');
 const {writePng}=require('../packages/slideclone-core/png'),{runBuilder}=require('./helpers/openxml-contract-fixtures');
 const asset=path.join(root,'icon.png');writePng(asset,{width:8,height:8,rgba:Buffer.alloc(8*8*4,255)});
 const pages=[30,130].map((x,index)=>({pageIndex:index,images:[{id:'picture',type:'image',assetPath:'icon.png',
  box:{x:x+20,y:60,w:18,h:18},source:{editable:false,nativeComponentGroupId:'card'}}],textBoxes:[],tables:[],charts:[],shapes:[
  {id:'body',type:'rect',box:{x,y:40,w:80,h:100},style:{fill:'#FDF6F2',stroke:'none'},source:{nativeComponentGroupId:'card'}},
  {id:'target',type:'rect',box:{x:250,y:20,w:30,h:25},style:{fill:'#E1EBE6',stroke:'none'}},
  {id:'route',type:'line',box:{x:x+28,y:40,w:222-x,h:-20},style:{stroke:'#C43C11',strokeWidthPt:2,
   startAnchor:{elementId:'body',side:'top',position:.35},endAnchor:{elementId:'target',side:'left',position:0}}}
 ]}));
 const source=path.join(root,'native.pptx'),output=path.join(root,'render.pptx'),ir=path.join(root,'deck.json');
 fs.writeFileSync(ir,JSON.stringify({version:'1.0',slideSize:{widthPt:300,heightPt:200},pages}));runBuilder(['--ir',ir,'--out',source]);
 const before=fs.readFileSync(source),summary=stage(source,output);
 assert.equal(summary.groupedShapeBindingsRenderedAsGeometry,2);assert.equal(summary.groupedTextBindingsRenderedAsGeometry,0);
 assert.equal(summary.authoredConnectorBindingsRenderedAsGeometry,4);
 assert.deepEqual(fs.readFileSync(source),before);
 for(const index of [1,2]){
  const original=readZipEntryText(source,`ppt/slides/slide${index}.xml`),staged=readZipEntryText(output,`ppt/slides/slide${index}.xml`);
  assert.match(original,/<p:grpSp>/u);assert.match(original,/<a:stCxn\b/u);assert.match(original,/<a:endCxn\b/u);
  assert.equal(staged,original.replace(/<a:(?:stCxn|endCxn)\b[^>]*\/>/gu,''));
 }
});

test('static rendering freezes root and grouped native attachments only when authored transforms exist',()=>{
 for(const content of [xml,header+shape+edge+'</p:sld>']){
  const r=authored(content);assert.equal(r.connections,2);
  assert.equal(r.xml,content.replace(/<a:(?:stCxn|endCxn)\b[^>]*\/>/gu,''));
 }
 for(const content of ['',xml.replace('<a:xfrm>','<a:other>')])assert.equal(authored(content).connections,0);
});

test('grouped card staging fixture cleanup survives transient directory scan failures',t=>{
 const root=temporaryRoot(t,'lo-card-port-'),rmdir=fs.rmdirSync;
 writeStoredZipAtomic(path.join(root,'source.pptx'),[{name:'ppt/slides/slide1.xml',data:xml}]);
 let attempts=0;
 try{
  t.mock.method(fs,'rmdirSync',(target,...args)=>{
   if(target===root&&++attempts<=2)throw Object.assign(new Error('controlled transient scan'),{code:'ENOTEMPTY'});
   return rmdir(target,...args);
  });
  removeTemp(root);assert.ok(attempts>=3);assert.equal(fs.existsSync(root),false);
 }finally{t.mock.restoreAll();}
});
