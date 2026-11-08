'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createMinimalDeckIr,runBuilder,invokeBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');

test('whole connector writer regressions run in the unified contract and CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 const {classifyTestResource}=require('../scripts/test-suites');
 const file='test/openxml-whole-relationship-contract.test.js';
 for(const suite of ['contract','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.replaceAll('\\','/')===file));
 assert.equal(classifyTestResource(file),'external-process');
});
test('actual writer emits two whole native connectors for two logical source paths',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'whole-connector-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=sourceSharedTreeFixture(),fit=measureSharedSourceRoute(f).fit;assert.ok(fit);
 const relations=['left','right'].map(s=>({id:'relation-'+s,regionId:'root',fromId:'region-source',toId:'object-'+s,direction:'forward'}));
 const out=compileSharedSourceRoute({fit,image:f.image,relations,id:'test',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},wholeRelations:true});
 const deck=createMinimalDeckIr('');deck.slideSize={widthPt:300,heightPt:230};deck.pages[0].textBoxes=[];
 deck.pages[0].shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#FFFFFF',stroke:'#000000'}})),...out.parts];
 const file=path.join(root,'deck.json'),pptx=path.join(root,'whole.pptx');fs.writeFileSync(file,JSON.stringify(deck));runBuilder(['--ir',file,'--out',pptx]);
 const xml=readZipEntryText(pptx,'ppt/slides/slide1.xml'),blocks=xml.match(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu)??[];
 assert.equal(blocks.length,2);assert.doesNotMatch(xml,/name="[^"]*joint/iu);
 for(const relation of relations){const block=blocks.find(b=>b.includes('name="scene-'+relation.id+'"'));assert.ok(block);
  assert.equal((block.match(/<a:stCxn /gu)??[]).length,1);assert.equal((block.match(/<a:endCxn /gu)??[]).length,1);
  assert.match(block,/<a:tailEnd[^>]+type="triangle"/u);
 }
});
test('actual writer preserves six measured gradient stops plus two boundary colors and rejects an oversized palette',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'whole-gradient-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck=createMinimalDeckIr(''),stops=Array.from({length:8},(_,i)=>({position:i/7,color:'#'+(0x123450+i).toString(16)}));
 deck.pages[0].shapes=[{id:'whole-gradient',type:'line',box:{x:10,y:10,w:200,h:100},style:{fill:'none',stroke:'#123450',strokeWidthPt:2,strokeGradient:{type:'linear',angleDeg:117.5,stops}}}];
 const file=path.join(root,'deck.json'),pptx=path.join(root,'whole.pptx');fs.writeFileSync(file,JSON.stringify(deck));runBuilder(['--ir',file,'--out',pptx]);
 const xml=readZipEntryText(pptx,'ppt/slides/slide1.xml');assert.equal((xml.match(/<a:gs pos=/gu)??[]).length,8);
 assert.match(xml,/<a:gs pos="100000">/u);for(const stop of stops)assert.ok(xml.includes(stop.color.slice(1).toUpperCase()));
 stops.push({position:1,color:'#FFFFFF'});fs.writeFileSync(file,JSON.stringify(deck));const result=invokeBuilder(['--ir',file,'--out',path.join(root,'oversized.pptx')]);
 assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/Native gradient stop budget is invalid/u);
});

test('actual writer preserves every ordered real network path, bound endpoint and the unused cycle arm',t=>{
 const {fitWholeRouteNativeNetwork}=require('../packages/slideclone-core/routing/whole-route-network-fit');
 const {inspectWholeRouteNetworkPaths}=require('../packages/slideclone-core/routing/whole-route-network-paths');
 const {inspectWholeRouteNetworkTopology}=require('../packages/slideclone-core/routing/whole-route-network-topology');
 const {nativeElbowConnector,nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
 const {readNativeConnectorDrawings}=require('./helpers/native-connector-xml.cjs');
 const fixtures=require('./fixtures/whole-native-network-input.json');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'whole-network-writer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck=createMinimalDeckIr('');deck.slideSize={widthPt:960,heightPt:1280};deck.pages[0].textBoxes=[];
 const groups=[],bindings=new Map();
 for(const [index,fixture]of fixtures.entries()){
  const network=fitWholeRouteNativeNetwork({...structuredClone(fixture),approximation:'semantic-native',work:{checks:0}});assert.ok(network);
  const relations=[],arms=[],used=new Set(network.paths.flatMap(p=>p.chains.map(r=>r.index)));
  const add=(id,connector,arrow)=>{
   const points=nativeElbowVertices(connector),a=points[0],b=points.at(-1);assert.ok(a&&b);
   const anchors=[a,b].map((point,i)=>{
    const elementId=id+'-endpoint-'+i;
    deck.pages[0].shapes.push({id:elementId,type:'rect',box:{x:point.x-1,y:point.y,w:2,h:2},style:{fill:'none',stroke:'none',strokeWidthPt:0}});
    return {elementId,side:'top',position:.5};
   });
   const part={id,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',
    ...connector,startAnchor:anchors[0],endAnchor:anchors[1],...(arrow?{endArrow:'triangle'}:{})}};
   bindings.set(id,anchors.map(a=>a.elementId));deck.pages[0].shapes.push(part);return part;
  };
  for(const path of network.paths)relations.push({relationId:path.relationId,part:add('network-'+index+'-'+path.relationId,path.connector,true)});
  for(const [chainIndex,chain]of network.chains.entries())if(!used.has(chainIndex)){
   const connector=nativeElbowConnector(chain.points);assert.ok(connector);
   arms.push({chainIndex,reversed:false,part:add('network-'+index+'-arm-'+chainIndex,connector,false)});
  }
  groups.push({network,relations,arms});
 }
 const file=path.join(root,'deck.json'),pptx=path.join(root,'whole-network.pptx');fs.writeFileSync(file,JSON.stringify(deck));runBuilder(['--ir',file,'--out',pptx]);
 const xml=readZipEntryText(pptx,'ppt/slides/slide1.xml'),drawings=readNativeConnectorDrawings(xml),byId=new Map(drawings.map(d=>[d.name,d]));
 assert.equal(drawings.length,8);assert.equal(byId.size,8);assert.doesNotMatch(xml,/<a:custGeom/u);
 for(const drawing of drawings){assert.deepEqual([drawing.start,drawing.end],bindings.get(drawing.name));
  if(drawing.name.includes('-relation-'))assert.match(drawing.row,/<a:tailEnd[^>]+type="triangle"/u);
  else assert.doesNotMatch(drawing.row,/<a:(?:headEnd|tailEnd)[^>]+type="(?:triangle|arrow)"/u);
 }
 for(const {network,relations,arms}of groups){
  const decoded=rows=>rows.map(row=>({...row,part:byId.get(row.part.id).part}));
  const actualRelations=decoded(relations),actualArms=decoded(arms);
  assert.ok(inspectWholeRouteNetworkPaths({network,relations:actualRelations,arms:actualArms,work:{checks:0}}));
  const topology=inspectWholeRouteNetworkTopology({parts:[...actualRelations,...actualArms].map(row=>row.part),work:{checks:0}});assert.ok(topology);
  assert.equal(topology.connectedComponents,1);assert.equal(topology.cycles,network.cycleRank);
 }
 const arm=drawings.find(d=>d.name.includes('-arm-'));assert.ok(arm);assert.equal(arm.part.style.connectorType,undefined);
 assert.deepEqual(groups.map(g=>g.network.cycleRank),[0,1]);
});
