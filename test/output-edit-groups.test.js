'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateOutputEditGroups:validate}=require('../packages/slideclone-core/scene-plan/output-edit-groups');
const {validateDeckIr}=require('../packages/slideclone-core/deck-ir-admission');
function fixture(){
 const box={x:10,y:10,w:40,h:20};
 return {pageIndex:0,sourceImage:'',shapes:[{id:'body',type:'rect',box,source:{detector:'source-scene-container'}}],images:[],
  textBoxes:[{id:'label',text:'Node',box}],outputEditGroups:[{id:'node',members:['body','label']}]};
}
test('output edit plans survive full IR admission without rewriting measured objects',()=>{
 const page=fixture(),before=structuredClone(page);
 assert.deepEqual(validate(page),page.outputEditGroups);
 validateDeckIr({version:'1.0',slideSize:{widthPt:100,heightPt:100},pages:[page]},process.cwd());
 assert.deepEqual(page,before);
 assert.deepEqual(validate({}),[]);page.outputEditGroups=[];assert.deepEqual(validate(page),[]);
});
test('malformed, empty, duplicate, unknown and conflicting output membership fails closed',()=>{
 for(const change of [p=>p.outputEditGroups=null,p=>p.outputEditGroups[0].members=[],p=>p.outputEditGroups[0].members=['body'],
  p=>p.outputEditGroups[0].members=['body','body'],p=>p.outputEditGroups[0].members.push('missing'),
  p=>p.outputEditGroups.push({...p.outputEditGroups[0]}),p=>p.outputEditGroups.push({id:'other',members:['body','label']}),
  p=>p.outputEditGroups[0].id='../private',p=>p.outputEditGroups[0].strictSourceEquivalent=true,
  p=>p.shapes.push({...p.shapes[0]}),p=>p.shapes[0].source.nativeComponentGroupId='measured',
  p=>p.textBoxes[0].style={nativeComponentGroupId:'existing'},
  p=>p.shapes.push({id:'independent',source:{nativeComponentGroupId:'node'}}),
  p=>p.shapes[0].style={startAnchor:{elementId:'label'}},p=>p.shapes[0].style={endAnchor:{elementId:'label'}},
  p=>p.shapes[0].source.sceneRelationId='route',p=>p.shapes[0].source.nativeConnectorRoute=true,
  p=>delete p.outputEditGroups[0].members[0],p=>p.outputEditGroups=Array(97).fill(p.outputEditGroups[0]),
  p=>p.outputEditGroups[0].members=Array(129).fill('body')]){
  const page=fixture();change(page);const before=structuredClone(page);
  assert.throws(()=>validate(page),{name:'TypeError',message:'Output edit grouping is invalid'});assert.deepEqual(page,before);
 }
});
test('output plans cannot run accessors, proxy traps or coercion, or leak content in errors',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-data');};
 for(const edit of [p=>Object.defineProperty(p.outputEditGroups[0],'members',{get:trap}),
  p=>p.outputEditGroups=new Proxy([],{get:trap,ownKeys:trap}),p=>p.outputEditGroups[0].id={toString:trap},
  p=>Object.defineProperty(p.shapes[0].source,'nativeComponentGroupId',{get:trap})]){
  const p=fixture();edit(p);assert.throws(()=>validate(p),{name:'TypeError',message:'Output edit grouping is invalid'});
 }assert.equal(calls,0);
});
test('full admission rejects alternate page field casing and invalid plans',()=>{
 for(const change of [p=>{p.OutputEditGroups=p.outputEditGroups;delete p.outputEditGroups;},
  p=>p.outputEditGroups[0].members.push('unknown')]){
  const page=fixture();change(page);
  assert.throws(()=>validateDeckIr({version:'1.0',slideSize:{widthPt:100,heightPt:100},pages:[page]},process.cwd()));
 }
});
test('maximum bounded plan works and is in typed, shipped, unified unit and all gates',()=>{
 const page={shapes:[],images:[],textBoxes:[],outputEditGroups:[]};
 for(let group=0;group<96;group++){
  const members=[];for(let i=0;i<2;i++){const id=`s-${group}-${i}`;members.push(id);page.shapes.push({id});}
  page.outputEditGroups.push({id:`g-${group}`,members});
 }assert.equal(validate(page).length,96);
 const file='packages/slideclone-core/scene-plan/output-edit-groups.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/output-edit-groups.test.js'));
});
