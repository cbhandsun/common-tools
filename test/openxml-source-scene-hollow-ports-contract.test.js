'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {sourceHollowNodes}=require('./helpers/scene-hollow-nodes.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {buildOpenXmlDecksSync}=require('../packages/slideclone-core/pptx-openxml-dotnet');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
test('hollow source perimeters emit real off-center connection sites without a filled rectangle proxy',{timeout:120000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {image,hints,shaftBox}=sourceHollowNodes(),sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:image.width,heightPx:image.height,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:180}}],
  objects:hints.map((box,i)=>({id:i?'right':'left',regionId:'root',kind:'container',box})),
  relations:[{id:'edge',regionId:'root',fromId:'left',toId:'right',direction:'forward',shaftBox}]};
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:220,heightPt:180}});
 assert.equal(compiled.evidence.resolvedRelations,1);
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:220,heightPt:180},pages:[{...compiled.page,pageIndex:0,tables:[],charts:[]}]}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const arrow=compiled.page.shapes.find(s=>s.id==='scene-edge'),drawing=drawings.find(d=>d.includes('name="scene-edge"'));assert.ok(drawing);
 assert.doesNotMatch(xml,/<p:pic>|<a:prstGeom prst="rect"/u);
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,1);
 for(const [tag,anchor]of [['stCxn',arrow.style.startAnchor],['endCxn',arrow.style.endAnchor]]){
  const target=drawings.find(d=>d.includes('name="'+anchor.elementId+'"'));assert.ok(target);
  const id=target.match(/<p:cNvPr id="(\d+)"/u)?.[1];assert.ok(id);assert.match(drawing,new RegExp('<a:'+tag+' id="'+id+'" idx="\\d+"'));
  assert.match(target,/<a:cxn ang=/u);assert.equal((target.match(/<a:moveTo>/gu)??[]).length,2,'both actual ring paths stay hollow');
 }
});
test('hollow port writer regression is included in contract and complete CI',()=>{
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['contract','all'])assert.equal(includesSuite(__filename,suite),true);
});

test('diagonal visible gaps emit a real native connector and source-bound logical sites in PPTX',{timeout:120000},t=>{
 const {diagonalGapFixture}=require('./helpers/scene-diagonal-gap.cjs'),f=diagonalGapFixture();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'diagonal-gap-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:220,heightPx:220,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:220}}],
  objects:[f.from,f.to].map(n=>({id:'node-'+n.id,regionId:'root',kind:'container',box:n.box})),
  relations:[{id:'edge',regionId:'root',fromId:'node-a',toId:'node-b',direction:'forward',shaftBox:f.shaftBox}]};
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:220,heightPt:220}});
 assert.equal(compiled.evidence.resolvedRelations,1);assert.equal(compiled.evidence.sourceVisibleGaps,1);
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:220,heightPt:220},pages:[{...compiled.page,pageIndex:0,tables:[],charts:[]}]}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const connector=compiled.page.shapes.find(s=>s.id==='scene-edge'),drawing=drawings.find(s=>s.includes('name="scene-edge"'));assert.ok(drawing);
 assert.doesNotMatch(xml,/<p:pic>/u);assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,1);
 assert.equal(connector.source.sourcePhysicalAttachment,false);
 for(const [tag,key]of [['stCxn','startAnchor'],['endCxn','endAnchor']]){
  const anchor=connector.style[key],target=drawings.find(s=>s.includes('name="'+anchor.elementId+'"'));assert.ok(target);
  const id=target.match(/<p:cNvPr id="(\d+)"/u)?.[1];assert.ok(id);assert.match(drawing,new RegExp('<a:'+tag+' id="'+id+'" idx="\\d+"'));
  assert.equal(anchor.siteOffsetKind,'source-visible-diagonal-gap');assert.match(target,/<a:cxn ang=/u);
 }
});

