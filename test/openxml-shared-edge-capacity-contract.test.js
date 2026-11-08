'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const {sharedEdgeCapacityFixture}=require('./helpers/source-shared-edge-capacity.cjs');

test('the actual writer preserves all long shared-edge segments and references within the existing whole-network budget',t=>{
 const f=sharedEdgeCapacityFixture(),{output}=f.compile(),root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-edge-capacity-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const shapes=[...f.input.nodes.map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5'}})),...output.parts];
 const deck={version:'1.0',slideSize:{widthPt:300,heightPt:210},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
  shapes,images:[],textBoxes:[],tables:[],charts:[]}]};
 const ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',out]);
 const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString('utf8'),lines=output.parts.filter(p=>p.type==='line');
 assert.ok(lines.length>18);assert.ok(output.parts.length<=60);
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,lines.length);
 for(const field of ['stCxn','endCxn'])assert.equal((xml.match(new RegExp('<a:'+field+' ','gu'))??[]).length,lines.length);
 const ids=new Set([...xml.matchAll(/<p:cNvPr id="(\d+)"/gu)].map(m=>m[1]));
 for(const match of xml.matchAll(/<a:(?:stCxn|endCxn) id="(\d+)"/gu))assert.ok(ids.has(match[1]));
 for(const part of output.parts)assert.ok(xml.includes('name="'+part.id+'"'));
 for(const suite of ['contract','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/openxml-shared-edge-capacity-contract.test.js'));
});
