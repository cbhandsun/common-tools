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
test('a partially bound source network writes every loop edge once with its source endpoint geometry and keeps ambiguity pending',{timeout:120000},t=>{
 const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const relations=[networkRelations[0],{...networkRelations[1],shaftBox:{x:157,y:97,w:5,h:3}},
  {...networkRelations[0],id:'pending',shaftBox:{x:35,y:45,w:230,h:130}}];
 const compiled=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'native-loop',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},allowUnboundRelations:true});
 assert.equal(compiled.graph.paths.length,2);assert.deepEqual(compiled.unbound,[{id:'pending',reason:'shared-relation-ambiguous'}]);
 const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5',stroke:'none'},source:{editable:true}})),...compiled.parts];
 const deck={version:'1.0',slideSize:{widthPt:300,heightPt:230},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},shapes,textBoxes:[],images:[]}]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'partial-network-xml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');fs.writeFileSync(irFile,JSON.stringify(deck));
 buildOpenXmlDecksSync([{irFile,outFile}],{config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const drawing=id=>{const rows=drawings.filter(d=>d.includes('name="'+id+'"'));assert.equal(rows.length,1,id);return rows[0];};
 const nativeId=id=>drawing(id).match(/<p:cNvPr id="(\d+)"/u)?.[1];
 const used=new Set(compiled.graph.paths.flatMap(p=>p.edges.map(e=>e.id)));assert.ok(compiled.graph.edges.some(e=>!used.has(e.id)));
 for(const edge of compiled.graph.edges){
  const row=drawing(edge.memberId),from=compiled.graph.nodes.find(n=>n.id===edge.from),to=compiled.graph.nodes.find(n=>n.id===edge.to);
  if(row.startsWith('<p:cxnSp>')){
   assert.match(row,new RegExp('<a:stCxn id="'+nativeId(from.nativeId)+'" idx="\\d+"'));
   assert.match(row,new RegExp('<a:endCxn id="'+nativeId(to.nativeId)+'" idx="\\d+"'));
  }else{
   // OpenXML freeforms retain editable path geometry, not Office rerouting.
   assert.ok(nativeId(from.nativeId));assert.ok(nativeId(to.nativeId));assert.match(row,/<a:custGeom\b/u);assert.doesNotMatch(row,/<a:close/u);
   const offset=row.match(/<a:off x="(\d+)" y="(\d+)"/u),extent=row.match(/<a:ext cx="(\d+)" cy="(\d+)"/u);
   const start=row.match(/<a:moveTo><a:pt x="(\d+)" y="(\d+)"/u),last=[...row.matchAll(/<a:lnTo><a:pt x="(\d+)" y="(\d+)"/gu)].at(-1);
   assert.ok(offset&&extent&&start&&last);
   const part=compiled.parts.find(p=>p.id===edge.memberId),points=part.source.nativeRoutePoints;
   for(const [actual,expected]of [[start,points[0]],[last,points.at(-1)]]){
    assert.ok(Math.abs((Number(offset[1])+Number(actual[1])*Number(extent[1])/21600)/12700-expected.x)<.01);
    assert.ok(Math.abs((Number(offset[2])+Number(actual[2])*Number(extent[2])/21600)/12700-expected.y)<.01);
   }
  }
 }
 assert.doesNotMatch(xml,/<p:pic>/u);assert.doesNotMatch(xml,/name="pending"/u);
 assert.equal((xml.match(/<a:tailEnd[^>]*type="triangle"/gu)??[]).length,2);
});
