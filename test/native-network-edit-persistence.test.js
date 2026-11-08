'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const {nativeNetworkPage}=require('./helpers/native-network-page.cjs');
const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
const {createNativeNetworkEditModel}=require('../packages/slideclone-core/routing/native-network-edit-model');
const {persistIrEditorPatch,applyAndExportIrArtifacts}=require('../packages/ppt-create-core/ir-editor');
const {deckIrFingerprint}=require('../packages/ppt-create-core/export');

function fixture(t){
 const root=createTemporaryTestDirectory('native-network-persistence-');t.after(()=>removeTemporaryTestDirectory(root));
 const f=nativeNetworkPage();f.graph.id='editable-cycle';
 const model=createNativeNetworkEditModel({...f,work:{checks:0}});f.page.source={nativeNetworkEditModels:[model]};
 const ir={version:'1.0',slideSize:{widthPt:1000,heightPt:1000},pages:[f.page]};
 const input=path.join(root,'deck.json'),patch=path.join(root,'edit.json');
 const operations=[{type:'reflow-native-network',pageIndex:0,networkId:model.id,approximation:'semantic-native'}];
 const edit={version:'1.0',expectedRevision:deckIrFingerprint(ir),operations};
 fs.writeFileSync(input,JSON.stringify(ir));fs.writeFileSync(patch,JSON.stringify(edit));
 return {root,input,patch,edit,source:fs.readFileSync(input)};
}
// These adapters exercise persistence/report transactions only. The real writer
// and Office lifecycle are separate acceptance checks, never inferred here.
function buildPptx({outFile}){fs.writeFileSync(outFile,Buffer.concat([Buffer.from('PK\u0003\u0004'),Buffer.alloc(64,1)]),{flag:'wx'});}
function buildPdf({outFile,sourceFingerprint}){
 fs.writeFileSync(outFile,'%PDF-1.4\n1 0 obj << /Type /Page /Parent 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 1 >> endobj\n%%EOF',{flag:'wx'});
 return {sourceFingerprint};
}
function reportChecks(report){
 assert.equal(report.relations,5);assert.equal(report.arms,1);assert.equal(report.topology.cycles,1);
 assert.equal(report.topology.connectedComponents,1);assert.equal(report.automaticOfficeFollowingVerified,false);
 assert.equal(report.sourceOwnershipGranted,false);assert.equal(report.actualPaintTopologyVerified,false);
}
test('stored network editing persists the validated model and honest topology report',t=>{
 const f=fixture(t),output=path.join(f.root,'edited.json');
 const result=persistIrEditorPatch({workspaceRoot:f.root,...f,output});
 reportChecks(result.networkReflows[0]);assert.deepEqual(fs.readFileSync(f.input),f.source);
 const saved=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(saved.pages[0].source.nativeNetworkEditModels[0].id,'editable-cycle');
 assert.equal(saved.pages[0].shapes.filter(s=>s.source?.sceneRelationId).length,5);
 assert.equal(deckIrFingerprint(saved),result.revision);
 const savedBytes=fs.readFileSync(output);
 assert.throws(()=>persistIrEditorPatch({workspaceRoot:f.root,...f,output}),/new JSON/u);
 assert.deepEqual(fs.readFileSync(output),savedBytes);
});
test('invalid later operations or stale revisions publish no partially reflowed file',t=>{
 const f=fixture(t),output=path.join(f.root,'edited.json');
 for(const [edit,expected] of [[{...f.edit,expectedRevision:'a'.repeat(64)},/revision does not match/u],
  [{...f.edit,operations:[...f.edit.operations,{type:'set-box',pageIndex:0,objectId:'missing',box:{x:1,y:1,w:2,h:2}}]},/target/u]]){
  fs.writeFileSync(f.patch,JSON.stringify(edit));
  assert.throws(()=>persistIrEditorPatch({workspaceRoot:f.root,...f,output}),expected);
  assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readFileSync(f.input),f.source);
 }
});
test('combined edit and export records network reflow in the saved finalization report',t=>{
 const f=fixture(t),output=path.join(f.root,'export');
 const result=applyAndExportIrArtifacts({workspaceRoot:f.root,...f,output,buildPptx,buildPdf});
 const saved=JSON.parse(fs.readFileSync(result.files.finalizationReportFile,'utf8'));
 assert.equal(saved.passed,true);assert.equal(saved.inputRevision,f.edit.expectedRevision);
 reportChecks(saved.networkReflows[0]);assert.deepEqual(saved.networkReflows,result.finalizationReport.networkReflows);
 assert.deepEqual(fs.readFileSync(f.input),f.source);
 assert.equal(fs.readdirSync(f.root).some(name=>name.startsWith('.common-tools-ir-edit-')),false);
});
test('failed export after a successful reflow leaves no final bundle or temporary edit',t=>{
 const f=fixture(t),output=path.join(f.root,'export');let calls=0;
 assert.throws(()=>applyAndExportIrArtifacts({workspaceRoot:f.root,...f,output,buildPptx(){calls++;throw Error('adapter-failed');},buildPdf}),/adapter-failed/u);
 assert.equal(calls,1);assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readFileSync(f.input),f.source);
 assert.equal(fs.readdirSync(f.root).some(name=>name.startsWith('.common-tools-ir-edit-')),false);
});
test('network persistence regression is included in unified unit and full CI discovery',()=>{
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/native-network-edit-persistence.test.js'));
});
