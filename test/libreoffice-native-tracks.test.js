'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const {resolveUnoPython, parseTrackResult} = require('../packages/slideclone-core/libreoffice-native-tracks');

const valid = {version:1,restoredTracks:2,skippedNativeConnectors:0,nativeShapeTypesRetained:true,
  importedTracksVerified:true,renderedPathsVerified:false,officeEditingVerified:false,shutdown:'clean-exit'};

function withRunner(run) {
  const file = path.resolve(__dirname,'../packages/slideclone-core/libreoffice-native-tracks.js');
  const localRequire = createRequire(file), moduleObject = {exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'), {module:moduleObject,__dirname:path.dirname(file),Buffer,
    process:{platform:'linux',env:{}},require:name=>name==='./renderer-process'?{run}:localRequire(name)}, {filename:file});
  return moduleObject.exports;
}

test('native track Python resolution uses an explicit UNO runtime and rejects malformed configuration',()=>{
  assert.equal(resolveUnoPython('soffice',{LIBREOFFICE_PYTHON_BIN:'/trusted/python'},'linux'),'/trusted/python');
  assert.equal(resolveUnoPython('soffice',{},'linux'),'/usr/bin/python3');
  assert.throws(()=>resolveUnoPython('soffice',{},'win32'),/require/);
  for(const value of ['', '\0', 'x\ny', 'x'.repeat(32769)])assert.throws(()=>resolveUnoPython('soffice',{LIBREOFFICE_PYTHON_BIN:value}),TypeError);
});

test('native track results preserve the distinction between imported geometry and rendered or Office evidence',()=>{
  const result=parseTrackResult(JSON.stringify({...valid,privateDocumentText:'must not survive'}));
  assert.equal(result.restoredTracks,2);assert.equal(result.renderedPathsVerified,false);assert.equal(result.officeEditingVerified,false);
  assert.equal('privateDocumentText' in result,false);
  for(const row of [null,[],{}, {...valid,restoredTracks:0},{...valid,restoredTracks:10001},{...valid,skippedNativeConnectors:-1},
    {...valid,restoredTracks:'2'},{...valid,renderedPathsVerified:true},{...valid,officeEditingVerified:true},{...valid,shutdown:'forced'}]){
    assert.throws(()=>parseTrackResult(JSON.stringify(row)),TypeError);
  }
  for(const row of [undefined,'invalid',' '.repeat(4097)])assert.throws(()=>parseTrackResult(row),TypeError);
});

test('native track runner uses isolated Python and existing cancellation and process bounds',async()=>{
  let call;
  const api=withRunner(async(...args)=>{call=args;return {stdout:JSON.stringify(valid),stderr:''};});
  const cancelled=async()=>false;
  const result=await api.renderNativeTracks({cleanupDir:'/tmp/slideclone-lo-owned',pptxFile:'/tmp/slideclone-lo-owned/input.pptx'},'soffice',
    {timeout:1234,isCancellationRequested:cancelled});
  assert.equal(result.restoredTracks,2);assert.equal(call[0],'/usr/bin/python3');assert.equal(call[1][0],'-I');assert.equal(call[1][1],'-B');
  assert.deepEqual(Array.from(call[1].slice(-3)),['/tmp/slideclone-lo-owned','input.pptx','soffice']);
  assert.equal(call[2].timeout,1234);assert.equal(call[2].maxBuffer,4096);assert.equal(call[2].isCancellationRequested,cancelled);
});

test('native track failures do not expose process output and retain cancellation and timeout categories',async()=>{
  for(const message of ['private-document-secret','editable job was cancelled','renderer process timed out']){
    const api=withRunner(async()=>{throw Object.assign(new Error(message),{stdout:'private-output',stderr:'private-user-content'});});
    await assert.rejects(api.renderNativeTracks({cleanupDir:'/tmp/owned',pptxFile:'input.pptx'},'soffice',{timeout:1000}),error=>{
      assert.equal(error.stdout,undefined);assert.equal(error.stderr,undefined);
      assert.ok(!error.message.includes('private'));if(!message.startsWith('private'))assert.equal(error.message,message);return true;
    });
  }
});

test('native track conversion rejects unbounded deadlines before starting a subprocess',async()=>{
  const api=withRunner(async()=>assert.fail('invalid process deadline must not start a child'));
  for(const timeout of [0,-1,Infinity,NaN,2147483648]){
    await assert.rejects(api.renderNativeTracks({cleanupDir:'/tmp/owned',pptxFile:'input.pptx'},'soffice',{timeout}),/finite process deadline/);
  }
});

