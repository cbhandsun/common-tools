'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {sharedJunctionFixture}=require('./helpers/scene-shared-junction.cjs');
const {buildOpenXmlDecksSync}=require('../packages/slideclone-core/pptx-openxml-dotnet');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');

test('a shared source junction uses one native trunk and real native targets for every incident Office connector',{timeout:120000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-junction-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixture=sharedJunctionFixture(),irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify(fixture.deck));buildOpenXmlDecksSync([{irFile,outFile}],{config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,5);assert.equal(drawings.filter(d=>d.includes('name="graph-trunk"')).length,1);
 assert.doesNotMatch(xml,/<p:pic>/u);assert.equal((xml.match(/<a:tailEnd[^>]*type="triangle"/gu)??[]).length,2);
 const target=id=>{const row=drawings.find(d=>d.includes('name="'+id+'"'));assert(row,id);return row.match(/<p:cNvPr id="(\d+)"/u)?.[1];};
 for(const edge of fixture.edges){
  const row=drawings.find(d=>d.includes('name="'+edge.id+'"'));assert(row);assert.match(row,/^<p:cxnSp>/u);
  assert.match(row,new RegExp('<a:stCxn id="'+target(edge.from)+'" idx="\\d+"'));
  assert.match(row,new RegExp('<a:endCxn id="'+target(edge.to)+'" idx="\\d+"'));
 }
 const junctionId=target('graph-junction');
 assert.equal((xml.match(new RegExp('<a:(?:stCxn|endCxn) id="'+junctionId+'"','gu'))??[]).length,3);
 assert.equal(new Set(fixture.logicalPaths.flat()).size,5,'the two logical paths share exactly one physical trunk');
});

test('shared junction writer regressions are discovered by contract and full CI',()=>{
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['contract','all'])assert.equal(includesSuite(__filename,suite),true);
});
