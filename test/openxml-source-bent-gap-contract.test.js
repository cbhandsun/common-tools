'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./helpers/source-bent-gap.cjs');
const {measureSourceSceneVisibleGap}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {buildOpenXmlDecksSync}=require('../packages/slideclone-core/pptx-openxml-dotnet');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
test('source-proven elbow exports real Office attachments to actual text shapes in every quadrant',{timeout:120000},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-bent-gap-contract-')),pages=[];
 for(const flipX of [false,true])for(const flipY of [false,true]){
  const f=fixture(flipX,flipY),observed=measureSourceSceneVisibleGap(f);assert.ok(observed.fit,observed.reason);
  const line=compileSourceSceneVisibleGap({fit:observed.fit,relation:f.relation,fromId:f.from.id,toId:f.to.id,width:260,height:220,
   slideSize:{widthPt:260,heightPt:220},fromTextEndpoint:f.from.portFrame,toTextEndpoint:f.to.portFrame});
  pages.push({pageIndex:pages.length,shapes:[line],textBoxes:f.texts.map(t=>({...t,font:{family:'Arial',sizePt:12}})),images:[],tables:[],charts:[]});
 }
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:260,heightPt:220},pages}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'../skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 for(let i=0;i<pages.length;i++){
  const xml=readZipEntryText(outFile,`ppt/slides/slide${i+1}.xml`);
  const connector=xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/s)?.[0];assert.ok(connector);
  assert.equal((xml.match(/<p:cxnSp>/g)??[]).length,1);
  assert.match(connector,/<a:prstGeom prst="bentConnector3"/);
  assert.match(connector,/<a:gd name="adj1" fmla="val 100000"/);
  assert.match(connector,new RegExp(`flipH="${i>=2?1:0}" flipV="${i%2===0?1:0}"`));
  const id=name=>xml.match(new RegExp(`<p:cNvPr id="(\\d+)" name="${name}"`))?.[1];
  assert.ok(id('text-0'));assert.ok(id('text-1'));
  assert.match(connector,new RegExp(`<a:stCxn id="${id('text-0')}"`));
  assert.match(connector,new RegExp(`<a:endCxn id="${id('text-1')}"`));
  assert.match(connector,/<a:tailEnd type="triangle"/);
 }
});