test('native track pure OOXML and cleanup regressions run in unified integration without requiring UNO',{timeout:60000},()=>{
  const candidates=require('../scripts/verify-python-lock').pythonCandidates();
  const python=candidates.find(row=>row.source==='codex-runtime-python')||candidates.find(row=>row.command);
  assert.ok(python,'Python runtime is required by this integration gate');
  const result=spawnSync(python.command,[...python.prefix,'-I','-B',path.join(__dirname,'helpers/libreoffice-native-plan.py'),
    path.resolve(__dirname,'../packages/slideclone-core/python')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Ran 26 tests/);
});

test('native track implementation and its Python modules are included in release inventory and integration CI',()=>{
  const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
  for(const file of ['libreoffice-native-tracks.js','python/libreoffice_native_plan.py','python/libreoffice_native_render.py']){
    assert.ok(files.includes('packages/slideclone-core/'+file));assert.ok(fs.existsSync(path.resolve('packages/slideclone-core',file)));
  }
  assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'integration').some(r=>r.file.replaceAll('\\','/')==='test/libreoffice-native-tracks.test.js'));
  const docker=fs.readFileSync(path.resolve('deploy/docker/Dockerfile.image-to-editable'),'utf8');
  assert.match(docker,/\bpython3-uno\b/);assert.match(docker,/LIBREOFFICE_PYTHON_BIN=\/usr\/bin\/python3/);
});

for(const mode of ['success','conversion failure','inventory mismatch','missing output']){
  test(`normal renderer native track branch: ${mode}`,async t=>{
    const {writeStoredZipAtomic}=require('../packages/ooxml-core/pptx-zip');
    const {createTemporaryTestDirectory:createDirectory,removeTemporaryTestDirectory:removeDirectory}=require('./helpers/temporary-directory.cjs');
    const root=createDirectory('lo-native-branch-');t.after(()=>removeDirectory(root));
    const source=path.join(root,'deck.pptx');
    writeStoredZipAtomic(source,[{name:'ppt/presentation.xml',data:'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="6350" cy="6350"/></p:presentation>'},
      {name:'ppt/slides/slide1.xml',data:'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cxnSp><p:nvCxnSpPr><p:cNvPr id="3" name="route"/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12700" cy="12700"/></a:xfrm><a:prstGeom prst="bentConnector5"/></p:spPr></p:cxnSp></p:sld>'}]);
    const before=fs.readFileSync(source),entry=path.resolve('packages/slideclone-core/render-libreoffice.js');
    const moduleObject={exports:{}},localRequire=createRequire(entry);
    let nativeCalls=0,popplerCalls=0,owned;
    const failure=new Error('controlled conversion failure');
    vm.runInNewContext(fs.readFileSync(entry,'utf8'),{module:moduleObject,process,Buffer,setTimeout,__dirname:path.dirname(entry),require:name=>{
      if(name==='./libreoffice-native-tracks')return {renderNativeTracks:async conversion=>{
        nativeCalls++;owned=conversion.cleanupDir;
        if(mode==='conversion failure')throw failure;
        if(mode!=='missing output')fs.writeFileSync(path.join(conversion.renderDir,'input.pdf'),'%PDF-controlled');
        return {...valid,restoredTracks:mode==='inventory mismatch'?3:1};
      }};
      if(name==='./renderer-process')return {run:async(_command,args)=>{
        assert.ok(!args.includes('--convert-to'),'native conversion must not fall back to the old importer');
        popplerCalls++;fs.writeFileSync(args.at(-1)+'-1.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=','base64'));
        return {stdout:'',stderr:''};
      }};
      return localRequire(name);
    }},{filename:entry});
    const pending=moduleObject.exports({pptx:{pptxFile:source}},
      {outputDir:root,config:{render:{pdfReadyPollMs:20,pdfReadyTimeoutMs:1000}}});
    if(mode==='success'){
      const r=await pending;assert.equal(r.ok,true);assert.equal(popplerCalls,1);
      assert.equal(r.compatibility.nativeConnectorRoutingEvidence.importedGeometryRestored,true);
      assert.equal(r.compatibility.nativeConnectorRoutingEvidence.renderedPathsVerified,false);
    }else{
      await assert.rejects(pending,error=>mode==='conversion failure'?error===failure:/inventory|expected PDF/.test(error.message));
      assert.equal(popplerCalls,0);
    }
    assert.equal(nativeCalls,1);assert.equal(fs.existsSync(owned),false);assert.deepEqual(fs.readFileSync(source),before);
  });
}
