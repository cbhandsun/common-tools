'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const {compiler}=require('./helpers/source-route-part-capacity.cjs');
test('the writer retains all sixteen connectors and thirty-two endpoint references at the unchanged route part boundary',()=>{
 const {request,compile,nodes}=compiler(),parts=compile(request),root=fs.mkdtempSync(path.join(os.tmpdir(),'native-route-capacity-'));
 const deck={version:'1.0',slideSize:{widthPt:160,heightPt:90},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
  shapes:[...nodes,...parts],images:[],textBoxes:[],tables:[],charts:[]}]};
 const ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',out]);
 const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString('utf8');
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,16);
 assert.equal((xml.match(/<a:stCxn /gu)??[]).length,16);assert.equal((xml.match(/<a:endCxn /gu)??[]).length,16);
 assert.equal((xml.match(/<a:tailEnd type="triangle"/gu)??[]).length,1);
 const ids=new Set([...xml.matchAll(/<p:cNvPr id="(\d+)"/gu)].map(m=>m[1]));
 for(const match of xml.matchAll(/<a:(?:stCxn|endCxn) id="(\d+)"/gu))assert.ok(ids.has(match[1]));
 for(const part of parts)assert.ok(xml.includes('name="'+part.id+'"'));
 for(const suite of ['contract','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(f=>f.file.replaceAll('\\','/').endsWith('/openxml-native-route-part-capacity-contract.test.js')));
});
