'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeOpenScenePaint}=require('../packages/slideclone-core/source-scene-open-paint');
const {observeOpenSceneOwnerMembers:observe,retainedOpenSceneOwnerMembers:retained}=require('../packages/slideclone-core/source-scene-open-owner-members');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
const {hasMeasuredScenePortFrame,measuredSceneOpaqueSurface}=require('../packages/slideclone-core/source-scene-port-evidence');
function fixture(){
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4)};
 for(let i=0;i<64*64;i++)image.rgba.set([245,249,255,255],i*4);
 for(let x=8;x<56;x++)image.rgba.set([220,225,230,255],(8*64+x)*4);
 const box={x:8,y:8,w:48,h:48},slideSize={widthPt:64,heightPt:64};
 const paint=observeOpenScenePaint({image,slideSize,budget:{used:0},textMasks:[],foreignFrames:[],relationParts:[],
  recipe:{id:'region-owner',kind:'openPaths',box,fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1,
   paths:[{filled:false,segments:[{type:'moveTo',points:[{x:.5/48,y:.5/48}]},{type:'lnTo',points:[{x:47.5/48,y:.5/48}]}]}]}});
 assert.equal(paint.failure,null,JSON.stringify(paint));
 const regions=[{id:'region-owner',parentId:null,kind:'container',box},
  {id:'region-a',parentId:'region-owner',kind:'container',box:{x:12,y:16,w:20,h:30}},
  {id:'region-b',parentId:'region-owner',kind:'card',box:{x:38,y:16,w:15,h:25}},
  {id:'region-inner',parentId:'region-a',kind:'card',box:{x:16,y:20,w:10,h:12}}];
 const objects=[{id:'object-node',regionId:'region-inner',kind:'container',box:{x:18,y:23,w:6,h:6}}];
 const relations=[{id:'relation-outer',regionId:'region-owner',fromId:'region-a',toId:'region-b',direction:'forward'},
  {id:'relation-inner',regionId:'region-inner',fromId:'object-node',toId:'region-inner',direction:'forward'}];
 const labelBox={x:10,y:10,w:10,h:5},ref=sourceLabelIdentity(labelBox,{widthPx:64,heightPx:64});
 const plan={version:1,widthPx:64,heightPx:64,sourceHash:'1'.repeat(64),regions,objects,relations,
  regionPrograms:regions.map(r=>({regionId:r.id,objects:objects.filter(o=>o.regionId===r.id).map(o=>o.id),
   relations:relations.filter(o=>o.regionId===r.id).map(o=>o.id),labels:r.id==='region-owner'?[{refs:[ref],weight:'bold'}]:[]}))};
 const native=id=>({id:'native-'+id,type:'rect',box:{x:18,y:20,w:6,h:6},style:{fill:'#DDEEFF'},source:{editable:true}});
 const childShapes=[...regions.slice(1),...objects].map(o=>native(o.id)),relationShapes=relations.map(r=>native(r.id));
 const page={shapes:[...paint.parts,...childShapes,...relationShapes],images:[],textBoxes:[{id:'text-heading',text:'A',box:labelBox,font:{color:'#000000'},
  source:{ocrLabelRef:ref,ocrLabelBox:labelBox,evidenceBox:labelBox}}]};
 return {image,paintReceipt:paint.receipt,paintParts:paint.parts,plan,ownerId:'region-owner',page,slideSize,unresolved:[],
  objects:new Map([...regions.slice(1),...objects].map(o=>[o.id,['native-'+o.id]])),relations:new Map(relations.map(r=>[r.id,['native-'+r.id]]))};
}

test('open owner membership requires every descendant and relation, and remains a membership observation only',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=observe(f);assert.equal(result.failure,null,JSON.stringify(result));
 assert.equal(result.ownerCompleted,false);assert.equal(result.portsAuthorized,false);assert.equal(result.opaqueBodyAuthorized,false);
 const proof=retained(f.image,result.receipt,f.plan,f.page);assert.equal(proof.members.length,8);
 assert.ok(proof.members.includes('native-region-inner'));assert.ok(proof.members.includes('native-object-node'));
 assert.ok(proof.members.includes('native-relation-inner'));assert.ok(proof.members.includes('text-heading'));
 proof.members.length=0;assert.equal(retained(f.image,result.receipt,f.plan,f.page).members.length,8);
 assert.equal(hasMeasuredScenePortFrame(f.image,result.receipt,f.plan.regions[0].box),false);
 assert.equal(measuredSceneOpaqueSurface(f.image,result.receipt),null);assert.deepEqual(f.image.rgba,before);
});

