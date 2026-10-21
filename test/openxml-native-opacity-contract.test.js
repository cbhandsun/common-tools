"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {compactNativeOpacityDefaults}=require('../packages/slideclone-core/native-opacity-defaults');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('actual native OpenXML is identical before and after opaque default compaction',()=>{
 const deck={version:'1.0',slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
  shapes:[{id:'panel',type:'rect',box:{x:10,y:10,w:100,h:100},style:{fill:'#102030',stroke:'#506070',opacity:1}}],
  images:[],tables:[],charts:[],textBoxes:[
   {id:'opaque',text:'Native',box:{x:15,y:15,w:80,h:30},font:{family:'Arial',sizePt:12,color:'#000000',opacity:1},style:{opacity:1}},
   {id:'override',text:'Override',box:{x:15,y:60,w:80,h:30},font:{family:'Arial',sizePt:12,color:'#000000',opacity:.25},style:{opacity:1}}]}]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opaque-defaults-')),xml=[];
 for(const kind of ['before','after']){
  const input=structuredClone(deck);if(kind==='after')compactNativeOpacityDefaults(input);
  const ir=path.join(root,kind+'.json'),pptx=path.join(root,kind+'.pptx');fs.writeFileSync(ir,JSON.stringify(input));
  runBuilder(['--ir',ir,'--out',pptx]);xml.push(readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8'));
 }
 assert.equal(xml[0],xml[1]);
});

