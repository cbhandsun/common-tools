'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {sceneSharedRouteConsumerProbe}=require('../scripts/lib/runtime-shared-route-consumer');
const {runtimeProbeOptions}=require('../scripts/lib/runtime-command-result');
const run=(root,probe=sceneSharedRouteConsumerProbe())=>{
 const result=spawnSync(process.execPath,['-e',probe,root],{cwd:root,...runtimeProbeOptions('shared-route')});
 assert.equal(result.error?.code,undefined,'Shared consumer process must finish within the approved shared-route deadline');
 assert.equal(result.signal,null,'Shared consumer process must exit normally');
 return result;
};

test('Worker factory converts representable shared paths and rejects an over-capacity cycle without hiding unmet relations',()=>{
 const result=run(path.resolve(__dirname,'..'));assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');assert.equal(result.stderr,'');
});

test('shared consumer fails safely when a required installed module is unavailable',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'runtime-shared-gate-test-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 const result=run(root);assert.equal(result.status,2);assert.equal(result.stdout,'worker-shared-cold-load');assert.equal(result.stderr,'');
});

test('the installed consumer detects disabled or unconditional source path matching',()=>{
 const root=path.resolve(__dirname,'..'),load="const {sourceRouteMatchesProgram:orderedPath}=require(path.join(root,'packages/slideclone-core/scene-plan/source-scene-path-program.js'));";
 for(const result of ['true','false']){
  const original=sceneSharedRouteConsumerProbe();assert.ok(original.includes(load));
  const probe=original.replace(load,'const orderedPath=()=>'+result+';'),failed=run(root,probe);
  assert.equal(failed.status,2);assert.equal(failed.stdout,'worker-shared-ordered-path');assert.equal(failed.stderr,'');
 }
});
test('the installed Worker refuses foreign edge choices and a disabled or unconditional choice matcher',()=>{
 const root=path.resolve(__dirname,'..'),original=sceneSharedRouteConsumerProbe();
 const mutation=original.replace('sourceEdgePath:steps','sourceEdgePath:[{id:"ink-"+"f".repeat(24),reversed:false}]');
 assert.notEqual(mutation,original);const foreign=run(root,mutation);assert.equal(foreign.status,2,foreign.stdout);assert.equal(foreign.stdout,'worker-shared-reconstruction');
 for(const result of ['true','false']){
  const hook="const Module=require('node:module'),load=Module._load;Module._load=function(request,...args){const value=load.call(this,request,...args);return typeof request==='string'&&request.endsWith('source-shared-route-choice')?{...value,sourceRouteChoiceMatches:()=>"+result+"}:value;};";
  const failed=run(root,hook+original);assert.equal(failed.status,2,failed.stdout);assert.match(failed.stdout,/^worker-shared-(reconstruction|completion)$/);assert.equal(failed.stderr,'');
 }
});

test('shared consumer rejects missing trunk, altered endpoint, duplicate identity and retained old arrow',()=>{
 const root=path.resolve(__dirname,'..');
 for(const mutation of [
  "page.shapes=page.shapes.filter(s=>s.id!==inventory.sharedRouteGraphs[0].renderedPaths[0].memberId);",
  "page.shapes.find(s=>s.id===inventory.sharedRouteGraphs[0].renderedPaths[0].memberId).style.endAnchor.elementId='missing';",
  "page.shapes.push(page.shapes[0]);",
  "page.shapes.push({id:'prior-shared-arrow'});"
 ]){
  const probe=sceneSharedRouteConsumerProbe().replace("stage='worker-shared-native-members';","stage='worker-shared-native-members';"+mutation);
  const result=run(root,probe);assert.equal(result.status,2,result.stdout);assert.match(result.stdout,/^worker-shared-(native-members|retirement)$/);assert.equal(result.stderr,'');
 }
});

test('shared consumer regressions are found by the unified integration suite',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'integration');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/runtime-shared-route-consumer.test.js'));
});