test('direct children, nested objects, relationships, endpoints, duplicates and unresolved source failures cannot disappear',()=>{
 for(const mode of ['child','grandchild','object','relation','endpoint','duplicate','borrowed','unresolved','label','paint','program']){
  const f=fixture();
  if(mode==='child')f.objects.delete('region-b');
  if(mode==='grandchild')f.objects.delete('region-inner');
  if(mode==='object')f.objects.delete('object-node');
  if(mode==='relation')f.relations.delete('relation-inner');
  if(mode==='endpoint')f.page.shapes=f.page.shapes.filter(s=>s.id!=='native-region-a');
  if(mode==='duplicate')f.page.shapes.push(f.page.shapes[1]);
  if(mode==='borrowed')f.objects.set('region-b',['native-region-a']);
  if(mode==='unresolved')f.unresolved=[{id:'object-node',reason:'source-evidence'}];
  if(mode==='label')f.page.textBoxes[0].source.ocrLabelRef='label-'+'0'.repeat(24);
  if(mode==='paint')f.page.shapes[0]=structuredClone(f.page.shapes[0]);
  if(mode==='program')f.plan.regionPrograms=f.plan.regionPrograms.filter(p=>p.regionId!=='region-inner');
  const result=observe(f);assert.equal(result.failure,'open-owner-members-incomplete',mode);assert.ok(result.missing.length,mode);
  assert.equal(result.receipt,undefined,mode);
 }
});

test('an owner source failure blocks success without inventing a missing descendant or discarding its evidence',()=>{
 for(const reason of ['container-perimeter','region-members-incomplete','unknown-source-failure']){
  const f=fixture();f.unresolved=[{id:f.ownerId,reason}];
  const result=observe(f);
  assert.equal(result.failure,'open-owner-source-unresolved');
  assert.equal(result.membershipComplete,true);assert.equal(result.ownerCompleted,false);
  assert.equal(result.portsAuthorized,false);assert.equal(result.opaqueBodyAuthorized,false);
  assert.deepEqual(result.sourceFailures,[{id:f.ownerId,reason}]);
  const proof=retained(f.image,result.receipt,f.plan,f.page);
  assert.equal(proof.members.length,8);assert.equal(proof.ownerCompleted,false);
  assert.deepEqual(proof.sourceFailures,[{id:f.ownerId,reason}]);
  // A caller cannot erase the retained source obligation through either copy.
  result.sourceFailures.length=0;proof.sourceFailures[0].reason='cleared';f.unresolved.length=0;
  assert.deepEqual(retained(f.image,result.receipt,f.plan,f.page).sourceFailures,[{id:f.ownerId,reason}]);
  f.page.shapes[1].box.w++;
  assert.equal(retained(f.image,result.receipt,f.plan,f.page),null);
 }
 const f=fixture();f.unresolved=[{id:f.ownerId,reason:'container-perimeter'},{id:'region-inner',reason:'container-perimeter'}];
 const result=observe(f);assert.equal(result.failure,'open-owner-members-incomplete');
 assert.ok(result.missing.includes('region-inner'));assert.equal(result.receipt,undefined);
});

test('recovered unlisted drawables and unrelated overlapping paint stay sealed against later mutation',()=>{
 const f=fixture(),recovered={id:'recovered-interior',type:'rect',box:{x:18,y:20,w:1,h:1},style:{fill:'#778899'},source:{editable:true}};
 f.page.shapes.push(recovered);const result=observe(f);assert.equal(result.failure,null);
 assert.ok(retained(f.image,result.receipt,f.plan,f.page));recovered.style.fill='#FFFFFF';
 assert.equal(retained(f.image,result.receipt,f.plan,f.page),null);
});

test('literal source additions require private source receipts and exact final native members',()=>{
 const {observeSceneLiteralPaint}=require('../packages/slideclone-core/source-scene-literal-paint');
 for(const mode of ['valid','copied','missing','changed','hostile']){
  const f=fixture(),literal=observeSceneLiteralPaint({id:'extra-paint',image:f.image,window:{x:0,y:0,w:64,h:64},cells:new Set([30*64+30]),budget:{used:0},slideSize:f.slideSize});
  assert.equal(literal.failure,null);f.page.shapes.push(...literal.parts);f.literalPaint={receipt:literal.receipt,parts:literal.parts};
  if(mode==='copied')f.literalPaint.receipt=structuredClone(literal.receipt);
  if(mode==='missing')f.page.shapes.pop();
  if(mode==='changed')literal.parts[0].style.fill='#FFFFFF';
  if(mode==='hostile'){f.literalPaint=new Proxy(f.literalPaint,{});assert.throws(()=>observe(f),TypeError);continue;}
  const result=observe(f);
  if(mode==='valid'){assert.equal(result.failure,null);assert.ok(result.members.includes(literal.parts[0].id));assert.equal(result.ownerCompleted,false);}
  else {assert.ok(result.failure);assert.equal(result.receipt,undefined);}
 }
});

