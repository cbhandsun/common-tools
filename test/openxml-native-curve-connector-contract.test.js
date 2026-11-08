'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
test('native curve connector presets preserve actual Office topology and arrowheads without invisible controls',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-curve-contract-'));
 const shapes=[{id:'from',type:'rect',box:{x:20,y:30,w:40,h:40},style:{fill:'#EEEEEE',stroke:'#999999'}},
  {id:'to',type:'rect',box:{x:250,y:200,w:40,h:40},style:{fill:'#EEEEEE',stroke:'#999999'}}];
 for(const n of [2,3,4,5])shapes.push({id:'curve-'+n,type:'line',box:{x:60,y:50,w:210,h:150},style:{fill:'none',stroke:'#1769D5',strokeWidthPt:3,
  connectorType:'curved-'+n,startAnchor:{elementId:'from',side:'right',position:.5},endAnchor:{elementId:'to',side:'top',position:.5},endArrow:'triangle'}});
 const deck={version:'1.0',slideSize:{widthPt:320,heightPt:280},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},shapes,textBoxes:[],images:[],tables:[],charts:[]}]};
 const ir=path.join(root,'deck.json'),pptx=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',pptx]);
 const xml=readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8');
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,4);
 for(const n of [2,3,4,5])assert.match(xml,new RegExp('prst="curvedConnector'+n+'"','u'));
 assert.equal((xml.match(/<a:stCxn /gu)??[]).length,4);assert.equal((xml.match(/<a:endCxn /gu)??[]).length,4);
 assert.equal((xml.match(/<a:tailEnd type="triangle"/gu)??[]).length,4);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'contract').some(f=>f.file.replaceAll('\\','/')==='test/openxml-native-curve-connector-contract.test.js'));
});

test('native curve adjustments preserve bounded signed Office guide values and reject malformed controls',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-curve-adjustments-'));
 const shape={id:'curve',type:'line',box:{x:10,y:10,w:100,h:100},style:{stroke:'#1769D5',connectorType:'curved-4',connectorAdjustments:[-51200,1800]}};
 const deck={version:'1.0',slideSize:{widthPt:200,heightPt:200},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},shapes:[shape],textBoxes:[],images:[],tables:[],charts:[]}]};
 const ir=path.join(root,'deck.json'),pptx=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',pptx]);
 const xml=readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8');
 assert.match(xml,/<a:gd name="adj1" fmla="val -51200"/u);assert.match(xml,/<a:gd name="adj2" fmla="val 1800"/u);
 for(const invalid of [null,[],[1],[1,2,3],['1',2],[2147483648,2],{adj1:1}]){
  shape.style.connectorAdjustments=invalid;fs.writeFileSync(ir,JSON.stringify(deck));assert.throws(()=>runBuilder(['--ir',ir,'--out',pptx]),/failed|invalid/iu);
 }
});
