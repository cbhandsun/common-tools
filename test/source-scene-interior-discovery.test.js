'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectSceneInteriorTargets}=require('../packages/slideclone-core/scene-plan/source-scene-interior-targets');
const {discoverSceneInteriorForeground:discover}=require('../packages/slideclone-core/scene-plan/source-scene-interior-discovery');
const {measureSceneIconBackdrop}=require('../packages/slideclone-core/scene-plan/source-scene-parametric-surface');
const {createSceneGlyphOcclusion,sceneIconTextFootprint}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
const {withSceneFillRasterCache:withCache,readSceneFillRaster:read}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
function plan(){return {version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:300,
 regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
 objects:[{id:'known',kind:'container',regionId:'region',pictorialContent:'present',box:{x:20,y:20,w:160,h:180}},
  {id:'optional',kind:'container',regionId:'region',box:{x:220,y:20,w:160,h:130}}],relations:[]};}
test('a declared pictorial parent is a required unit even without any relation proposal',()=>{
 const p=plan(),before=structuredClone(p),result=selectSceneInteriorTargets(p,[],2,[],true);
 assert.deepEqual(result.map(t=>t.parent.id),['known']);assert.deepEqual(p,before);
 assert.deepEqual(selectSceneInteriorTargets(p,[],2),[]);
});
test('source-driven discovery reserves one target per parent instead of spending slots on its empty text gaps',()=>{
 const p=plan();p.objects[1].pictorialContent='present';p.relations=[{id:'link',regionId:'region',fromId:'known',toId:'optional',direction:'forward'}];
 const texts=[50,100,150].map(y=>({x:100,y,w:60,h:24}));
 const result=selectSceneInteriorTargets(p,texts,2,[],true);
 assert.equal(result.length,2);assert.equal(new Set(result.map(t=>t.parent.id)).size,2);
 assert.deepEqual(selectSceneInteriorTargets({...p,objects:p.objects.toReversed()},texts,2,[],true),result);
 assert.deepEqual(selectSceneInteriorTargets(p,texts,2,['known'],true).map(t=>t.parent.id),['optional']);
 assert.deepEqual(selectSceneInteriorTargets(p,texts,0,[],true),[]);
});
test('source-driven discovery retains absent, containment, capacity and hostile-control rejection',()=>{
 const p=plan();p.objects[0].pictorialContent='absent';assert.deepEqual(selectSceneInteriorTargets(p,[],2,[],true),[]);
 p.objects[0].pictorialContent='present';p.objects[0].regionId='unknown';assert.deepEqual(selectSceneInteriorTargets(p,[],2,[],true),[]);
 p.objects[0].regionId='region';p.objects[0].box.w=500;assert.deepEqual(selectSceneInteriorTargets(p,[],2,[],true),[]);
 for(const cap of [-1,33,Infinity,1.5])assert.throws(()=>selectSceneInteriorTargets(plan(),[],cap,[],true),RangeError);
 assert.throws(()=>selectSceneInteriorTargets(plan(),[],2,[],{}),TypeError);
 let reads=0;const ids=[];Object.defineProperty(ids,0,{get(){reads++;throw Error('sensitive-test-content');}});
 assert.throws(()=>selectSceneInteriorTargets(plan(),[],2,ids,true),TypeError);assert.equal(reads,0);
});
function rasterFixture(){
 const image={width:200,height:130,rgba:Buffer.alloc(200*130*4,255)},box={x:20,y:15,w:140,h:90},budget={used:0};
 for(let y=15;y<105;y++)for(let x=20;x<160;x++)image.rgba.set(x<22||x>=158||y<17||y>=103?[0,120,200,255]:[235,245,250,255],(y*200+x)*4);
 for(let y=40;y<70;y++)for(let x=70;x<105;x++)image.rgba.set([40,120,200,255],(y*200+x)*4);
 return {image,box,budget,textMasks:[]};
}
test('foreground candidates follow the observed picture instead of an empty label gap, without mutating source',()=>{
 const f=rasterFixture(),before=Buffer.from(f.image.rgba);
 const backdrop=measureSceneIconBackdrop(f.image,f.box,[],f.budget);assert.ok(backdrop);
 const result=discover({...f,backdrop});assert.deepEqual(result,{seed:{x:70,y:40,w:35,h:30},components:1});
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 for(const copied of [{},structuredClone(backdrop),new Proxy({}, {})])assert.equal(discover({...f,backdrop:copied}),null);
 assert.equal(discover({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)},backdrop}),null);
 assert.equal(discover({...f,budget:{used:0},backdrop}),null);
});
test('one-cell fringes, empty backgrounds, monochrome glyphs and source components clipped at a parent are not picture seeds',()=>{
 for(const mode of ['fringe','empty','neutral','clipped']){
  const f=rasterFixture();for(let y=40;y<70;y++)for(let x=70;x<105;x++)f.image.rgba.set([235,245,250,255],(y*200+x)*4);
  if(mode==='fringe')f.image.rgba.set([40,120,200,255],(50*200+80)*4);
  if(mode==='neutral')for(let y=40;y<70;y++)for(let x=70;x<105;x++)f.image.rgba.set([20,20,20,255],(y*200+x)*4);
  if(mode==='clipped')for(let y=40;y<70;y++)for(let x=20;x<105;x++)f.image.rgba.set([40,120,200,255],(y*200+x)*4);
  const backdrop=measureSceneIconBackdrop(f.image,f.box,[],f.budget);
  assert.equal(discover({...f,backdrop:backdrop??undefined}),null,mode);
 }
});
test('colored source glyphs are excluded as complete components rather than cut into candidate fragments',()=>{
 const f=rasterFixture();for(let y=40;y<70;y++)for(let x=70;x<105;x++)f.image.rgba.set([235,245,250,255],(y*200+x)*4);
 for(let y=40;y<65;y++)for(let x=70;x<74;x++)f.image.rgba.set([220,20,20,255],(y*200+x)*4);
 const text={text:'I',box:{x:65,y:35,w:20,h:35},font:{color:'#DC1414'}};
 const glyphOcclusion=createSceneGlyphOcclusion(f.image,[text],{widthPt:200,heightPt:130},f.budget);
 const proof=sceneIconTextFootprint(glyphOcclusion,f.image,f.budget,text.box);assert.ok(proof);assert.equal(proof(72,50),true);
 const backdrop=measureSceneIconBackdrop(f.image,f.box,[text.box],f.budget,glyphOcclusion);assert.ok(backdrop);
 assert.equal(discover({...f,textMasks:[text.box],glyphOcclusion,backdrop}),null);
 assert.equal(discover({...f,textMasks:[text.box],glyphOcclusion:{},backdrop}),null);
});
test('source discovery reuses the original cached cells at 4M and rejects a genuine overrun atomically',()=>{
 const f=rasterFixture();withCache(f.image,f.budget,()=>{
  const backdrop=measureSceneIconBackdrop(f.image,f.box,[],f.budget);read(f.image,f.box,f.budget);f.budget.used=4000000;
  assert.ok(discover({...f,backdrop}));assert.equal(f.budget.used,4000000);
 });
 const other=rasterFixture(),backdrop=measureSceneIconBackdrop(other.image,other.box,[],other.budget);
 other.budget.used=4000000;assert.equal(discover({...other,backdrop}),null);assert.equal(other.budget.used,4000000);
});
test('private backdrop validation and discovery never evaluate pixel-view buffer accessors',()=>{
 const f=rasterFixture(),backdrop=measureSceneIconBackdrop(f.image,f.box,[],f.budget);let reads=0;
 for(const name of ['buffer','byteOffset','byteLength'])Object.defineProperty(f.image.rgba,name,{get(){reads++;throw Error('sensitive-test-data');}});
 assert.ok(discover({...f,backdrop}));assert.equal(reads,0);
});
test('discovery rejects malformed, extreme and hostile controls before executing their accessors',()=>{
 const f=rasterFixture();let reads=0;const hostile={get image(){reads++;throw Error('sensitive-test-data');}};
 for(const input of [null,hostile,new Proxy(f,{}),{...f,box:{...f.box,w:Infinity}},{...f,textMasks:[{}]},
  {...f,budget:{get used(){reads++;throw Error('sensitive-test-data');}}}])assert.throws(()=>discover(input),TypeError);
 assert.equal(reads,0);
 const huge={width:600,height:600,rgba:Buffer.alloc(600*600*4,255)};
 assert.throws(()=>discover({...f,image:huge,box:{x:0,y:0,w:600,h:600}}),RangeError);
});
test('legacy optional interiors keep their admitted source path without acquiring new parent or glyph context',()=>{
 const {measureSceneInterior}=require('../packages/slideclone-core/scene-plan/source-scene-interior-measurement');
 const f=rasterFixture();let calls=0;
 const request={image:f.image,box:{x:70,y:40,w:35,h:30},searchBox:f.box,id:'node',regionId:'region',root:process.cwd(),
  slideSize:{widthPt:200,heightPt:130},textBoxes:[],budget:f.budget};
 const {measureSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
 const expected=measureSceneIcon({...request,budget:{used:0}});
 const actual=measureSceneInterior(request,{textMasks:[],sourceDriven:false,recoverSource(){calls++;throw Error('Unexpected optional recovery');}});
 assert.deepEqual(actual,expected);assert.equal(calls,0);
});
test('the production compiler generates native interior paths for a declared node with no relation proposals',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {compileSourceScene,preflightSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=rasterFixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-required-interior-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(let y=40;y<70;y++)for(let x=70;x<105;x++)f.image.rgba.set([235,245,250,255],(y*200+x)*4);
 for(let y=44;y<=66;y++)for(let x=74;x<=96;x++){
  const distance=Math.hypot(x-85,y-55);if(distance<=11)f.image.rgba.set(distance>9?[20,20,20,255]:[40,120,200,255],(y*200+x)*4);
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const p={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:200,heightPx:130,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:130}}],
  objects:[{id:'node',kind:'container',regionId:'region',box:f.box,pictorialContent:'present'}],relations:[]};
 const page={shapes:[],images:[],textBoxes:[]},before=structuredClone(page),request={root,sourceFile,plan:p,page,slideSize:{widthPt:200,heightPt:130}};
 const preflight=preflightSourceScene(request);assert.equal(preflight.evidence.interiorTargets,undefined);
 const compiled=compileSourceScene({...request,compilationSession:preflight.compilationSession});
 assert.equal(compiled.evidence.interiorTargets,1);assert.equal(compiled.evidence.interiorGroups,1,JSON.stringify(compiled.evidence.interiorRejected));
 const paths=compiled.page.shapes.filter(s=>s.source?.sceneInteriorParentId==='node');assert.ok(paths.length);
 assert.ok(paths.every(s=>s.source.editable===true&&s.style.freeformSegments.length<=120));
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);assert.ok(compiled.evidence.glyphOwnedPixels<=100000);
 assert.equal(compiled.evidence.resolvedRelations,0);assert.deepEqual(page,before);
});
