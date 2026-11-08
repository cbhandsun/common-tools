'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {composeCompletedSceneSurfaces}=require('../packages/slideclone-core/scene-plan/source-scene-complete-surface-layers');
const {completeRegionPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
function fixture(){
 const shape={id:'measured-panel',type:'rect',box:{x:0,y:0,w:100,h:100},style:{fill:'#EEEEFF',stroke:'none'},
  source:{residualBackgroundFill:true,preserveResidualInterior:true}};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'panel',parentId:null,kind:'container',box:{x:0,y:0,w:100,h:100}}],objects:[],relations:[],
  observedInventory:[{regionId:'panel',containers:0,icons:0,relations:0}],
  regionPrograms:[{regionId:'panel',objects:[],relations:[],labels:[]}]};
 const input={page:{shapes:[shape],images:[],textBoxes:[]},plan,slideSize:{widthPt:100,heightPt:100},preflight:false,
  objects:new Map([['panel',['measured-panel']]]),relations:new Map(),interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:1,rejected:[]}};
 return {shape,plan,input};
}
test('completed measured region composes its surface after residual with exact member identity',()=>{
 const {shape,input}=fixture(),geometry=structuredClone(shape.box),style=structuredClone(shape.style);
 const result=completeRegionPrograms(input);
 assert.equal(result.evidence.completed,1);assert.deepEqual(result.evidence.surfaceLayers.promoted,['measured-panel']);
 assert.equal(result.page.shapes[0],shape);assert.deepEqual(shape.box,geometry);assert.deepEqual(shape.style,style);
 assert.equal(shape.source.preserveResidualInterior,false);assert.equal(shape.source.residualBackgroundFill,true);
});
test('missing dependency, unknown census and preflight preserve the source interior',()=>{
 for(const mode of ['dependency','census','preflight','absent-census']){
  const {shape,plan,input}=fixture();
  if(mode==='dependency'){plan.objects.push({id:'missing',regionId:'panel',kind:'icon',box:{x:10,y:10,w:10,h:10}});plan.regionPrograms[0].objects.push('missing');plan.observedInventory[0].icons=1;}
  if(mode==='census')plan.observedInventory[0].icons=null;
  if(mode==='preflight')input.preflight=true;
  if(mode==='absent-census')delete plan.observedInventory;
  completeRegionPrograms(input);assert.equal(shape.source.preserveResidualInterior,true,mode);
 }
});
test('incomplete nested region blocks enclosing surface even when direct census is complete',()=>{
 const {shape,plan,input}=fixture();
 plan.regions.push({id:'child',parentId:'panel',kind:'container',box:{x:10,y:10,w:10,h:10}});
 plan.regionPrograms.push({regionId:'child',objects:[],relations:[],labels:[]});
 plan.observedInventory.push({regionId:'child',containers:0,icons:0,relations:0});
 const result=completeRegionPrograms(input);
 assert.equal(result.evidence.completed,1);assert.equal(result.evidence.rejected[0].regionId,'child');
 assert.deepEqual(result.evidence.surfaceLayers.promoted,[]);assert.equal(shape.source.preserveResidualInterior,true);
});
test('a missing outer perimeter retains failure while a fully completed independent child composes its own paint',()=>{
 const {shape,plan,input}=fixture();
 plan.objects.push({id:'physical-child',regionId:'panel',kind:'container',box:{x:10,y:10,w:10,h:10},pictorialContent:'absent'});
 plan.regionPrograms[0].objects.push('physical-child');plan.observedInventory[0].containers=1;
 input.objects=new Map([['physical-child',['measured-panel']]]);
 const result=completeRegionPrograms(input);
 assert.equal(result.evidence.completed,0);assert.deepEqual(result.evidence.rejected[0].missing,['panel']);
 assert.deepEqual(result.evidence.surfaceLayers.promoted,['measured-panel']);assert.equal(shape.source.preserveResidualInterior,false);
});
test('failed descendants do not revoke separate direct object output in a semantic section',()=>{
 const {shape,plan,input}=fixture();plan.regions[0].kind='section';
 plan.objects.push({id:'physical-child',regionId:'panel',kind:'container',box:{x:0,y:0,w:10,h:100},pictorialContent:'absent'});
 plan.regionPrograms[0].objects.push('physical-child');plan.observedInventory[0].containers=1;
 input.objects=new Map([['physical-child',['measured-panel']]]);
 plan.regions.push({id:'nested',parentId:'panel',kind:'container',box:{x:20,y:20,w:50,h:50}});
 plan.regionPrograms.push({regionId:'nested',objects:[],relations:[],labels:[]});plan.observedInventory.push({regionId:'nested',containers:0,icons:0,relations:0});
 const result=completeRegionPrograms(input);
 assert.equal(result.evidence.completed,1);assert.equal(result.evidence.rejected[0].regionId,'nested');
 assert.deepEqual(result.evidence.surfaceLayers.promoted,['measured-panel']);
});
test('serialized flags and matching geometry never promote foreign or duplicate members',()=>{
 const {shape,plan,input}=fixture(),foreign=structuredClone(shape);foreign.id='foreign';
 foreign.source.nativeRegionComplete=true;
 const shapes=[shape,foreign];
 assert.deepEqual(composeCompletedSceneSurfaces(shapes,plan,new Set(['panel']),input.objects).promoted,['measured-panel']);
 assert.equal(foreign.source.preserveResidualInterior,true);
 const value=fixture();value.input.page.shapes.push(structuredClone(value.shape));
 assert.deepEqual(composeCompletedSceneSurfaces(value.input.page.shapes,value.plan,new Set(['panel']),value.input.objects).promoted,[]);
 assert.equal(value.shape.source.preserveResidualInterior,true);
});
test('nonopaque, missing paint, hostile metadata, empty receipt and deep failed descendants retain residual',()=>{
 let called=0;const trap=()=>{called++;throw Error('private-source');};
 for(const change of [s=>s.style.opacity=.5,s=>s.style.fillOpacity=.5,s=>s.style.fillTransparency=1,s=>s.style.fill='none',
  s=>delete s.source.residualBackgroundFill,s=>s.source=new Proxy({},{get:trap,ownKeys:trap}),
  s=>s.style={get fill(){return trap();}}]){
  const {shape,plan,input}=fixture();change(shape);
  assert.deepEqual(composeCompletedSceneSurfaces([shape],plan,new Set(['panel']),input.objects).promoted,[]);
 }
 assert.equal(called,0);
 const {shape,plan}=fixture();assert.deepEqual(composeCompletedSceneSurfaces([shape],plan,new Set(['panel']),new Map()).promoted,[]);
 assert.deepEqual(composeCompletedSceneSurfaces([],plan,new Set(),new Map()).promoted,[]);
 let parent='panel';const completed=new Set(['panel']);
 for(let i=0;i<23;i++){const id=`child-${i}`;plan.regions.push({id,parentId:parent,kind:'section',box:{x:0,y:0,w:100,h:100}});if(i<22)completed.add(id);parent=id;}
 assert.deepEqual(composeCompletedSceneSurfaces([shape],plan,completed,new Map([['panel',[shape.id]]])).promoted,[]);
});
test('surface composition regressions are discovered by unified unit and all suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/source-scene-complete-surface-layers.test.js')));
});
