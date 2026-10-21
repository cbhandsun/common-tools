'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {primitiveImage}=require('./helpers/scene-primitive-program-fixture.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const source={sourceHash:'a'.repeat(64),widthPx:360,heightPx:200,labelRefs:[]};
function proposal(kind='container',geometry={kind:'cylinder',seams:[.4,.7]}){
 return {coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:360,h:200}},
  {id:'unit',parentId:'root',kind,box:{x:30,y:30,w:100,h:100},nativeGeometry:geometry}],
  objects:[],relations:[]};
}

test('ordinary, compact and packed regions preserve executable geometry without duplicate objects or inventory slots',()=>{
 const ordinary=proposal(),parsed=parseSourceScenePlan(ordinary,source);
 assert.equal(parsed.regions[1].nativeGeometry.kind,'cylinder');assert.deepEqual(parsed.regions[1].nativeGeometry.seams,[.4,.7]);
 assert.equal(parsed.objects.length,0);assert.equal(ordinary.regions[1].nativeGeometry.radiusRatio,undefined);
 const compact={format:'compact-v8',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[[0,null,0,[0,0,1000,1000]],[1,0,2,[150,100,650,400],[3,.2,null,[.4,.7]]]],
  inventory:[[0,0,0,0],[1,0,0,0]],objects:[],relations:[],programs:[[0,[]],[1,[]]]};
 const packed={format:'packed-v1',regions:[[null,0,[0,0,1000,1000],[0,0,0]],[0,2,[150,100,650,400],[0,0,0],[3,.2,null,[.4,.7]]]],
  objects:[],relations:[],programs:[[],[]]};
 for(const parse of [parseSourceScenePlan,admitSourceScenePlan]){
  const plan=parse(compact,source);assert.deepEqual(plan,parse(packed,source));
  assert.equal(plan.regions[1].nativeGeometry.kind,'cylinder');assert.equal(plan.objects.length,0);
  assert.deepEqual(plan.observedInventory.map(o=>o.containers),[0,0]);
  assert.equal(plan.regions[1].kind,'container');
 }
});

test('region geometry boundary rejects semantic owners, invalid, extreme and unsafe controls',()=>{
 for(const kind of ['section','diagram','table','unknown'])assert.throws(()=>parseSourceScenePlan(proposal(kind),source),/geometry owner/u);
 for(const geometry of [null,[],{},'cylinder',{kind:'bad'},{kind:'cylinder',seams:[.8,.2]},
  {kind:'ellipse',capRatio:Infinity},{kind:'ellipse',sourceOwned:true}])
  assert.throws(()=>parseSourceScenePlan(proposal('container',geometry),source),TypeError);
 let reads=0;const hostile={get kind(){reads++;return 'cylinder';}};
 assert.throws(()=>parseSourceScenePlan(proposal('container',hostile),source),TypeError);
 assert.throws(()=>parseSourceScenePlan(proposal('container',new Proxy({kind:'ellipse'},{get(){reads++;throw Error('private');}})),source),TypeError);
 assert.equal(reads,0);
 const raw=proposal();delete raw.regions[1].nativeGeometry;
 assert.equal(parseSourceScenePlan(raw,source).regions[1].nativeGeometry,undefined);
});

function compile(t,options={}){
 const fixture=primitiveImage('cylinder',options),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-region-program-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,fixture.image);
 const binding={sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),
  widthPx:fixture.image.width,heightPx:fixture.image.height,labelRefs:[]};
 const raw=proposal('container',fixture.nativeGeometry);
 raw.regions[0].box={x:0,y:0,w:fixture.image.width,h:fixture.image.height};raw.regions[1].box=fixture.box;
 raw.inventory=[['root',0,0,0],['unit',0,0,0]];
 raw.programs=[{regionId:'root',objects:[],relations:[],labels:[]},{regionId:'unit',objects:[],relations:[],labels:[]}];
 const plan=admitSourceScenePlan(raw,binding);
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,
  slideSize:{widthPt:fixture.image.width,heightPt:fixture.image.height}});
 return {plan,result};
}

test('the real compiler constructs every region face, source-verifies them and completes the physical region',t=>{
 const {plan,result}=compile(t);
 assert.equal(plan.regions[1].kind,'container');assert.equal(plan.objects.length,0);
 assert.equal(result.evidence.nativeProgram.admitted,1);
 assert.equal(result.evidence.nativeProgram.parts,4);
 assert.deepEqual(result.evidence.unresolved,[]);
 assert.equal(result.evidence.regionPrograms.completed,2);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 assert.equal(result.page.shapes.filter(s=>s.source?.detector==='source-scene-native-program').length,4);
 assert.equal(result.page.shapes.some(s=>s.source?.sceneInventoryId==='region-unit'),false);
 assert.deepEqual(result.evidence.observedInventory.regions[1].materialized,{containers:0,icons:0,relations:0});
});

test('a missing region divider rejects the whole program and retains the original completion failure',t=>{
 const {result}=compile(t,{missingSeam:true});
 assert.equal(result.evidence.nativeProgram.admitted,0);
 assert.ok(result.evidence.unresolved.some(r=>r.id==='region-unit'&&r.reason==='native-program-source-evidence'));
 assert.ok(result.evidence.unresolved.some(r=>r.id==='region-unit'&&r.reason==='region-members-incomplete'));
 assert.equal(result.page.shapes.some(s=>s.source?.detector==='source-scene-native-program'),false);
});
