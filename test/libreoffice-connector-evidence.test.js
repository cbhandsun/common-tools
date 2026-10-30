'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory:createDirectory,removeTemporaryTestDirectory:removeDirectory}=require('./helpers/temporary-directory.cjs');
const {inspectLibreOfficeConnectorEvidence:inspect}=require('../packages/slideclone-core/libreoffice-connector-evidence');
const {stageGroupedTextConnections:stage}=require('../packages/slideclone-core/libreoffice-grouped-text-connections');
const {writeStoredZipAtomic,readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
const head='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
const slide=body=>head+body+'</p:sld>';
const connector=preset=>'<p:cxnSp><p:spPr><a:prstGeom prst="'+preset+'"/></p:spPr></p:cxnSp>';

test('native connector inventory cannot certify the displayed path, regardless of bindings or paint',()=>{
 for(const preset of ['line','bentConnector3','bentConnector5','curvedConnector5'])
  assert.deepEqual(inspect(slide(connector(preset))),{status:'requires-office-verification',nativeConnectors:1,fiveLegPresets:Number(preset.endsWith('5'))});
 assert.deepEqual(inspect(slide(connector('bentConnector5')+connector('line'))),
  {status:'requires-office-verification',nativeConnectors:2,fiveLegPresets:1});
});

test('empty drawings, ordinary preset shapes and comments do not supply native connector evidence',()=>{
 for(const body of ['', '<!-- '+connector('bentConnector5')+' -->',connector('bentConnector5').replaceAll('p:cxnSp','p:sp')])
  assert.deepEqual(inspect(slide(body)),{status:'not-needed',nativeConnectors:0,fiveLegPresets:0});
 assert.deepEqual(inspect(slide('<p:cxnSp/>')),{status:'requires-office-verification',nativeConnectors:1,fiveLegPresets:0});
});

test('writer-local namespaces and quoted preset attributes are recognized without borrowing sibling scope',()=>{
 const local='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cxnSp><p:spPr>'
  +'<a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst = \'bentConnector5\'/>'
  +'</p:spPr></p:cxnSp></p:sld>';
 assert.deepEqual(inspect(local),{status:'requires-office-verification',nativeConnectors:1,fiveLegPresets:1});
 assert.equal(inspect(local.replace('</p:spPr>','<a:prstGeom prst="bentConnector5"/></p:spPr>')).status,'unverified-markup');
 assert.equal(inspect(slide('<p:cxnSp><a:prstGeom note="prst=\'bentConnector5\'" prst="line"/></p:cxnSp>')).fiveLegPresets,0);
});

test('malformed, foreign, exhausted and hostile input never claims connector-free success or leaks input',()=>{
 for(const value of ['', '<slide/>',slide('<p:cxnSp>'),slide('<![CDATA['+connector('line')+']]>'),
  slide('<p:cxnSp xmlns:p="foreign"/>'),slide('<a:ln broken/>'),slide('<p:cxnSp><p:cxnSp/></p:cxnSp>')])
  assert.deepEqual(inspect(value),{status:'unverified-markup',nativeConnectors:null,fiveLegPresets:null});
 for(const value of [null,{},new Proxy({}, {get(){throw new Error('private-payload');}}),slide('<!ENTITY private-payload>'),'x'.repeat(4*1024*1024+1)])
  assert.throws(()=>inspect(value),error=>error instanceof TypeError&&!error.message.includes('private-payload'));
 assert.throws(()=>inspect(slide('<p:cxnSp/>'.repeat(100001))),RangeError);
});

test('staging discloses unverified native routing separately from gradients and keeps source and geometry bytes',t=>{
 const root=createDirectory('lo-routing-evidence-');t.after(()=>removeDirectory(root));
 const source=path.join(root,'source.pptx'),output=path.join(root,'render.pptx');
 const xml=slide(connector('bentConnector5'));
 writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:xml},{name:'retained.bin',data:'same'}]);
 const before=fs.readFileSync(source),result=stage(source,output);
 assert.deepEqual(result.nativeConnectorRoutingEvidence,{status:'requires-office-verification',nativeConnectors:1,fiveLegPresets:1,unverifiedSlides:0,
  geometryRewritten:false,renderedPathsVerified:false,officeEditingVerified:false});
 assert.equal(result.gradientStrokeEvidence.status,'not-needed');assert.deepEqual(fs.readFileSync(source),before);
 assert.equal(readZipEntryText(output,'ppt/slides/slide1.xml'),xml);assert.equal(readZipEntryText(output,'retained.bin'),'same');
 writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:'<slide/>'}]);
 assert.equal(stage(source,output).nativeConnectorRoutingEvidence.status,'unverified-markup');
});

test('actual writer five-leg connectors retain native bindings and remain unverified after render staging',{timeout:60000},t=>{
 const root=createDirectory('lo-writer-routing-');t.after(()=>removeDirectory(root));
 const {runBuilder,createMinimalDeckIr}=require('./helpers/openxml-contract-fixtures');
 const {nativeElbowConnector}=require('../packages/slideclone-core/routing/source-route-native-elbow');
 const points=[[30,30],[60,30],[60,60],[110,60],[110,110],[160,110]].map(([x,y])=>({x,y}));
 const geometry=nativeElbowConnector(points);assert.equal(geometry.connectorType,'elbow-5');
 const deck=createMinimalDeckIr('');deck.slideSize={widthPt:200,heightPt:200};deck.pages[0].textBoxes=[];
 deck.pages[0].shapes=[
  {id:'from',type:'rect',box:{x:26,y:28,w:4,h:4},style:{fill:'none',stroke:'none'}},
  {id:'to',type:'rect',box:{x:160,y:108,w:4,h:4},style:{fill:'none',stroke:'none'}},
  {id:'route',type:'line',box:{x:30,y:30,w:130,h:80},style:{stroke:'#1E3C5A',strokeWidthPt:2.5,...geometry,
   startAnchor:{elementId:'from',side:'right',position:.5},endAnchor:{elementId:'to',side:'left',position:.5}}}];
 const ir=path.join(root,'deck.json'),source=path.join(root,'native.pptx'),output=path.join(root,'render.pptx');
 fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',source]);
 const before=fs.readFileSync(source),original=readZipEntryText(source,'ppt/slides/slide1.xml'),result=stage(source,output);
 assert.equal(result.nativeConnectorRoutingEvidence.nativeConnectors,1);assert.equal(result.nativeConnectorRoutingEvidence.fiveLegPresets,1);
 assert.equal(result.nativeConnectorRoutingEvidence.renderedPathsVerified,false);assert.equal(result.nativeConnectorRoutingEvidence.officeEditingVerified,false);
 assert.equal(result.authoredConnectorBindingsRenderedAsGeometry,2);assert.deepEqual(fs.readFileSync(source),before);
 assert.match(original,/<a:stCxn\b/u);assert.match(original,/<a:endCxn\b/u);
 assert.equal(readZipEntryText(output,'ppt/slides/slide1.xml'),original.replace(/<a:(?:stCxn|endCxn)\b[^>]*\/>/gu,''));
});

test('connector evidence is present in unified integration CI and released runtime inventory',()=>{
 for(const suite of ['integration','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/libreoffice-connector-evidence.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/libreoffice-connector-evidence.js'));
});