test('an explicitly empty semantic composition can retain paint membership but cannot complete an owner',()=>{
 const f=fixture();f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[];f.plan.relations=[];
 f.plan.regionPrograms=[{regionId:f.ownerId,objects:[],relations:[],labels:[]}];
 f.objects=new Map();f.relations=new Map();f.page.shapes=f.paintParts.slice();f.page.textBoxes=[];
 const result=observe(f);assert.equal(result.failure,null);assert.equal(result.members.length,1);
 assert.equal(result.ownerCompleted,false);assert.equal(result.portsAuthorized,false);assert.equal(result.opaqueBodyAuthorized,false);
});

test('final identity, source metadata, geometry, text, full output order and declared topology stay bound',()=>{
 for(const mode of ['copy','metadata','geometry','text','order','append','plan']){
  const f=fixture(),result=observe(f);assert.equal(result.failure,null);
  if(mode==='copy')f.page.shapes[1]=structuredClone(f.page.shapes[1]);
  if(mode==='metadata')f.page.shapes[1].source.editable=false;
  if(mode==='geometry')f.page.shapes[1].box.w++;
  if(mode==='text')f.page.textBoxes[0].text='B';
  if(mode==='order')[f.page.shapes[1],f.page.shapes[2]]=[f.page.shapes[2],f.page.shapes[1]];
  if(mode==='append')f.page.shapes.push({id:'unrelated',source:{},style:{},box:{x:0,y:0,w:1,h:1}});
  if(mode==='plan')f.plan.regions[2].parentId='region-a';
  assert.equal(retained(f.image,result.receipt,f.plan,f.page),null,mode);
 }
 const f=fixture(),result=observe(f);
 for(const receipt of [null,{},structuredClone(result.receipt),new Proxy(result.receipt,{})])assert.equal(retained(f.image,receipt,f.plan,f.page),null);
 assert.equal(retained({...f.image,rgba:Buffer.from(f.image.rgba)},result.receipt,f.plan,f.page),null);
});

test('invalid topology and hostile boundaries fail without invoking accessors or publishing partial observations',()=>{
 let reads=0;
 for(const mode of ['empty','region-cycle','object-cycle','wrong-parent','wrong-source','bad-owner','map','proxy-map','getter','capacity','map-capacity','page-capacity']){
  const f=fixture();
  if(mode==='empty')f.plan.regions=[];
  if(mode==='region-cycle')f.plan.regions[0].parentId='region-inner';
  if(mode==='object-cycle')f.plan.objects[0].parentObjectId='object-node';
  if(mode==='wrong-parent')f.plan.objects[0].parentObjectId='missing';
  if(mode==='wrong-source')f.plan.widthPx++;
  if(mode==='bad-owner')f.plan.regions[0].kind='section';
  if(mode==='map')f.objects=Object.fromEntries(f.objects);
  if(mode==='proxy-map')f.objects=new Proxy(f.objects,{get(){reads++;throw Error('private');}});
  if(mode==='getter')Object.defineProperty(f,'page',{get(){reads++;throw Error('private');}});
  if(mode==='capacity')f.plan.regions=new Array(25).fill(f.plan.regions[0]);
  if(mode==='map-capacity')for(let i=0;i<177;i++)f.objects.set('outside-'+i,['native-outside']);
  if(mode==='page-capacity')f.page.shapes=new Array(10001).fill(f.page.shapes[0]);
  assert.throws(()=>observe(f),TypeError,mode);
 }
 const f=fixture();Object.defineProperty(f.page.shapes[1].style,'fill',{get(){reads++;throw Error('private');}});
 assert.equal(observe(f).failure,'open-owner-member-snapshot');assert.equal(reads,0);
 const g=fixture();g.paintReceipt=structuredClone(g.paintReceipt);assert.equal(observe(g).failure,'open-owner-paint-binding');
 const h=fixture(),result=observe(h),hostilePlan={get regions(){reads++;throw Error('private');}};
 assert.equal(retained(h.image,result.receipt,hostilePlan,h.page),null);assert.equal(reads,0);
});

test('new owner membership regression participates in the unified unit and all CI suites',()=>{
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});
