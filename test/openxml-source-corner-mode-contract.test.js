'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder,createMinimalDeckIr}=require('./helpers/openxml-contract-fixtures');
const {sourceRoundedRouteFixture}=require('./helpers/source-rounded-route.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {readZipEntry}=require('../packages/ooxml-core/pptx-inventory');
const {decodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');

// Validate the whole emitted path. A measured arm can consist entirely of
// cubics, so requiring an incidental straight segment rejects valid geometry.
function assertOpenPath(block,shape){
 const pathBody=block.match(/<a:path\s[^>]*>([\s\S]*?)<\/a:path>/u)?.[1];assert.ok(pathBody);
 assert.doesNotMatch(pathBody,/<a:close/u);
 const actual=[...pathBody.matchAll(/<a:(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/a:\1>/gu)]
  .map(m=>({type:m[1],points:[...m[2].matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"\s*\/>/gu)].map(p=>({x:Number(p[1]),y:Number(p[2])}))}));
 const segments=typeof shape.style.freeformPath==='string'?decodeNativeFreeformPath(shape.style.freeformPath):shape.style.freeformSegments;
 assert.ok(Array.isArray(segments)&&segments.length>1);
 const round=n=>{const f=Math.floor(n),d=n-f;return d===.5?(f%2===0?f:f+1):Math.round(n);};
 const expected=segments.map(s=>({type:s.type,points:s.points.map(p=>({x:round(p.x*21600),y:round(p.y*21600)}))}));
 assert.deepEqual(actual,expected,shape.id);
 assert.equal(pathBody.replace(/<a:(\w+)(?:\s[^>]*)?>[\s\S]*?<\/a:\1>/gu,'').trim(),'');
}
test('real source compilation writes open cubic gradients and native arrows, or attached reroutable connectors',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-corner-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const reverse of [false,true])for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const f=sourceRoundedRouteFixture({gradient:true,reverse}),measured=measureSourceSceneRoute(f);assert.ok(measured.fit,measured.reason);
  const deck=createMinimalDeckIr('');deck.slideSize={widthPt:240,heightPt:180};deck.pages[0].textBoxes=[];
  const shapes=compileSourceSceneRoute({fit:measured.fit,relation:{id:'rounded',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
   fromId:f.from.id,toId:f.to.id,widthPx:240,heightPx:180,slideSize:deck.slideSize,connectorCornerMode:mode});
  deck.pages[0].shapes=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5',stroke:'none'}})).concat(shapes);
  const stem=path.join(root,mode+(reverse?'-reverse':'')),input=stem+'.json',out=stem+'.pptx';fs.writeFileSync(input,JSON.stringify(deck));runBuilder(['--ir',input,'--out',out]);
  const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString();assert.match(xml,/<a:gradFill/);assert.match(xml,/<a:tailEnd[^>]*type="triangle"/);
  if(mode==='reroutable-elbow'){
   assert.match(xml,/<p:cxnSp>/);assert.match(xml,/<a:stCxn /);assert.match(xml,/<a:endCxn /);assert.doesNotMatch(xml,/cubicBezTo/);
  }else{
   assert.match(xml,/<a:custGeom\b/);assert.match(xml,/<a:cubicBezTo>/);assert.doesNotMatch(xml,/<p:cxnSp>/);assert.doesNotMatch(xml,/<a:close/);
   assert.match(xml,/<a:lin[^>]*ang="5400000"/);
  }
 }
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'contract'));assert.ok(includesSuite(__filename,'all'));
});

test('every measured physical cycle arm survives actual OpenXML output with its declared endpoint geometry',t=>{
 const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-network-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const deck=createMinimalDeckIr('');deck.slideSize={widthPt:300,heightPt:230};deck.pages[0].textBoxes=[];
  const {parts,graph}=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:networkRelations,id:'shared-cycle',
   sourceHash:'a'.repeat(64),slideSize:deck.slideSize,connectorCornerMode:mode});
  assert.equal(graph.topology,'source-network-v1');assert.equal(graph.edges.length,graph.nodes.length);
  deck.pages[0].shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5',stroke:'none'}})),...parts];
  const input=path.join(root,mode+'.json'),out=path.join(root,mode+'.pptx');fs.writeFileSync(input,JSON.stringify(deck));runBuilder(['--ir',input,'--out',out]);
  const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString(),connectors=xml.match(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu)??[];
  assert.equal(connectors.length,parts.filter(p=>p.type==='line').length);
  for(const connector of connectors){assert.match(connector,/<a:stCxn /u);assert.match(connector,/<a:endCxn /u);}
  const freeforms=parts.filter(p=>p.type==='freeform');
  if(mode==='reroutable-elbow')assert.equal(freeforms.length,0);
  else assert.ok(freeforms.length>0);
  const blocks=xml.match(/<p:sp>[\s\S]*?<\/p:sp>/gu)??[];
  for(const shape of freeforms){
   const block=blocks.find(b=>b.includes('name="'+shape.id+'"'));assert.ok(block);
   assert.match(block,/<a:custGeom\b/u);assertOpenPath(block,shape);
  }
  assert.equal((xml.match(/<a:tailEnd[^>]*type="triangle"/gu)??[]).length,2);
  for(const edge of graph.edges)assert.ok(xml.includes('name="'+edge.memberId+'"'),edge.memberId);
 }
});

