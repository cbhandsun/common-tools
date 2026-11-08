'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {preserveGroupedTextGeometry:preserve,stageGroupedTextConnections:stage}=require('../packages/slideclone-core/libreoffice-grouped-text-connections');
const {writeStoredZipAtomic,readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
const header='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
const child='<p:sp><p:nvSpPr><p:cNvPr id="2" name="text" /></p:nvSpPr><p:spPr><a:custGeom><a:cxnLst><a:cxn /></a:cxnLst></a:custGeom></p:spPr><p:txBody>Text</p:txBody></p:sp>';
const edge='<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="3" /><a:stCxn id="2" idx="4" /><a:endCxn id="4" idx="0" /></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="100" y="200" /><a:ext cx="300" cy="400" /></a:xfrm><a:prstGeom prst="line" /></p:spPr></p:cxnSp>';
const xml=header+'<p:grpSp>'+child+'</p:grpSp>'+edge+'</p:sld>';
test('LibreOffice copy preserves authored geometry and all other drawing properties',()=>{
 const r=preserve(xml);assert.equal(r.connections,1);assert.equal(r.xml,xml.replace('<a:stCxn id="2" idx="4" />',''));
 for(const variant of [header+child+edge+'</p:sld>',xml.replace('<p:txBody>Text</p:txBody>',''),xml.replace('<a:custGeom>','<a:other>'),xml.replace('<a:xfrm>','<a:other>')])assert.equal(preserve(variant).connections,0);
 assert.deepEqual(preserve(''),{xml:'',connections:0});
});
test('renderer XML rejects unsafe, ambiguous, malformed and oversized group inputs',()=>{
 for(const bad of [header+'<!DOCTYPE x>'+xml,xml.replace('</p:grpSp>',''),xml.replace('</p:sp>',''),xml.replace('id="3"','id="2"'),header+'<p:grpSp>'.repeat(33),header+'<p:cNvPr />'.repeat(100001),'x'.repeat(4*1024*1024+1)])assert.throws(()=>preserve(bad),TypeError);
});
test('render staging retains original binding bytes and rewrites only the rendering copy',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lo-group-port-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source.pptx'),output=path.join(root,'staged.pptx');writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:xml},{name:'untouched.bin',data:'retained'}]);
 const before=fs.readFileSync(source),summary=stage(source,output);assert.equal(summary.groupedTextBindingsRenderedAsGeometry,1);
 assert.equal(summary.authoredConnectorBindingsRenderedAsGeometry,2);assert.deepEqual(fs.readFileSync(source),before);
 assert.equal(readZipEntryText(output,'ppt/slides/slide1.xml'),xml.replace(/<a:(?:stCxn|endCxn)\b[^>]*\/>/gu,''));
 assert.equal(readZipEntryText(output,'untouched.bin'),'retained');assert.throws(()=>stage(source,source),TypeError);
 writeStoredZipAtomic(source,[{name:'ppt/presentation.xml',data:'empty'}]);stage(source,output);assert.deepEqual(fs.readFileSync(source),fs.readFileSync(output));
 fs.writeFileSync(source,'invalid');assert.throws(()=>stage(source,output));
});
test('renderer compatibility regression belongs to unified CI',()=>assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'integration').some(f=>f.file.replaceAll('\\','/')==='test/libreoffice-grouped-text-connections.test.js')));
