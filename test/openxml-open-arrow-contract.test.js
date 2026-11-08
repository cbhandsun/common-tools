"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const {validateDeckIr}=require('../packages/slideclone-core/deck-ir-admission');

test('open heads remain native open arrows while existing arrow aliases retain triangles',{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-open-head-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const variants=[{value:'openArrow',type:'arrow'},{value:'OPENARROW',type:'arrow'},{value:'triangle',type:'triangle'},
  {value:'arrow',type:'triangle'},{value:'none',type:null},{value:'',type:null},{value:'unknown',type:null},{value:undefined,type:null}];
 const shapes=variants.map(({value},index)=>({id:'connector-'+index,type:'line',box:{x:20,y:30+index*30,w:180,h:0},
  style:{stroke:'#223344',strokeWidthPt:2,...(value===undefined?{}:{startArrow:value,endArrow:value}),startArrowWidth:'small',startArrowLength:'large',endArrowWidth:'large',endArrowLength:'small'}}));
 const deck={version:'1.0',slideSize:{widthPt:240,heightPt:300},pages:[{pageIndex:0,shapes,textBoxes:[],images:[],charts:[],tables:[]}]};
 validateDeckIr(deck,root);
 const ir=path.join(root,'deck.json'),pptx=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));
 runBuilder(['--ir',ir,'--out',pptx,'--powerpoint-safe','true']);
 const xml=readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8'),connectors=xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/gs)||[];
 assert.equal(connectors.length,variants.length);
 for(const [i,{type}]of variants.entries()){
  const part=connectors[i];assert.ok(part.includes('name="connector-'+i+'"'));
  if(type){assert.match(part,new RegExp('<a:headEnd type="'+type+'" w="sm" len="lg"'));assert.match(part,new RegExp('<a:tailEnd type="'+type+'" w="lg" len="sm"'));}
  else assert.doesNotMatch(part,/<a:(headEnd|tailEnd)/);
 }
 assert.doesNotMatch(xml,/<p:pic>/);
});

test('open-arrow builder regression is present in the unified contract suite',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['all','contract'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(p=>p.file.endsWith('openxml-open-arrow-contract.test.js')));
});

test('explicit relationship dimensions match existing OpenXML defaults without changing native geometry',{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-arrow-size-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {flowConnectorShape}=require('../packages/slideclone-core/archetypes/relationship-native-shapes');
 const shape=flowConnectorShape({id:'source'},{box:{x:10,y:20,w:30,h:20}},{box:{x:100,y:20,w:30,h:20}},null,0);
 const previous=structuredClone(shape);delete previous.style.endArrowWidth;delete previous.style.endArrowLength;
 const slides=[];
 for(const [name,line]of [['previous',previous],['explicit',shape]]){
  const deck={version:'1.0',slideSize:{widthPt:200,heightPt:100},pages:[{pageIndex:0,shapes:[line],textBoxes:[],images:[],charts:[],tables:[]}]};
  const ir=path.join(root,name+'.json'),pptx=path.join(root,name+'.pptx');fs.writeFileSync(ir,JSON.stringify(deck));
  validateDeckIr(deck,root);runBuilder(['--ir',ir,'--out',pptx,'--powerpoint-safe','true']);
  slides.push(readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8'));
 }
 assert.equal(slides[0],slides[1]);assert.match(slides[1],/<a:tailEnd type="triangle" w="med" len="med"/);
 assert.match(slides[1],/<p:cxnSp>/);assert.doesNotMatch(slides[1],/<p:pic>/);
});
