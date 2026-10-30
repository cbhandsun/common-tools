'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceCurvedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute,sharedSourceAntialiasBackground}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {sourceSharedResidualErasurePlan:plan,sharedResidualBackdropPlans}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
const target=76*300+155,bg=[235,248,241];
function fixture(gradient=false){const f=sourceCurvedNetworkFixture();
 for(let n=0;n<300*230;n++)if(f.image.rgba.subarray(n*4,n*4+3).every(v=>v===255))f.image.rgba.set([...(gradient?[230+Math.floor(n%300/25),248,241]:bg),255],n*4);
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);return {...f,fit:measured.fit};
}
test('a complete measured curved shaft supplies continuity without changing its independent background proof',()=>{
 for(const gradient of [false,true]){const f=fixture(gradient),pixels=Buffer.from(f.image.rgba),geometry=structuredClone(f.fit),work={checks:0};
  const rows=sharedSourceAntialiasBackground(f.fit,f.image,work),row=rows?.find(r=>r.cell===target);
  assert.ok(row,'the curve lip must follow the measured interior path rather than four fixed probe directions');
  assert.ok(row.color.every((v,c)=>Math.abs(v-(gradient?[236,248,241]:bg)[c])<=1));
  assert.deepEqual(f.image.rgba,pixels);assert.deepEqual(f.fit,geometry);assert.ok(work.checks<=4000000);
 }
});
test('the real eraser and ownership audit restore a curved shaft only with complete live output membership',()=>{
 const f=fixture(),built=compileSharedSourceRoute({fit:f.fit,image:f.image,relations:networkRelations,id:'shaft-background',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},wholeRelations:true,connectorCornerMode:'rounded-freeform'});
 const bodies=f.nodes.map(n=>({id:n.id,type:'rect',box:{...n.box}})),shapes=[...bodies,...built.parts],before=structuredClone(shapes);
 const receipt=plan(f.image,shapes,built.parts,{w:300,h:230});assert.ok(sharedResidualBackdropPlans(f.image,receipt.masks).some(r=>r.cell===target));
 const output=eraseMasks(f.image,receipt.masks,{transparent:true});assert.deepEqual([...output.rgba.subarray(target*4,target*4+4)],[...bg,255]);
 assert.equal(auditResidualPixelOwnership({source:f.image,residual:output,masks:receipt.masks}).passed,true);assert.deepEqual(shapes,before);
 const corrupted={...output,rgba:Buffer.from(output.rgba)};corrupted.rgba[target*4+3]=0;assert.equal(auditResidualPixelOwnership({source:f.image,residual:corrupted,masks:receipt.masks}).passed,false);
 for(const [actual,erased]of [[structuredClone(shapes),built.parts],[shapes,built.parts.slice(1)]])assert.deepEqual(sharedResidualBackdropPlans(f.image,plan(f.image,actual,erased,{w:300,h:230}).masks),[]);
 assert.throws(()=>sharedResidualBackdropPlans(f.image,receipt.masks.map(m=>({...m}))),/proof/u);
});
test('serialized or stale fit metadata cannot supply shaft continuity and a late budget failure returns no partial background',()=>{
 const f=fixture(),other=fixture();for(const fit of [null,{},structuredClone(f.fit),other.fit])assert.equal(sharedSourceAntialiasBackground(fit,f.image,{checks:0}),null);
 const forged=structuredClone(f.fit);forged.shaftCells=Array(100).fill(target);assert.equal(sharedSourceAntialiasBackground(forged,f.image,{checks:0}),null);
 f.image.rgba[0]^=1;assert.equal(sharedSourceAntialiasBackground(f.fit,f.image,{checks:0}),null);f.image.rgba[0]^=1;
 const full={checks:0};assert.ok(sharedSourceAntialiasBackground(f.fit,f.image,full));const work={checks:4000000-full.checks+1};assert.equal(sharedSourceAntialiasBackground(f.fit,f.image,work),null);assert.ok(work.checks>4000000);
});
test('shaft continuity modules and regressions enter strict type checking, installed packages and unified CI',()=>{
 const file='packages/slideclone-core/routing/source-route-shaft-continuity.js';assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])for(const name of ['source-route-shaft-continuity.test.js','source-shared-shaft-background.test.js'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/'+name));
});
