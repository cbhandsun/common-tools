"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {auditSceneInventory,buildSceneInventoryEvidence}=require('../packages/slideclone-core/source-scene-observed-inventory');
const {recoveryId,admitSceneRecoveries,captureSceneMembers,survivingSceneUnits,bindSceneRecoveries}=require('../packages/slideclone-core/source-scene-inventory-materialization');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-census-materialization-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:300,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],objects:[],relations:[],
  observedInventory:[{regionId:'region',containers:0,icons:0,relations:0}]};
 const sourceFile=path.join(root,'source.png');
 return {root,image,sourceFile,plan,slideSize:{widthPt:400,heightPt:300},page:{shapes:[],images:[],textBoxes:[]}};
}
function save(f){writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');}
test('real source-measured headers fulfill the same regional census without model object proposals',t=>{
 const f=fixture(t);f.plan.regions.push({id:'table',parentId:'region',kind:'table',box:{x:40,y:40,w:300,h:150}});
 f.plan.observedInventory.push({regionId:'table',containers:2,icons:0,relations:0});
 for(const [x,color]of [[60,[150,210,245]],[200,[245,200,225]]])for(let y=50;y<90;y++)for(let px=x;px<x+120;px++)f.image.rgba.set([...color,255],(y*400+px)*4);
 f.page.textBoxes=[{id:'left',text:'First',box:{x:80,y:60,w:80,h:20}},{id:'right',text:'Second',box:{x:220,y:60,w:80,h:20}}];save(f);
 const before=JSON.stringify(f.plan),result=compileSourceScene(f),inventory=result.evidence.observedInventory;
 assert.equal(result.evidence.tableHeaderBackgrounds,2);assert.equal(result.page.shapes.length,2);
 assert.deepEqual(auditSceneInventory(inventory,result.page.shapes,result.page.images,f.plan.sourceHash),[]);
 assert.equal(inventory.units.filter(u=>u.origin==='table-header').length,2);assert.equal(JSON.stringify(f.plan),before);
 const forged=structuredClone(inventory);forged.units[0].key='different-source-unit';
 assert.deepEqual(auditSceneInventory(forged,result.page.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
 const missing=auditSceneInventory(inventory,result.page.shapes.slice(1),[],f.plan.sourceHash);
 assert.ok(missing.some(r=>r.regionId==='table'&&r.kind==='containers'&&r.reason==='compile-missing'&&r.count===1));
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 f.image.rgba.fill(255);save(f);const blank=compileSourceScene(f);
 assert.equal(blank.evidence.tableHeaderBackgrounds,0);
 assert.ok(auditSceneInventory(blank.evidence.observedInventory,blank.page.shapes,[],f.plan.sourceHash).some(r=>r.reason==='proposal-missing'&&r.count===2));
});
test('a source-measured compound header is complete only while every measured member survives',t=>{
 const f=fixture(t);
 f.plan.observedInventory[0].containers=1;
 for(let y=20;y<80;y++)for(let x=20;x<120;x++)if(x<65||x>=75)f.image.rgba.set([120,160,220,255],(y*400+x)*4);
 save(f);
 const budget={used:0},hint={x:20,y:20,w:100,h:60};
 const fit=require('../packages/slideclone-core/source-scene-fill-window').measureSceneFillWindow({
  image:f.image,hint,fill:[120,160,220],color:'#78A0DC',budget,marginX:8,marginY:8}).fit;
 assert.ok(fit?.parts);
 // Preserve the exact source-measured commands while making the two closed
 // subpaths separate members. This exercises the legal multi-member consumer
 // contract without inventing source pixels, remeasuring or changing geometry.
 const paths=[];
 for(const part of fit.parts)for(const command of part.segments){
  if(command.type==='moveTo')paths.push({box:{...part.box},segments:[]});
  paths.at(-1).segments.push(structuredClone(command));
 }
 assert.equal(paths.length,2);
 const result=require('../packages/slideclone-core/source-scene-table-headers').appendSceneTableHeaderBackgrounds({
  headers:[{id:'compound',regionId:'region',box:hint}],image:f.image,budget,slideSize:f.slideSize,
  shapes:f.page.shapes,measure:()=>({...fit,parts:paths}),glyphReserve:()=>0,inventory:true});
 bindSceneRecoveries(result.inventoryUnits,f.page.shapes);
 const inventory=buildSceneInventoryEvidence(f.plan,f.page.shapes,[],result.inventoryUnits);
 const unit=inventory.units.find(u=>u.origin==='table-header');
 assert.ok(unit);assert.equal(unit.members.length,2);
 const members=f.page.shapes.filter(s=>unit.members.some(m=>m.id===s.id));
 assert.ok(members.every(s=>s.type==='freeform'));
 assert.equal(new Set(members.map(s=>s.source.nativeComponentGroupId)).size,1);
 assert.deepEqual(auditSceneInventory(inventory,f.page.shapes,[],f.plan.sourceHash),[]);
 for(const member of unit.members){
  const missing=f.page.shapes.filter(s=>s.id!==member.id);
  assert.ok(auditSceneInventory(inventory,missing,[],f.plan.sourceHash).some(r=>
   r.regionId==='region'&&r.kind==='containers'&&r.reason==='compile-missing'&&r.count===1));
 }
 assert.ok(budget.used<=4000000);
});

test('real native internal paint is one recovered icon and loses completion when any recorded path is removed',t=>{
 const f=fixture(t);
 for(let y=70;y<121;y++)for(let x=75;x<126;x++){
  const radius=Math.hypot(x-100,y-95);if(radius<=23)f.image.rgba.set(radius>19?[20,20,20,255]:[230,50,80,255],(y*400+x)*4);
 }
 f.plan.objects=[{id:'first',kind:'container',regionId:'region',box:{x:20,y:20,w:160,h:130}},
  {id:'second',kind:'container',regionId:'region',box:{x:220,y:20,w:160,h:130}}];
 f.plan.relations=[{id:'link',regionId:'region',fromId:'first',toId:'second',direction:'forward'}];
 f.plan.observedInventory[0]={regionId:'region',containers:2,icons:1,relations:1};
 f.page.textBoxes=[{id:'caption',text:'Caption',box:{x:60,y:30,w:80,h:14}}];save(f);
 const result=compileSourceScene(f),inventory=result.evidence.observedInventory,parts=result.page.shapes.filter(s=>s.source?.sceneInteriorParentId==='first');
 assert.equal(result.evidence.interiorGroups,1);assert.ok(parts.length>1);assert.ok(parts.length<=32);
 const unit=inventory.units.find(u=>u.origin==='interior');assert.ok(unit);assert.equal(unit.parentObjectId,'first');assert.equal(unit.members.length,parts.length);
 assert.equal(inventory.regions[0].recovered.icons,1);
 const audit=shapes=>auditSceneInventory(inventory,shapes,[],f.plan.sourceHash);
 assert.equal(audit(result.page.shapes).some(r=>r.kind==='icons'),false);
 const remaining=result.page.shapes.filter(s=>s.id!==parts[0].id);
 assert.ok(audit(remaining).some(r=>r.kind==='icons'&&r.reason==='compile-missing'&&r.count===1));
 assert.ok(result.evidence.unresolved.some(r=>r.id==='link'));assert.ok(result.evidence.sourceScanPixels<=4000000);
});
function recovery(){const key='scene-interior-first';return {id:recoveryId('interior',key),key,kind:'icon',origin:'interior',regionId:'region',parentObjectId:'first',members:[{type:'shape',id:'native-part'}]};}
const plan={regions:[{id:'region'}],objects:[{id:'first',regionId:'region',kind:'container'}]};
test('recovery bindings reject foreign parents, duplicate parts, object-slot overflow and unsafe metadata',()=>{
 assert.equal(admitSceneRecoveries([recovery()],plan).length,1);
 assert.deepEqual(admitSceneRecoveries([],plan),[]);let calls=0;
 const hostile=new Proxy(recovery(),{get(){calls++;throw Error('secret-key');}}),getter={};Object.defineProperty(getter,'id',{get(){calls++;throw Error('secret-key');}});
 for(const raw of [null,{},new Array(1),[hostile],[getter],[{...recovery(),id:'forged'}],
  [{...recovery(),parentObjectId:'foreign'}],[{...recovery(),regionId:'foreign'}],[{...recovery(),members:[]}],
  [{...recovery(),members:Array(33).fill({type:'shape',id:'native-part'})}],[recovery(),recovery()]])
  assert.throws(()=>admitSceneRecoveries(raw,plan),e=>e instanceof TypeError&&!e.message.includes('secret-key'));
 assert.equal(calls,0);
 const key='scene-table-header-0-0',header={id:recoveryId('table-header',key),key,kind:'container',origin:'table-header',regionId:'region',members:[{type:'shape',id:key}]};
 const compound={...header,members:Array.from({length:32},(_,index)=>({type:'shape',id:key+'-part-'+index}))};
 assert.equal(admitSceneRecoveries([compound],plan)[0].members.length,32);
 assert.throws(()=>admitSceneRecoveries([{...compound,members:[...compound.members,{type:'shape',id:key+'-part-32'}]}],plan),TypeError);
 assert.throws(()=>admitSceneRecoveries([header],{...plan,objects:Array(64).fill(plan.objects[0])}),RangeError);
 assert.throws(()=>admitSceneRecoveries([recovery()],{...plan,objects:[...plan.objects,...Array(32).fill({kind:'icon'})]}),RangeError);
});
test('complete-member verification rejects duplicate IDs, forged additions, accessors and foreign unit ownership',()=>{
 const unit={id:'object-first',members:[{type:'shape',id:'first-a'},{type:'shape',id:'first-b'}]};
 const part=id=>({id,source:{sceneInventoryId:'object-first'}}),a=part('first-a'),b=part('first-b');
 assert.deepEqual([...survivingSceneUnits([unit],[a,b],[],true)],['object-first']);
 assert.equal(survivingSceneUnits([unit],[a],[],true).size,0);
 assert.equal(survivingSceneUnits([unit],[a,a],[],true),null);
 assert.equal(survivingSceneUnits([unit],[a,b,part('foreign')],[],true),null);
 assert.equal(survivingSceneUnits([unit],[{...a,source:{sceneInventoryId:'foreign'}}],[],true),null);
 let calls=0;const getter={};Object.defineProperty(getter,'source',{get(){calls++;throw Error('secret-key');}});
 assert.equal(captureSceneMembers([getter],[]),null);assert.equal(captureSceneMembers(new Proxy([],{get(){calls++;}}),[]),null);assert.equal(calls,0);
});
test('regional review reuses measured recoveries instead of spending calls on duplicate object proposals',()=>{
 const {buildSceneInventoryEvidence}=require('../packages/slideclone-core/source-scene-observed-inventory');
 const {selectRegionalInventoryTargets:select}=require('../packages/slideclone-core/source-scene-regional-inventory');
 const p={version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:300,regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}},
  {id:'card',parentId:'root',kind:'card',box:{x:0,y:0,w:400,h:300}}],objects:[
  {id:'first',regionId:'card',kind:'container',box:{x:20,y:20,w:30,h:30}},
  {id:'second',regionId:'card',kind:'container',box:{x:120,y:20,w:30,h:30}}],
  relations:[{id:'edge',regionId:'card',fromId:'first',toId:'second',direction:'forward'}],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:3,icons:0,relations:1}]};
 const key='scene-table-header-0-0',r={id:recoveryId('table-header',key),key,kind:'container',origin:'table-header',regionId:'card',members:[{type:'shape',id:key}]};
 const s={id:key,source:{sceneInventoryId:r.id}},e=buildSceneInventoryEvidence(p,[s],[],[r]);
 assert.equal(select(p,32,0).length,1);assert.deepEqual(select(p,32,0,e),[]);
 assert.throws(()=>select({...p,sourceHash:'b'.repeat(64)},32,0,e),/preflight inventory/);
 const changed={...p,objects:p.objects.map(o=>({...o,regionId:'root'}))};assert.throws(()=>select(changed,32,0,e),/controls changed/);
 assert.throws(()=>select(p,32,0,{...e,regions:e.regions.map(row=>({...row,recovered:{containers:100,icons:0,relations:0}}))}),/counts are invalid/);
});
test('a real measured node needs its fill and perimeter members rather than one surviving shape',t=>{
 const f=fixture(t);
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)f.image.rgba.set([210,230,245,255],(y*400+x)*4);
 f.plan.objects=[{id:'node',regionId:'region',kind:'container',box:{x:78,y:55,w:104,h:68}}];
 f.plan.observedInventory[0].containers=1;save(f);
 const result=compileSourceScene(f),e=result.evidence.observedInventory;
 assert.ok(e.units[0].members.length>=2);
 assert.deepEqual(auditSceneInventory(e,result.page.shapes,[],f.plan.sourceHash),[]);
 const broken=result.page.shapes.filter(s=>s.id!=='scene-outline-node');
 assert.ok(auditSceneInventory(e,broken,[],f.plan.sourceHash).some(r=>r.kind==='containers'&&r.reason==='compile-missing'&&r.count===1));
 assert.equal(result.evidence.sourceScanPixels<=4000000,true);
});
