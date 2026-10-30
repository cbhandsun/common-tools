"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
test('actual PPT preserves explicit solid and every supported native dash pattern',()=>{
 const patterns=['solid','dash','dot','dashdot','dashdotdot','largedash','largedashdot','largedashdotdot','systemdash','systemdashdot','systemdashdotdot'];
 const expected=['solid','dash','dot','dashDot','dashDot','lgDash','lgDashDot','lgDashDotDot','sysDash','sysDashDot','sysDashDotDot'];
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-dash-'));
 const deck={version:'1.0',slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
  shapes:patterns.map((dash,i)=>({id:'line-'+i,type:'rect',box:{x:i*60,y:20,w:50,h:50},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,dash}})),
  textBoxes:[],images:[],tables:[],charts:[]}]};
 const ir=path.join(root,'deck.json'),pptx=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',pptx]);
 const xml=readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8');
 const actual=[...xml.matchAll(/<a:prstDash val="([^"]+)"/gu)].map(m=>m[1]);assert.deepEqual(actual,expected);
});

test('source dash export preserves complete observed runs and rejects unsafe or ambiguous pattern controls',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-dash-'));
 const pattern='[[4,2.5],[5,3],[4,0.3333333333333333]]';
 const make=style=>({version:'1.0',slideSize:{widthPt:240,heightPt:180},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
  shapes:[{id:'observed-dashes',type:'line',box:{x:20,y:60,w:150,h:0},style:{fill:'none',stroke:'#123456',strokeWidthPt:3,strokeDashPattern:pattern,...style}}],textBoxes:[],images:[],tables:[],charts:[]}]});
 const build=(deck,name)=>{const ir=path.join(root,name+'.json'),pptx=path.join(root,name+'.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',pptx]);return pptx;};
 const xml=readZipEntry(build(make({}),'valid'),'ppt/slides/slide1.xml').toString('utf8');
 assert.match(xml,/<a:custDash>/u);assert.match(xml,/<a:ds d="400000" sp="250000"/u);assert.match(xml,/<a:ds d="500000" sp="300000"/u);
 assert.match(xml,/<a:ds d="400000" sp="33333"/u);assert.doesNotMatch(xml,/<a:prstDash/u);
 for(const [i,style] of [{strokeDashPattern:'[]'},{strokeDashPattern:'null'},{strokeDashPattern:'[[0,1],[1,1]]'},
  {strokeDashPattern:'[[1,-1],[1,1]]'},{strokeDashPattern:'[[1,513],[1,1]]'},{strokeDashPattern:'[[1e999,1],[1,1]]'},
  {strokeDashPattern:'[[1,1,1],[1,1]]'},{strokeDashPattern:'{invalid'},{strokeDashPattern:Array(2).fill([1,1])},
  {dash:'solid'}].entries())assert.throws(()=>build(make(style),'invalid-'+i));
});

test('actual directed source-dash export retains every opaque or covered interval, complete terminal and real node anchors',()=>{
 const {fixture,coveredFixture}=require('./helpers/source-directed-dashes.cjs');
 const {measureSourceSceneVisibleGap:measure}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
 const {compileSourceSceneVisibleGap:compile}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'directed-source-dash-'));
 for(const covered of [false,true])for(const vertical of [false,true])for(const reversed of [false,true]){
  const f=(covered?coveredFixture:fixture)(vertical),from=reversed?f.to:f.from,to=reversed?f.from:f.to,direction=reversed?'backward':'forward';
  const result=measure({...f,from,to,direction});assert.ok(result.fit,result.reason);
  const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction};
  const shape=compile({fit:result.fit,relation,fromId:from.id,toId:to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
  const deck={version:'1.0',slideSize:{widthPt:240,heightPt:180},pages:[{pageIndex:0,sourceImage:'',background:{fill:'#FFFFFF'},
   shapes:[f.from,f.to].map(node=>({...node,type:'rect',style:{fill:'#D2E6F5'}})).concat(shape),textBoxes:[],images:[],tables:[],charts:[]}]};
  const ir=path.join(root,`${covered}-${vertical}-${reversed}.json`),pptx=path.join(root,`${covered}-${vertical}-${reversed}.pptx`);
  fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',pptx]);
  const xml=readZipEntry(pptx,'ppt/slides/slide1.xml').toString('utf8');
  const actual=[...xml.matchAll(/<a:ds d="(\d+)" sp="(\d+)"/gu)].map(m=>[Number(m[1]),Number(m[2])]);
  assert.deepEqual(actual,JSON.parse(shape.style.strokeDashPattern).map(pair=>pair.map(n=>Math.round(n*100000))));
  assert.equal(actual.length,f.dashes.length+1,'the complete terminal is included as the final or first physical run');
  assert.match(xml,reversed?/<a:headEnd type="triangle"/u:/<a:tailEnd type="triangle"/u);
  assert.match(xml,/<a:stCxn id="\d+" idx="\d+"/u);assert.match(xml,/<a:endCxn id="\d+" idx="\d+"/u);
 }
});