test('the complete open-path contract rejects changed controls, segment kinds and missing commands',()=>{
 const shape={id:'curve',style:{freeformSegments:[{type:'moveTo',points:[{x:0,y:0}]},
  {type:'cubicBezTo',points:[{x:.25,y:0},{x:1,y:.75},{x:1,y:1}]}]}};
 const block='<a:path w="21600" h="21600"><a:moveTo><a:pt x="0" y="0" /></a:moveTo>'
  +'<a:cubicBezTo><a:pt x="5400" y="0" /><a:pt x="21600" y="16200" /><a:pt x="21600" y="21600" /></a:cubicBezTo></a:path>';
 assertOpenPath(block,shape);
 for(const changed of [block.replace('x="5400"','x="5401"'),block.replaceAll('cubicBezTo','lnTo'),
  block.replace(/<a:cubicBezTo>[\s\S]*?<\/a:cubicBezTo>/u,''),block.replace('</a:path>','<a:close /></a:path>')])
  assert.throws(()=>assertOpenPath(changed,shape),assert.AssertionError);
});

test('source spatial transitions retain every native gradient stop in real rounded and reroutable OpenXML',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-spatial-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const reverse of [false,true])for(const mode of ['auto','reroutable-elbow']){
  const f=sourceRoundedRouteFixture({gradient:'spatial-knots',reverse}),measured=measureSourceSceneRoute(f);assert.ok(measured.fit,measured.reason);
  const deck=createMinimalDeckIr('');deck.slideSize={widthPt:240,heightPt:180};deck.pages[0].textBoxes=[];
  const shapes=compileSourceSceneRoute({fit:measured.fit,relation:{id:'transition',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
   fromId:f.from.id,toId:f.to.id,widthPx:240,heightPx:180,slideSize:deck.slideSize,connectorCornerMode:mode});
  assert.equal(shapes.length,1);const gradient=shapes[0].style.strokeGradient;assert.ok(gradient.stops.length>2&&gradient.stops.length<=6);
  deck.pages[0].shapes=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5',stroke:'none'}})).concat(shapes);
  const input=path.join(root,mode+'-'+reverse+'.json'),out=input+'.pptx';fs.writeFileSync(input,JSON.stringify(deck));runBuilder(['--ir',input,'--out',out]);
  const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString();
  const paint=xml.match(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/u)?.[0];assert.ok(paint);
  assert.equal((paint.match(/<a:gs\b/gu)??[]).length,gradient.stops.length);
  for(const stop of gradient.stops)assert.ok(paint.includes('val="'+stop.color.slice(1)+'"'));
  assert.match(xml,/<a:tailEnd[^>]*type="triangle"/u);
  if(mode==='auto'){assert.match(xml,/<a:cubicBezTo>/u);assert.match(paint,/<a:lin[^>]*ang="5400000"/u);}
  else{assert.match(xml,/<p:cxnSp>/u);assert.match(xml,/<a:stCxn /u);assert.match(xml,/<a:endCxn /u);}
 }
});

test('a measured filled footprint keeps both source colors and attached visible links in actual OpenXML',t=>{
 const f=require('./helpers/source-filled-fringe.cjs').sourceFilledFringeFixture(),measured=measureSourceSceneRoute(f);
 assert.ok(measured.fit?.filledBody,measured.reason);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-filled-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const connectorCornerMode of ['auto','rounded-freeform','reroutable-elbow']){
  const deck=createMinimalDeckIr('');deck.slideSize={widthPt:240,heightPt:180};deck.pages[0].textBoxes=[];
  const shapes=compileSourceSceneRoute({fit:measured.fit,relation:{id:'fringe',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
   fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:deck.slideSize,connectorCornerMode});
  assert.equal(shapes.length,4);
  deck.pages[0].shapes=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5',stroke:'none'}})).concat(shapes);
  const input=path.join(root,connectorCornerMode+'.json'),out=input+'.pptx';fs.writeFileSync(input,JSON.stringify(deck));runBuilder(['--ir',input,'--out',out]);
  const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString(),blocks=xml.match(/<p:sp>[\s\S]*?<\/p:sp>/gu)??[];
  const ids=new Map([...xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]+)"/gu)].map(m=>[m[2],m[1]]));
  for(const body of shapes.filter(s=>s.type==='freeform')){
   const block=blocks.find(b=>b.includes('name="'+body.id+'"'));assert.ok(block);assert.match(block,/<a:close/u);
   assert.ok(block.includes('val="'+body.style.fill.slice(1).toUpperCase()+'"'));assert.match(block,/<a:ln[^>]*>[\s\S]*?<a:noFill/u);
  }
  const links=xml.match(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu)??[];assert.equal(links.length,2);
  for(const line of shapes.filter(s=>s.type==='line')){
   const block=links.find(b=>b.includes('name="'+line.id+'"'));assert.ok(block);
   assert.ok(block.includes('<a:stCxn id="'+ids.get(line.style.startAnchor.elementId)+'"'));
   assert.ok(block.includes('<a:endCxn id="'+ids.get(line.style.endAnchor.elementId)+'"'));
  }
  assert.doesNotMatch(xml,/<a:(?:headEnd|tailEnd)[^>]*type="triangle"/u);
 }
});
