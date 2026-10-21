"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder,invokeBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
function deck(kind='source-visible-gap'){
 return {version:'1.0',slideSize:{widthPt:240,heightPt:180},pages:[{pageIndex:0,textBoxes:[],images:[],tables:[],charts:[],shapes:[
  {id:'a',type:'rect',box:{x:20,y:40,w:50,h:40},style:{fill:'#D2E6F5',stroke:'none'}},
  {id:'b',type:'rect',box:{x:170,y:40,w:50,h:40},style:{fill:'#D2E6F5',stroke:'none'}},
  {id:'route',type:'line',box:{x:74,y:60,w:92,h:0},style:{stroke:'#1E3C5A',strokeWidthPt:2,endArrow:'triangle',
   startAnchor:{elementId:'a',side:'right',position:.5,dxPt:4,dyPt:0,...(kind===null?{}:{siteOffsetKind:kind})},
   endAnchor:{elementId:'b',side:'left',position:.5,dxPt:-4,dyPt:0,...(kind===null?{}:{siteOffsetKind:kind})}}}
 ]}]};
}
test('native visible-gap sites keep real node geometry and connector IDs without a proxy shape', {timeout:60000},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-visible-gap-')),ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck()));
 runBuilder(['--ir',ir,'--out',out]);const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString('utf8');
 assert.equal((xml.match(/<p:sp>/gu)||[]).length,2);assert.equal((xml.match(/<p:cxnSp>/gu)||[]).length,1);assert.doesNotMatch(xml,/<p:pic\b/u);
 assert.match(xml,/<a:off x="254000" y="508000"/u);assert.match(xml,/<a:off x="2159000" y="508000"/u);
 assert.equal((xml.match(/<a:ext cx="635000" cy="508000"/gu)||[]).length,2);
 assert.match(xml,/fmla="\*\/ w 685800 635000"/u);assert.match(xml,/fmla="\*\/ w -50800 635000"/u);
 assert.match(xml,/name="ctPortXn50800"/u);assert.doesNotMatch(xml,/name="ctPort[XY]-/u);
 assert.match(xml,/<a:stCxn id="2" idx="4"/u);assert.match(xml,/<a:endCxn id="3" idx="4"/u);
 const plain=deck(null);fs.writeFileSync(ir,JSON.stringify(plain));runBuilder(['--ir',ir,'--out',path.join(root,'plain.pptx')]);
 assert.doesNotMatch(readZipEntry(path.join(root,'plain.pptx'),'ppt/slides/slide1.xml').toString('utf8'),/<a:(?:stCxn|endCxn)\b/u,'ordinary offsets cannot acquire external attachment authority');
});
test('invalid explicit gap inputs fail rather than silently becoming connected', {timeout:60000},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'invalid-visible-gap-')),ir=path.join(root,'deck.json');
 for(const change of [a=>{a.siteOffsetKind='unknown';},a=>{a.dxPt=-1;},a=>{a.dyPt=1;},a=>{a.dxPt='4';},a=>{a.position=2;},a=>{a.dxPt=100001;}]){
  const data=deck();change(data.pages[0].shapes[2].style.startAnchor);fs.writeFileSync(ir,JSON.stringify(data));
  const result=invokeBuilder(['--ir',ir,'--out',path.join(root,'invalid.pptx')]);assert.notEqual(result.status,0);assert.match(result.stderr,/visible-gap connection site is invalid/u);
 }
});

test('diagonal gap sites retain outward-side, finite-number, position and size boundaries',{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'invalid-diagonal-gap-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ir=path.join(root,'deck.json');
 for(const change of [a=>{a.dxPt=-1;},a=>{a.dyPt='4';},a=>{a.dyPt=null;},a=>{a.dyPt=100001;},a=>{a.dxPt=100001;},a=>{a.position=-.01;},a=>{a.siteOffsetKind={};}]){
  const data=deck('source-visible-diagonal-gap'),anchor=data.pages[0].shapes[2].style.startAnchor;anchor.dyPt=3;change(anchor);
  fs.writeFileSync(ir,JSON.stringify(data));const result=invokeBuilder(['--ir',ir,'--out',path.join(root,'invalid.pptx')]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/visible-gap connection site is invalid/u);
 }
});

test('inward contour sites bind actual freeform nodes with scaling guides and no extra drawings', {timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-contour-sites-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=deck(null),points=[[0,0],[1,0],[1,.25],[.92,.25],[.92,.75],[1,.75],[1,1],[0,1]];
 for(const [index,node]of data.pages[0].shapes.slice(0,2).entries()){
  node.type='freeform';const contour=index?points.map(([x,y])=>[1-x,y]):points;
  node.style.freeformSegments=contour.map(([x,y],i)=>({type:i?'lnTo':'moveTo',points:[{x,y}]})).concat([{type:'close',points:[]}]);
 }
 const line=data.pages[0].shapes[2];line.box={x:66,y:60,w:108,h:0};line.style.startAnchor.dxPt=-4;line.style.endAnchor.dxPt=4;
 const ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(data));runBuilder(['--ir',ir,'--out',out]);
 const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString('utf8');
 assert.equal((xml.match(/<p:sp>/gu)||[]).length,2);assert.equal((xml.match(/<p:cxnSp>/gu)||[]).length,1);assert.doesNotMatch(xml,/<p:pic\b/u);
 assert.match(xml,/<a:stCxn id="2" idx="0"/u);assert.match(xml,/<a:endCxn id="3" idx="0"/u);
 assert.match(xml,/fmla="\*\/ w 584200 635000"/u);assert.match(xml,/fmla="\*\/ w 50800 635000"/u);
 assert.equal((xml.match(/<a:ext cx="635000" cy="508000"/gu)||[]).length,2,'owner extents remain unchanged');
});