test('a thick source arrow uses one standard Office connector with its measured width and two actual native targets',{timeout:120000},t=>{
 const {filledArrowFixture}=require('./helpers/scene-filled-arrow.cjs'),f=filledArrowFixture();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'filled-arrow-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:256,heightPx:256,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:256,h:256}}],
  objects:[f.from,f.to].map(n=>({id:'node-'+n.id,regionId:'root',kind:'container',box:n.box})),
  relations:[{id:'edge',regionId:'root',fromId:'node-a',toId:'node-b',direction:'forward',shaftBox:f.shaftBox}]};
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:256,heightPt:256}});
 assert.equal(compiled.evidence.resolvedRelations,1);const connector=compiled.page.shapes.find(s=>s.id==='scene-edge');
 assert.equal(connector.type,'line');assert.equal(connector.style.nativePathConnector,undefined);assert.ok(connector.style.strokeWidthPt>5);
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:256,heightPt:256},pages:[{...compiled.page,pageIndex:0,tables:[],charts:[]}]}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const drawing=drawings.find(s=>s.includes('name="scene-edge"'));assert.ok(drawing);assert.match(drawing,/^<p:cxnSp>/u);
 assert.match(drawing,/<a:prstGeom\b/u);assert.match(drawing,/<a:tailEnd[^>]*type="triangle"/u);assert.doesNotMatch(xml,/<p:pic>/u);
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,1);
 for(const [tag,key]of [['stCxn','startAnchor'],['endCxn','endAnchor']]){
  const anchor=connector.style[key],target=drawings.find(s=>s.includes('name="'+anchor.elementId+'"'));assert.ok(target);
  const id=target.match(/<p:cNvPr id="(\d+)"/u)?.[1];assert.ok(id);assert.match(drawing,new RegExp('<a:'+tag+' id="'+id+'" idx="\\d+"'));
 }
});

for(const multi of [false,true])test(`${multi?'multi-part':'single-shape'} pictorial source ports attach the actual native freeform drawings in a real PPTX`,{timeout:120000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pictorial-port-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:180,height:110,rgba:Buffer.alloc(180*110*4,255)},put=(x,y)=>image.rgba.set([30,60,90,255],(y*180+x)*4);
 for(const left of [20,110]){
  for(let y=30;y<65;y++)for(let x=left;x<left+8;x++)put(x,y);
  for(let y=57;y<65;y++)for(let x=left;x<left+25;x++)put(x,y);
  if(multi)for(let y=57;y<65;y++)for(let x=left+10;x<left+25;x++)image.rgba.set([180,40,30,255],(y*180+x)*4);
 }
 for(let x=50;x<=104;x++)for(let y=59;y<=61;y++)put(x,y);
 for(let step=0;step<5;step++)for(let y=60-step;y<=60+step;y++)put(104-step,y);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:180,heightPx:110,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:110}}],
  objects:[20,110].map(left=>({id:'icon-'+left,regionId:'root',kind:'icon',box:{x:left,y:30,w:25,h:35}})),
  relations:[{id:'edge',regionId:'root',fromId:'icon-20',toId:'icon-110',direction:'forward',shaftBox:{x:48,y:53,w:59,h:15}}]};
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:180,heightPt:110}});
 assert.equal(compiled.evidence.resolvedRelations,1);
 if(multi)assert.ok(compiled.page.shapes.length>=5);else assert.equal(compiled.page.shapes.length,3);
 assert.deepEqual(compiled.page.images,[]);
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:180,heightPt:110},pages:[{...compiled.page,pageIndex:0,tables:[],charts:[]}]}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const connector=compiled.page.shapes.find(s=>s.id==='scene-edge'),drawing=drawings.find(s=>s.includes('name="scene-edge"'));assert.ok(drawing);
 assert.doesNotMatch(xml,/<p:pic>|<a:prstGeom prst="rect"/u);
 for(const [tag,key]of [['stCxn','startAnchor'],['endCxn','endAnchor']]){
  const target=drawings.find(s=>s.includes('name="'+connector.style[key].elementId+'"'));assert.ok(target);
  const id=target.match(/<p:cNvPr id="(\d+)"/u)?.[1];assert.ok(id);assert.match(drawing,new RegExp('<a:'+tag+' id="'+id+'" idx="\\d+"'));
  assert.match(target,/<a:cxn ang=/u);
 }
});
