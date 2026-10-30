'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {sourceSharedOutputFixture,sourceSharedFixedOutputFixture}=require('./helpers/source-shared-output.cjs');
const {measuredSharedSceneRouteResidualPaintGroups:read}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {createFullSlideResidualBuilder}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {sharedResidualBackdropPlans}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {writePng}=require('../packages/slideclone-core/png');
const {withApprovedBackdropBudget,approvedBackdropBudget}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const size={x:0,y:0,w:300,h:230};
function wholeNetwork(){
 const {sourceCurvedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceCurvedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit);
 const built=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:networkRelations,id:'whole-background',sourceHash:'a'.repeat(64),
  slideSize:{widthPt:300,heightPt:230},wholeRelations:true,connectorCornerMode:'rounded-freeform'});
 const bodies=f.nodes.map(n=>({id:n.id,type:'rect',box:{...n.box}}));return {...f,built,bodies,shapes:[...bodies,...built.parts]};
}
function setup(t,factory){
 const f=factory(),root=createTemp('shared-residual-background-');
 t.after(()=>removeTemp(root));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 return {...f,root,sourceFile,outputFile:path.join(root,'out.png')};
}
async function build(f,sourceShapes=f.shapes,objects=f.built.parts){
 let output,masks;const run=createFullSlideResidualBuilder({readPng:()=>f.image,
  eraseMasks:(image,rows,options)=>{masks=rows;return eraseMasks(image,rows,options);},
  writePng:(file,raster)=>{output=raster;writePng(file,raster);}});
 const report=await run({...f,objects,sourceShapes,slideSize:size});
 const backgrounds=new Map(sharedResidualBackdropPlans(f.image,masks).map(row=>[row.cell,row.color]));
 return {output,report,backgrounds};
}

test('shared residual fixture cleanup retries transient directory removal and verifies absence',t=>{
 let cleanup;const f=setup({after:fn=>{cleanup=fn;}},sourceSharedOutputFixture),rmdir=fs.rmdirSync;let attempts=0;
 try{
  t.mock.method(fs,'rmdirSync',(target,...args)=>{
   if(target===f.root&&++attempts<=2)throw Object.assign(new Error('transient directory scan'),{code:'ENOTEMPTY'});
   return rmdir(target,...args);
  });
  assert.equal(typeof cleanup,'function');assert.doesNotThrow(()=>cleanup());
  assert.ok(attempts>=3);assert.equal(fs.existsSync(f.root),false);
 }finally{t.mock.restoreAll();cleanup();}
});
test('complete measured shared routes erase their exact source ink while preserving background around bends and junctions',async t=>{
 for(const factory of [sourceSharedOutputFixture,sourceSharedFixedOutputFixture,wholeNetwork]){
  const f=setup(t,factory),before=Buffer.from(f.image.rgba),shapes=structuredClone(f.shapes);
  const cells=read(f.image,f.shapes,{checks:0})[0].cells,{output,report,backgrounds}=await build(f);
  assert.equal(report.pixelOwnership.passed,true);let kept=0;
  for(let n=0;n<f.image.width*f.image.height;n++){
   const offset=n*4;
   if(backgrounds.has(n))assert.deepEqual([...output.rgba.subarray(offset,offset+4)],[...backgrounds.get(n),before[offset+3]],'witnessed core and fringe must retain the exact measured background');
   else if(cells.has(n))assert.equal(output.rgba[offset+3],0,'ink without independent background evidence must remain transparent');
   else {assert.deepEqual(output.rgba.subarray(offset,offset+4),before.subarray(offset,offset+4),'padded route boxes cannot erase surrounding background');kept++;}
  }
  assert.ok(kept>1000);assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.shapes,shapes);
 }
});
test('absent, incomplete, copied or changed private output cannot narrow the legacy erasure',async t=>{
 for(const mode of ['empty','missing','copy','style','endpoint','source','incomplete-erasure']){
  const f=setup(t,sourceSharedOutputFixture);
  if(mode==='style')f.built.parts[0].style.stroke='#AABBCC';
  if(mode==='endpoint')f.bodies[0].box.x+=1;
  if(mode==='source')f.image.rgba[0]^=1;
  const roster=mode==='empty'?[]:mode==='missing'?f.shapes.slice(1)
   :mode==='copy'?structuredClone(f.shapes):f.shapes;
  const objects=mode==='incomplete-erasure'?f.built.parts.slice(1):f.built.parts;
  const ordinary=await build(f,[],objects),actual=await build(f,roster,objects);
  assert.deepEqual(actual.output,ordinary.output,mode);
 }
});
test('independent overlapping objects retain their own erasure when shared masks become exact',async t=>{
 const f=setup(t,sourceSharedOutputFixture),extra={type:'rect',box:{x:5,y:5,w:4,h:4}};
 const cells=read(f.image,f.shapes,{checks:0})[0].cells,{output,backgrounds}=await build(f,f.shapes,[...f.built.parts,extra]);
 assert.equal(output.rgba[(7*f.image.width+7)*4+3],0);
 for(const cell of cells){
  const color=backgrounds.get(cell);
  if(color)assert.deepEqual([...output.rgba.subarray(cell*4,cell*4+4)],[...color,f.image.rgba[cell*4+3]]);
  else assert.equal(output.rgba[cell*4+3],0);
 }
});
test('background preservation regression runs in the unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-shared-residual-background.test.js'));
});
test('actual shared residual proof work reaches the private approved-application budget without metadata',async t=>{
 const f=setup(t,sourceSharedOutputFixture);
 await withApprovedBackdropBudget(async()=>{
  assert.equal(approvedBackdropBudget().sourceChecks,0);await build(f);
  const first=approvedBackdropBudget().sourceChecks;assert.ok(first>0&&first<4000000);
  await build(f);assert.equal(approvedBackdropBudget().sourceChecks,first*2);
 });
});
