'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {groupSemanticNodes}=require('../packages/slideclone-core/scene-plan/semantic-node-edit-groups');
const {runBuilder}=require('./helpers/openxml-contract-fixtures');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');

for(const kind of ['fitted-route','visible-gap-logical','source-body-contact'])test(`semantic ${kind} node assembly reaches actual writer with complete groups and one external connector`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-node-writer-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {writePng}=require('../packages/slideclone-core/png');
 writePng(path.join(root,'icon.png'),{width:8,height:8,rgba:Buffer.alloc(8*8*4,255)});
 const body=(id,x)=>({id:'body-'+id,type:'rect',box:{x,y:20,w:80,h:60},style:{fill:'#FFFFFF'},
  source:{sceneInventoryId:id,sceneRegionId:'region',detector:'source-scene-container',nativeRebuild:true,semanticNativeStructure:true}});
 const a=body('a',20),b=body('b',160);
 const outline={...a,id:'outline-a',style:{fill:'none',stroke:'#333333'},source:{...a.source,detector:'source-scene-outline'}};
 const route={id:'relation',type:'line',box:{x:100,y:50,w:60,h:0},style:{stroke:'#123456',strokeWidthPt:2,
  startAnchor:{elementId:'outline-a',side:'right',offset:.5},endAnchor:{elementId:'body-b',side:'left',offset:.5},endArrow:'triangle'},
  source:kind==='fitted-route'?{nativeConnectorRoute:true,sceneRelationId:'a-to-b',sourceRouteParts:1}
   :{sceneRelationId:'a-to-b',semanticNativeStructure:true,role:'relationship',sourceAttachmentKind:kind}};
 const page={pageIndex:0,background:{fill:'#FFFFFF'},shapes:[a,outline,b,route],tables:[],charts:[],
  images:[{id:'icon',assetPath:'icon.png',box:{x:30,y:30,w:12,h:12},
   source:{sceneRegionId:'region',protectedMinimumUnit:true,cropEvidenceRequired:true}}],
  textBoxes:[{id:'label-a',text:'Node A',box:{x:50,y:40,w:40,h:14},source:{sceneRegionId:'region',editable:true}},
   {id:'label-b',text:'Node B',box:{x:175,y:40,w:50,h:14},source:{sceneRegionId:'region',editable:true}}]};
 const result=groupSemanticNodes({page,work:{checks:0}});assert.equal(result.report.groups.length,2);
 assert.equal(result.page.shapes,page.shapes);assert.equal(result.page.textBoxes,page.textBoxes);
 assert.ok(page.shapes.every(shape=>shape.source.nativeComponentGroupId===undefined));
 const input=path.join(root,'deck.json'),output=path.join(root,'deck.pptx');
 fs.writeFileSync(input,JSON.stringify({version:'1.0',slideSize:{widthPt:300,heightPt:150},pages:[result.page]}));
 runBuilder(['--ir',input,'--out',output]);
 const xml=readZipEntryText(output,'ppt/slides/slide1.xml');
 const groups=[...xml.matchAll(/<p:grpSp>[\s\S]*?<\/p:grpSp>/gu)].map(m=>m[0]);assert.equal(groups.length,2);
 for(const row of result.report.groups){
  const group=groups.find(g=>g.includes(`name="${row.id}"`));assert.ok(group);
  for(const member of row.members)assert.equal(group.split(`name="${member}"`).length-1,1,member);
  assert.doesNotMatch(group,/<p:cxnSp>/u);
 }
 const connectors=[...xml.matchAll(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu)].map(m=>m[0]);assert.equal(connectors.length,1);
 const connector=connectors[0];assert.match(connector,/name="relation"/u);assert.match(connector,/<a:tailEnd type="triangle"/u);
 const ids=new Map([...xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/gu)].map(m=>[m[2],m[1]]));
 assert.equal(new Set(ids.values()).size,ids.size);
 assert.match(connector,new RegExp(`<a:stCxn id="${ids.get('outline-a')}"`,'u'));
 assert.match(connector,new RegExp(`<a:endCxn id="${ids.get('body-b')}"`,'u'));
 assert.equal(result.report.editingBehaviorVerified,false);
});

test('direct writer rejects unsafe output membership instead of silently consuming existing groups or routes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-node-invalid-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {invokeBuilder}=require('./helpers/openxml-contract-fixtures');
 const box={x:10,y:10,w:20,h:20};
 const base={pageIndex:0,sourceImage:'',shapes:[{id:'body',type:'rect',box,source:{}}],images:[],
  textBoxes:[{id:'label',text:'Node',box}],outputEditGroups:[{id:'node',members:['body','label']}]};
 const cases=[p=>p.outputEditGroups[0].members.push('missing'),p=>p.outputEditGroups[0].members.push('body'),
  p=>p.outputEditGroups.push({id:'other',members:['body','label']}),p=>p.outputEditGroups[0].members=['body'],
  p=>p.outputEditGroups[0].members=null,p=>p.outputEditGroups[0].id='../invalid',
  p=>p.outputEditGroups[0].strictSourceEquivalent=true,p=>p.shapes[0].source.nativeComponentGroupId='verified',
  p=>p.shapes[0].source.sceneRelationId='route',p=>p.shapes[0].source.nativeConnectorRoute=true,
  p=>p.shapes[0].style={startAnchor:{elementId:'label'}},p=>p.outputEditGroups=Array(97).fill(p.outputEditGroups[0]),
  p=>p.outputEditGroups[0].members=Array(129).fill('body')];
 for(const [index,change]of cases.entries()){
  const page=structuredClone(base);change(page);
  const input=path.join(root,`invalid-${index}.json`),output=path.join(root,`invalid-${index}.pptx`);
  fs.writeFileSync(input,JSON.stringify({version:'1.0',slideSize:{widthPt:100,heightPt:100},pages:[page]}));
  const result=invokeBuilder(['--ir',input,'--out',output]);assert.notEqual(result.status,0,`case ${index}`);
  assert.match(result.stderr+result.stdout,/Output edit grouping is invalid|strictSourceEquivalent/u,`case ${index} must reject membership, not fail to build`);
  assert.equal(fs.existsSync(output),false,`case ${index} must not publish`);
 }
});

test('the writer regression enters the unified contract and all gates',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['contract','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/openxml-semantic-node-groups-contract.test.js'));
});
