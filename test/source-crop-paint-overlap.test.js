'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareSceneCropPaint:prepare,sceneCropPaintDisjoint:disjoint}=require('../packages/slideclone-core/scene-plan/source-crop-paint-overlap');
const {writePng}=require('../packages/slideclone-core/png');
const {bindSourceScenePhysicalGroups:bind}=require('../packages/slideclone-core/scene-plan/source-scene-physical-groups');
const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {retainedSceneGroupMembers:retained}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crop-paint-overlap-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const file=path.join(root,'assets/crop.png'),raster={width:40,height:40,rgba:Buffer.alloc(40*40*4,255)};
 for(let y=10;y<30;y++)for(let x=10;x<30;x++)raster.rgba[(y*40+x)*4+3]=0;
 writePng(file,raster);
 const item={id:'captured-image',type:'fidelity-crop',assetPath:'assets/crop.png',box:{x:20,y:20,w:40,h:40},source:{}};
 const token=prepare([item],root),bounds={x:35,y:35,w:5,h:5};return {root,file,raster,item,token,bounds};
}
const work=()=>({used:0,exhausted:false});
test('actual transparent pixels permit native node and label grouping without altering output paint',t=>{
 const f=fixture(t),image={width:100,height:100,rgba:Buffer.alloc(40000,255)},box={x:25,y:25,w:30,h:30};
 const sourceBefore=Buffer.from(image.rgba),fileBefore=fs.readFileSync(f.file);
 const input={image,slideSize:{widthPt:100,heightPt:100},shapes:[{id:'scene-container-panel',box,source:{editable:true}}],images:[f.item],
  textBoxes:[{id:'label',text:'Native label',box:f.bounds,source:{editable:true,evidenceBox:f.bounds}}],
  physicalNodes:[{proposalId:'panel',node:{box,portFrame:createMeasuredScenePortFrame(image,{box,fill:'#FFFFFF'})}}]};
 assert.equal(bind(input).evidence.physicalGroupPaintConflicts,1);
 const result=bind({...input,cropPaintToken:f.token});
 assert.equal(result.evidence.physicalGroups,1);assert.equal(result.textBoxes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.equal(result.shapes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.deepEqual(result.textBoxes[0].box,f.bounds);assert.equal(result.textBoxes[0].text,'Native label');
 assert.deepEqual(input.textBoxes[0].source,{editable:true,evidenceBox:f.bounds});
 const page={shapes:result.shapes,images:[f.item],textBoxes:result.textBoxes},receipt=result.sealGroups(page);
 assert.equal(retained(page,receipt).size,2);
 const opaque={...f.raster,rgba:Buffer.alloc(f.raster.rgba.length,255)};writePng(f.file,opaque);
 assert.equal(retained(page,receipt).size,0,'later output refinements revoke the transient alpha proof');
 writePng(f.file,f.raster);
 assert.deepEqual(fs.readFileSync(f.file),fileBefore);assert.deepEqual(image.rgba,sourceBefore);
 assert.ok(disjoint(f.token,f.item,f.bounds,work()));
});
test('one opaque or partial-alpha texel, including the filtering halo, still rejects regrouping',t=>{
 const f=fixture(t);
 for(const [x,y,alpha] of [[15,15,255],[15,15,1],[14,15,1]]){
  const raster={...f.raster,rgba:Buffer.from(f.raster.rgba)};raster.rgba[(y*40+x)*4+3]=alpha;writePng(f.file,raster);
  assert.equal(disjoint(f.token,f.item,f.bounds,work()),false);
 }
 writePng(f.file,f.raster);assert.equal(disjoint(f.token,f.item,f.bounds,work()),true);
});
test('an already-read asset is revalidated after alpha changes and shared file identities use fresh bytes',t=>{
 const f=fixture(t);assert.equal(disjoint(f.token,f.item,f.bounds,work()),true);
 const other={...f.item,id:'second'},token=prepare([f.item,other],f.root);
 assert.equal(disjoint(token,f.item,f.bounds,work()),true);
 const opaque={...f.raster,rgba:Buffer.alloc(f.raster.rgba.length,255)};writePng(f.file,opaque);
 assert.equal(disjoint(token,other,f.bounds,work()),false);assert.equal(disjoint(f.token,f.item,f.bounds,work()),false);
});
test('scaled output geometry maps the queried paint box into actual PNG coordinates',t=>{
 const f=fixture(t);f.item.box={x:100,y:80,w:80,h:120};
 assert.equal(disjoint(f.token,f.item,{x:130,y:125,w:10,h:15},work()),true);
 assert.equal(disjoint(f.token,f.item,{x:102,y:82,w:10,h:15},work()),false);
 assert.equal(disjoint(f.token,f.item,{x:500,y:500,w:2,h:2},work()),true);
});
test('full-page transparent residuals use actual alpha within the bounded output pixel allowance',t=>{
 const f=fixture(t),raster={width:600,height:600,rgba:Buffer.alloc(600*600*4)};writePng(f.file,raster);
 assert.equal(disjoint(f.token,f.item,f.bounds,work()),true);
 const {retainedSceneCropPaint:retainedPaint}=require('../packages/slideclone-core/scene-plan/source-crop-paint-overlap');
 assert.equal(retainedPaint(f.token,work()),true);
 f.item.box={...f.item.box,x:f.item.box.x+1};assert.equal(retainedPaint(f.token,work()),false);
 assert.equal(retainedPaint(structuredClone(f.token),work()),false);
});
test('serialized tokens, metadata flags, foreign objects and unsupported image effects grant no proof',t=>{
 const f=fixture(t);
 for(const token of [null,{},structuredClone(f.token)])assert.equal(disjoint(token,f.item,f.bounds,work()),false);
 assert.equal(disjoint(f.token,structuredClone(f.item),f.bounds,work()),false);
 for(const change of [{rotation:1},{flipH:true},{opacity:0},{style:{shadow:{}}},{style:{assetPath:'assets/other.png'}},{style:{opacity:NaN}}]){
  const changed={...f.item,...change},token=prepare([changed],f.root);
  assert.equal(disjoint(token,changed,f.bounds,work()),false);
 }
 f.item.source={transparent:true,editable:true};assert.equal(disjoint(f.token,f.item,{x:20,y:20,w:2,h:2},work()),false);
});
test('empty input and invalid boundaries are conservative and never invoke hostile hooks',t=>{
 const f=fixture(t);assert.ok(prepare([],f.root));let calls=0;
 const hostile={};Object.defineProperty(hostile,'box',{get(){calls++;throw Error('secret');}});
 const proxy=new Proxy({}, {get(){calls++;throw Error('secret');}});
 for(const value of [hostile,proxy,null]){
  assert.throws(()=>prepare([value],f.root),TypeError);assert.equal(disjoint(f.token,value,f.bounds,work()),false);
 }
 assert.equal(calls,0);
 for(const bounds of [{x:0,y:0,w:0,h:1},{x:NaN,y:0,w:1,h:1},null])assert.equal(disjoint(f.token,f.item,bounds,work()),false);
 for(const state of [{used:-1,exhausted:false},{used:Infinity,exhausted:false},{used:0,exhausted:true}])assert.equal(disjoint(f.token,f.item,f.bounds,state),false);
 assert.throws(()=>prepare([],'.'),TypeError);
 const sparse=[];sparse.length=1;assert.throws(()=>prepare(sparse,f.root),TypeError);
});
test('derived geometry consumes the existing four-million check cap and never grants partial success',t=>{
 const f=fixture(t),state={used:3999999,exhausted:false};
 assert.equal(disjoint(f.token,f.item,f.bounds,state),false);assert.equal(state.exhausted,true);
 assert.equal(disjoint(f.token,f.item,f.bounds,state),false);
});
test('asset traversal and symlink escapes cannot be used to read external pixels',t=>{
 const f=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'crop-paint-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 writePng(path.join(outside,'crop.png'),f.raster);fs.symlinkSync(outside,path.join(f.root,'assets/link'),'junction');
 for(const assetPath of ['../outside.png',path.join(outside,'crop.png'),'assets/link/crop.png','assets/crop.png\0']){
  const item={...f.item,assetPath},token=prepare([item],f.root);assert.equal(disjoint(token,item,f.bounds,work()),false);
 }
});
test('oversized legitimate assets retain conservative behavior and malformed current bytes remain errors',t=>{
 const f=fixture(t),large={width:2049,height:2048,rgba:Buffer.alloc(2049*2048*4)};writePng(f.file,large);
 assert.equal(disjoint(f.token,f.item,f.bounds,work()),false);
 fs.writeFileSync(f.file,Buffer.from('invalid PNG'));assert.throws(()=>disjoint(f.token,f.item,f.bounds,work()));
 fs.unlinkSync(f.file);assert.throws(()=>disjoint(f.token,f.item,f.bounds,work()),{code:'ENOENT'});
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});
