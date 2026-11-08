'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measuredSceneBackgroundMembers:members,rebindSceneBackgroundMember:rebind,groupedSceneBackgroundMembers:groupedMembers}=require('../packages/slideclone-core/scene-plan/source-scene-background-members');
const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {bindSourceScenePhysicalGroups:bind}=require('../packages/slideclone-core/scene-plan/source-scene-physical-groups');
const {retainedSceneGroupMembers:retained}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
function fixture(){
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},box={x:10,y:10,w:80,h:80};
 const background={id:'background',type:'rect',box:{x:20,y:20,w:60,h:60},style:{fill:'#FEF5F1',stroke:'none',strokeWidthPt:0},
  source:{detector:'solid-region-native-background',residualBackgroundFill:true}};
 return {image,slideSize:{widthPt:100,heightPt:100},shapes:[
  {id:'scene-container-panel',type:'rect',box,style:{fill:'#FEF5F3',stroke:'none'},source:{editable:true}},background,
  {id:'scene-outline-panel',type:'rect',box,style:{fill:'#ABCDEF',stroke:'none'},source:{editable:true}}],images:[],
  textBoxes:[{id:'label',text:'Card',box:{x:30,y:30,w:20,h:10},source:{editable:true,evidenceBox:{x:30,y:30,w:20,h:10}}}],
  physicalNodes:[{proposalId:'panel',node:{box,portFrame:createMeasuredScenePortFrame(image,{box,fill:'#FEF5F3'})}}],work:{used:0,exhausted:false}};
}
test('an existing interleaved background joins the entire measured card without changing paint or input',()=>{
 const f=fixture(),before=structuredClone({shapes:f.shapes,textBoxes:f.textBoxes}),pixels=Buffer.from(f.image.rgba);
 assert.deepEqual(members(f).get('panel'),[f.shapes[1]]);
 const grouped=bind(f);assert.equal(grouped.evidence.physicalGroups,1);assert.equal(grouped.evidence.physicallyGroupedText,1);
 for(const shape of grouped.shapes)assert.equal(shape.source.nativeComponentGroupId,'scene-unit-panel');
 assert.deepEqual(grouped.shapes.map(s=>({...s,source:undefined})),f.shapes.map(s=>({...s,source:undefined})));
 const page={shapes:grouped.shapes,images:[],textBoxes:grouped.textBoxes};assert.equal(retained(page,grouped.sealGroups(page)).size,4);
 assert.deepEqual({shapes:f.shapes,textBoxes:f.textBoxes},before);assert.deepEqual(f.image.rgba,pixels);
 assert.equal(grouped.shapes[1].source.pixelOwnership,undefined);
});
test('empty input and missing, copied or cross-source tokens grant no background membership',()=>{
 const f=fixture();assert.equal(members({...f,shapes:[]}).size,0);
 for(const token of [null,{},structuredClone(f.physicalNodes[0].node.portFrame)]){
  const nodes=[{...f.physicalNodes[0],node:{...f.physicalNodes[0].node,portFrame:token}}];assert.equal(members({...f,physicalNodes:nodes}).size,0);
 }
 assert.equal(members({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).size,0);
});
test('the unique inner measured body owns paint, while equal or crossing bodies remain ambiguous',()=>{
 const f=fixture(),box={x:15,y:15,w:70,h:70};
 const inner={proposalId:'inner',node:{box,portFrame:createMeasuredScenePortFrame(f.image,{box,fill:'#FFFFFF'})}};
 assert.deepEqual([...members({...f,physicalNodes:[...f.physicalNodes,inner]}).keys()],['inner']);
 const equal={...f.physicalNodes[0],proposalId:'equal'};assert.equal(members({...f,physicalNodes:[...f.physicalNodes,equal]}).size,0);
 const crossBox={x:5,y:15,w:80,h:80},cross={proposalId:'cross',node:{box:crossBox,portFrame:createMeasuredScenePortFrame(f.image,{box:crossBox,fill:'#FFFFFF'})}};
 assert.equal(members({...f,physicalNodes:[...f.physicalNodes,cross]}).size,0);
});
test('effects, prior groups, independent identities, foreign paint and invalid geometry are excluded',()=>{
 const changes=[{type:'freeform'},{rotation:1},{box:{x:0,y:0,w:100,h:100}},{box:{x:20,y:20,w:0,h:1}},
  {style:{fill:'#FFF'}},{style:{fill:'#FFFFFF',gradient:{}}},{style:{fill:'#FFFFFF',opacity:.5}},
  {style:{fill:'#FFFFFF',stroke:'#000000'}},{style:{fill:'#FFFFFF',strokeWidthPt:1}},
  {source:{detector:'other',residualBackgroundFill:true}},
  ...['nativeComponentGroupId','sceneInventoryId','sceneRelationId','role'].map(key=>({source:{detector:'solid-region-native-background',residualBackgroundFill:true,[key]:'foreign'}}))];
 for(const change of changes){const f=fixture();f.shapes[1]={...f.shapes[1],...change};assert.equal(members(f).size,0,JSON.stringify(change));}
 const f=fixture();f.physicalNodes[0].node.parentPaint={};assert.equal(members(f).size,0);
});
test('a foreign intervening drawable still blocks whole-card grouping',()=>{
 const f=fixture();f.shapes.splice(2,0,{id:'foreign',type:'rect',box:{x:30,y:30,w:20,h:10},style:{fill:'#112233'},source:{}});
 assert.equal(bind(f).evidence.physicalGroups,0);
});
test('source and slide scaling use the complete rectangle and not only its center',()=>{
 const f=fixture();f.slideSize={widthPt:50,heightPt:50};f.shapes[1].box={x:10,y:10,w:30,h:30};
 assert.equal(members(f).get('panel').length,1);f.shapes[1].box={x:0,y:10,w:30,h:30};assert.equal(members(f).size,0);
});
test('invalid descriptors and boundary inputs are rejected without invoking user code',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'image',{get(){calls++;throw Error('secret');}});
 const proxy=new Proxy({}, {get(){calls++;throw Error('secret');}});
 for(const value of [null,hostile,proxy])assert.throws(()=>members(value),TypeError);
 assert.equal(calls,0);
 for(const change of [{slideSize:{widthPt:0,heightPt:100}},{work:{used:-1,exhausted:false}},{image:{width:100,height:100,rgba:Buffer.alloc(4)}},{shapes:[null]},
  {physicalNodes:Array.from({length:97},()=>fixture().physicalNodes[0])},{shapes:Array.from({length:20001},()=>({}))},
  {image:{width:100,height:100,rgba:new Proxy(Buffer.alloc(40000),{})}}])assert.throws(()=>members({...fixture(),...change}),TypeError);
});
test('background membership regression is discovered by CI and included in the runtime package',()=>{
 const root=require('node:path').resolve(__dirname,'..');
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(root,'unit').some(p=>p.file.endsWith('source-scene-background-members.test.js')));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-background-members.js'));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-background-owner.js'));
});
test('only actual measured perimeter cells can cover a background corner outside the fill polygon',()=>{
 const f=fixture(),box={x:10,y:10,w:80,h:80},segments=[
  {type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}];
 f.shapes[1].box={x:49.9,y:49.9,w:.2,h:.2};
 const ring=[4950,5049,5050];
 for(const cells of [[],ring.slice(0,2),ring]){
  const portFrame=createMeasuredScenePortFrame(f.image,{box,fill:'#FFFFFF',segments,perimeterPixels:cells});
  const found=members({...f,physicalNodes:[{proposalId:'panel',node:{box,portFrame}}]});
  assert.equal(found.size,cells.length===3?1:0);
 }
});
test('measured eligibility alone cannot mint grouped membership by changing a group flag',()=>{
 const f=fixture(),background=f.shapes[1];members(f);background.source.nativeComponentGroupId='scene-unit-panel';
 assert.deepEqual(groupedMembers(f.image,f.shapes,'panel',{used:0,exhausted:false}),[]);
 const copy={...background,source:{...background.source}};
 assert.equal(rebind(f.image,background,copy,'foreign'),false);
 assert.equal(rebind({...f.image,rgba:Buffer.from(f.image.rgba)},background,copy,'panel'),false);
 assert.equal(rebind(f.image,background,copy,'panel'),true);
 assert.deepEqual(groupedMembers(f.image,[copy],'panel',{used:0,exhausted:false}),[copy]);
 copy.style={...copy.style,fill:'#000000'};assert.deepEqual(groupedMembers(f.image,[copy],'panel',{used:0,exhausted:false}),[]);
});
test('budget exhaustion yields no partial membership and keeps the existing cap',()=>{
 const f=fixture();assert.equal(members({...f,work:{used:4000000,exhausted:false}}).size,0);
 const work={used:3999999,exhausted:false};assert.equal(members({...f,work}).size,0);assert.equal(work.exhausted,true);
 assert.equal(members({...f,work:{used:0,exhausted:true}}).size,0);
});