test('installed consumer detects omission of a declared relation even when no source member was emitted',()=>{
 const root=path.resolve(__dirname,'..'),original=sceneSharedRouteConsumerProbe();
 const point="assert.equal(graph.rendering,'whole-native-paths-v1');";
 for(const mutation of [
  "selection.unmetRelationIds=selection.unmetRelationIds.filter(id=>id!=='relation-pending');",
  "representation.wholeObjectUnmetRelationIds=[];",
  "representation.nativeModeUnmetRelationIds=representation.nativeModeUnmetRelationIds.filter(id=>id!=='relation-pending');",
  "representation.relations=representation.relations.filter(row=>row.relationId!=='relation-pending');"
 ]){
  assert.ok(original.includes(point));
  const probe=original.replace(point,`if(partial){${mutation}}`+point),result=run(root,probe);
  assert.equal(result.status,2,result.stdout);assert.equal(result.stdout,'worker-shared-native-members');assert.equal(result.stderr,'');
 }
});

test('installed default-mode acceptance rejects an unconfigured core that regresses to visual freeforms',()=>{
 const hook=String.raw`
 const Module=require('node:module'),load=Module._load;
 Module._load=function(request,...args){const value=load.call(this,request,...args);
  if(typeof request==='string'&&request.endsWith('source-route-corner-mode'))return {...value,
   parseConnectorCornerMode:input=>input===undefined?'auto':value.parseConnectorCornerMode(input)};
  return value;
 };`;
 const result=run(path.resolve(__dirname,'..'),hook+sceneSharedRouteConsumerProbe());
 assert.equal(result.status,2);assert.equal(result.stdout,'worker-shared-native-members');assert.equal(result.stderr,'');
});
test('actual Worker carries complete prior source catalogs across port reprojection and fails safely if that handoff is dropped',()=>{
 const hook=String.raw`
 const Module=require('node:module'),originalLoad=Module._load;
 Module._load=function(request,...args){const value=originalLoad.call(this,request,...args);
  if(typeof request==='string'&&request.endsWith('source-scene-planner'))return {...value,createSourceScenePlanner:options=>{
   const review=value.createSourceScenePlanner(options);return async input=>{
    const result=await review(input),catalogs=result.sourceRouteCatalogs??[];
    const projected=catalogs.map(c=>{
     if(!result.plan?.relations.some(r=>r.sourcePathChoice?.networkHash===c.networkHash))return c;
     const old=structuredClone(c);old.contacts[0].point.x+=.25;
     old.networkHash=require('node:crypto').createHash('sha256').update(JSON.stringify({sourceHash:old.sourceHash,widthPx:old.widthPx,heightPx:old.heightPx,window:old.window,
      relationIds:[...old.relationIds].sort(),contacts:[...old.contacts].sort((a,b)=>a.id.localeCompare(b.id)),edges:[...old.edges].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
     for(const r of result.plan.relations)if(r.sourcePathChoice?.networkHash===c.networkHash)r.sourcePathChoice={...r.sourcePathChoice,networkHash:old.networkHash};
     return old;
    });return {...result,sourceRouteCatalogs:projected};
   };
  }};
  if(DROP_CATALOGS&&typeof request==='string'&&request.endsWith('team-native-rebuild'))return {...value,createRawImageNativeRebuilder:options=>value.createRawImageNativeRebuilder({...options,
   compileSourceScene:input=>{const {sourceRouteCatalogs,...rest}=input;return options.compileSourceScene(rest);}})};
  return value;
 };`;
 const root=path.resolve(__dirname,'..'),probe=sceneSharedRouteConsumerProbe();
 const good=run(root,hook.replace('DROP_CATALOGS','false')+probe);assert.equal(good.status,0,good.stdout);assert.equal(good.stdout,'ready');assert.equal(good.stderr,'');
 const dropped=run(root,hook.replace('DROP_CATALOGS','true')+probe);assert.equal(dropped.status,2,dropped.stdout);assert.match(dropped.stdout,/^worker-shared-(completion|reconstruction)$/u);assert.equal(dropped.stderr,'');
});
