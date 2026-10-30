'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan:admit,parseSourceScenePlan:parse}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {sceneRejectedRelationCandidates:pending}=require('../packages/slideclone-core/scene-plan/source-scene-rejected-relations');
const {sceneRelationSlotsUsed:slots,recordSceneLocalRelationBatch:recordBatch}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
const {selectTopologyReviewTargets:select,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {applyRegionalInventoryReview:regional}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {sceneRelationsConflict:conflict}=require('../packages/slideclone-core/scene-plan/source-scene-relation-identity');
const source={sourceHash:'a'.repeat(64),widthPx:200,heightPx:100};
function raw(){return {coordinateSpace:'source-pixels',regions:[
 {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
 {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:95,h:100}},
 {id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:100,h:100}}],objects:[
 {id:'a',regionId:'left',kind:'container',box:{x:10,y:20,w:60,h:60}},
 {id:'b',regionId:'right',kind:'container',box:{x:120,y:20,w:60,h:60}}],relations:[
 {id:'one',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:72,y:32,w:46,h:6}},
 {id:'two',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:72,y:52,w:46,h:6}}]};}
function controls(plan){return select(plan,32).map((t,index)=>({...t,index:20+index}));}
function observations(targets){return targets.map(t=>({index:t.index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}));}

test('malformed paths retain only strict core controls while malformed tuple identity, owner, endpoints and anchors stay rejected',()=>{
 const value={format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[['root',null,'section',[0,0,1000,1000]]],inventory:[['root',2,0,1]],
  objects:[['a','root','container',[200,50,800,350],'absent'],['b','root','container',[200,600,800,900],'absent']],
  relations:[['one','root','a','b','forward',[320,360,380,590],[[360]]]]};
 const plan=admit(value,source);assert.equal(plan.relations.length,0);assert.equal(pending(plan).length,1);assert.equal(slots(plan),1);
 assert.equal(pending(plan)[0].reason,'tuple');assert.equal(pending(plan)[0].relation.visiblePath,undefined);
 const targets=controls(plan),rows=observations(targets),out=apply(plan,targets,[rows,rows]).plan;
 assert.equal(out.relations.length,1);assert.equal(out.admission.history.relations[0].detailCode,'tuple');assert.equal(slots(out),1);
 for(const mutate of [v=>v.relations[0].pop(),v=>v.relations[0][0]='private-content!',v=>v.relations[0][1]='missing',
  v=>v.relations[0][2]='missing',v=>v.relations[0][5]=[320,360,380],v=>v.relations[0][5]=[320,360,380,1001]]){
  const bad=structuredClone(value);mutate(bad);const result=admit(bad,source);
  assert.equal(result.relations.length,0);assert.equal(pending(result).length,0);assert.equal(slots(result),1);
  assert.equal(JSON.stringify(result).includes('private-content'),false);
 }
 const changed=structuredClone(plan);changed.admission.relationCandidates[0].reason=undefined;
 assert.throws(()=>pending(changed),/rejected relation/);
});

test('scope rejects keep validated source anchors and original identities outside drawable inventory',()=>{
 const value=raw(),before=structuredClone(value);assert.throws(()=>parse(value,source),/anchor scope/);
 const plan=admit(value,source);assert.equal(plan.relations.length,0);assert.equal(plan.admission.complete,false);
 assert.equal(pending(plan).length,2);assert.equal(slots(plan),2);assert.equal(plan.admission.rejections.length,2);
 assert.deepEqual(plan.admission.relationCandidates.map(c=>[c.index,c.relation.id,c.relation.regionId,c.reviewRegionId]),[
  [0,'relation-one','region-left','region-root'],[1,'relation-two','region-left','region-root']]);
 assert.deepEqual(pending(plan).map(c=>c.relation.shaftBox),value.relations.map(r=>r.shaftBox));assert.deepEqual(value,before);
 const unrelated=raw();unrelated.relations.push({...unrelated.relations[0],id:'three',fromId:'missing'});
 const partial=admit(unrelated,source);assert.equal(pending(partial).length,2);assert.equal(partial.admission.rejections.length,3);
 const lone=raw();lone.regions[1].parentId=null;assert.equal(pending(admit(lone,source)).length,0);
});

test('two observations can repair cross-region scope without changing anchor, source, objects, or independent counts',()=>{
 const value=raw();value.inventory=[['root',0,0,2],['left',1,0,0],['right',1,0,0]];
 const plan=admit(value,source),before=structuredClone(plan),targets=controls(plan),rows=observations(targets);
 const result=apply(plan,targets,[rows,structuredClone(rows)]);
 assert.equal(result.evidence.corrected.length,2);assert.equal(result.plan.relations.length,2);assert.equal(result.plan.admission.complete,true);
 assert.deepEqual(result.plan.admission.rejections,[]);assert.deepEqual(pending(result.plan),[]);assert.equal(slots(result.plan),2);
 assert.ok(result.plan.relations.every(r=>r.regionId==='region-root'));assert.deepEqual(result.plan.relations.map(r=>r.shaftBox),value.relations.map(r=>r.shaftBox));
 assert.deepEqual(result.plan.objects,plan.objects);assert.deepEqual(result.plan.regions,plan.regions);assert.deepEqual(result.plan.observedInventory,plan.observedInventory);
 assert.equal(result.plan.sourceHash,plan.sourceHash);assert.deepEqual(plan,before);
 const out=apply(plan,[],[[],[]]);assert.deepEqual(out.plan,plan,'unselected candidates never vanish');
});

test('disagreement, low confidence, wrong owner, moved source control and duplicate shaft preserve rejection',()=>{
 for(const change of [rows=>rows[0].confidence=.89,rows=>rows[0].fromId=null,rows=>rows[0].toId='region-left',rows=>rows[0].direction='unknown']){
  const plan=admit(raw(),source),t=controls(plan),a=observations(t),b=observations(t);change(a);change(b);
  const out=apply(plan,t,[a,b]);assert.equal(out.plan.relations.length,1);assert.equal(pending(out.plan).length,1);
  assert.equal(out.plan.admission.complete,false);assert.equal(slots(out.plan),2);
 }
 const plan=admit(raw(),source),t=controls(plan),a=observations(t),b=observations(t);b[0].direction='backward';
 assert.equal(pending(apply(plan,t,[a,b]).plan).length,1);
 const moved=structuredClone(t);moved[0].shaftBox.x++;assert.equal(pending(apply(plan,moved,[a,a]).plan).length,1);
 const stale=structuredClone(t);stale[0].endpoints[0].box.x++;assert.equal(pending(apply(plan,stale,[a,a]).plan).length,1);
 const duplicate=raw();duplicate.relations[1].shaftBox={...duplicate.relations[0].shaftBox};
 const p=admit(duplicate,source),c=controls(p),r=observations(c),out=apply(p,c,[r,r]);
 assert.equal(out.plan.relations.length,0);assert.equal(out.evidence.corrected.length,0);assert.equal(pending(out.plan).length,2);
});

test('pending slots remain reserved globally and reviewed repairs share local capacity with regional additions',()=>{
 const value=raw();value.objects.push({id:'c',regionId:'left',kind:'container',box:{x:5,y:5,w:5,h:5}});
 value.relations=Array.from({length:24},(_,i)=>({...value.relations[i%2],id:'e'+i}));const plan=admit(value,source);
 assert.equal(slots(plan),24);assert.equal(pending(plan).length,24);
 const target={index:30,regionId:'region-left',box:{...plan.regions[1].box},endpoints:plan.objects.filter(o=>o.regionId==='region-left').map(o=>({id:o.id,box:{...o.box}}))};
 const row={index:30,units:[],relations:[{from:'object-a',to:'object-c',direction:'forward'}]};
 const full=recordBatch(plan,plan,[],pending(plan).map(c=>c.relation.id));
 assert.equal(slots(full),24);assert.equal(pending(full).length,24);
 assert.throws(()=>regional(full,[target],[[row],[row]]),/capacity/);
 value.relations.push({...value.relations[0],id:'overflow'});assert.throws(()=>admit(value,source),/collection/);
});

test('malformed, empty, extreme and hostile retained controls fail without accessing content',()=>{
 const clean=admit(raw(),source);assert.deepEqual(pending({...clean,admission:undefined}),[]);
 for(const change of [p=>p.admission.relationCandidates=new Array(2),p=>p.admission.relationCandidates.push(p.admission.relationCandidates[0]),
  p=>p.admission.relationCandidates[0].index=25,p=>p.admission.relationCandidates[0].reviewRegionId='region-right',
  p=>p.admission.relationCandidates[0].relation.shaftBox.w=Infinity,p=>p.admission.relationCandidates[0].relation.direction='exec',
  p=>p.admission.relationCandidates[0].relation.fromId='secret',p=>p.admission.relationCandidates[0].relation.extra='private',
  p=>p.admission.rejections=[],p=>p.regions[1].parentId='region-left']){
  const p=structuredClone(clean);change(p);assert.throws(()=>pending(p),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 let calls=0;
 for(const change of [p=>p.admission=new Proxy(p.admission,{}),p=>p.admission.relationCandidates=new Proxy(p.admission.relationCandidates,{}),
  p=>Object.defineProperty(p.admission,'relationCandidates',{get(){calls++;throw Error('private');}}),
  p=>Object.defineProperty(p.admission.relationCandidates[0].relation,'shaftBox',{get(){calls++;throw Error('private');}})]){
  const p=structuredClone(clean);change(p);assert.throws(()=>pending(p),e=>e instanceof TypeError&&!e.message.includes('private'));
 }assert.equal(calls,0);
});

test('parallel source identity is independent of endpoint order; overlap, touching and missing evidence remain conservative',()=>{
 const [a,b]=admit(raw(),source).admission.relationCandidates.map(c=>c.relation);
 assert.equal(conflict(a,b),false);assert.equal(conflict(a,{...a}),true);
 assert.equal(conflict(a,{...a,fromId:a.toId,toId:a.fromId,direction:'backward'}),true);
 assert.equal(conflict(a,{...a,direction:'both'}),false);
 assert.equal(conflict({...a,direction:'both'},{...a,fromId:a.toId,toId:a.fromId,direction:'both'}),true);
 assert.equal(conflict(a,{...a,shaftBox:undefined}),true);
 assert.equal(conflict(a,{...a,shaftBox:{...a.shaftBox,y:a.shaftBox.y+a.shaftBox.h}}),true);
});

test('anchored review excludes distant page nodes while retaining physical parents of embedded icon endpoints',()=>{
 const plan=admit(raw(),source);plan.objects.push({id:'object-far',regionId:'region-root',kind:'container',box:{x:1,y:1,w:5,h:5}});
 const t=controls(plan);assert.ok(t.every(row=>!row.endpoints.some(e=>e.id==='object-far')));assert.ok(t.every(row=>row.box.w<200&&row.box.h<100));
 const value=raw();value.regions[1].kind='card';value.objects.push({id:'icon',regionId:'left',kind:'icon',box:{x:30,y:30,w:10,h:10}});
 value.relations=[{id:'edge',regionId:'root',fromId:'icon',toId:'b',direction:'forward',shaftBox:{x:72,y:32,w:46,h:6}}];
 const embedded=admit(value,source);embedded.objects.find(o=>o.id==='object-icon').parentObjectId='object-a';
 const icons=select(embedded,32);assert.equal(icons.length,1);assert.ok(icons[0].endpoints.some(e=>e.id==='region-left'));
 assert.ok(!icons[0].endpoints.some(e=>e.id==='object-icon'));
});

test('source-proven physical alias compaction rebinds quarantined controls without losing their original slot or rejection',()=>{
 const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
 const value=raw();value.objects.push({...value.objects[0],id:'alias'});value.relations[0].fromId='alias';
 const plan=admit(value,source),before=structuredClone(plan),out=compact(plan,[{id:'object-alias',canonicalId:'object-a'}]);
 assert.equal(out.evidence.releasedObjectSlots,1);assert.equal(out.plan.objects.length,2);
 assert.equal(pending(out.plan)[0].relation.fromId,'object-a');assert.equal(pending(out.plan).length,2);assert.equal(slots(out.plan),2);
 assert.deepEqual(out.plan.admission.rejections,plan.admission.rejections);assert.deepEqual(plan,before);
 const t=controls(out.plan),rows=observations(t);assert.equal(apply(out.plan,t,[rows,rows]).plan.relations.length,2);
});

test('two parallel arrows with the same physical endpoints survive consensus and compile at their own source anchors',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'parallel-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},put=(x,y,c)=>image.rgba.set([...c,255],(y*200+x)*4);
 for(const x0 of [20,120])for(let y=20;y<140;y++)for(let x=x0;x<x0+60;x++)put(x,y,x<x0+2||x>=x0+58||y<22||y>=138?[90,40,60]:[210,230,245]);
 for(const axis of [50,80]){
  for(let x=80;x<120;x++)for(let y=axis-1;y<=axis+1;y++)put(x,y,[30,60,90]);
  for(let x=114;x<120;x++)for(let y=axis-(119-x);y<=axis+(119-x);y++)put(x,y,[30,60,90]);
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const value=raw();value.regions[0].box.h=180;value.regions[1].box.h=180;value.regions[2].box.h=180;
 value.objects[0].box={x:20,y:20,w:60,h:120};value.objects[1].box={x:120,y:20,w:60,h:120};
 value.relations[0].shaftBox={x:81,y:43,w:38,h:14};value.relations[1].shaftBox={x:81,y:73,w:38,h:14};
 const plan=admit(value,{sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:200,heightPx:180});
 const target=controls(plan),rows=observations(target),fixed=apply(plan,target,[rows,rows]);assert.equal(fixed.plan.relations.length,2);
 const result=compileSourceScene({root,sourceFile,plan:fixed.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:200,heightPt:180}});
 assert.equal(result.evidence.resolvedRelations,2,JSON.stringify(result.evidence.unresolved));
 const arrows=result.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');assert.equal(arrows.length,2);
 assert.ok(arrows.every(s=>s.source.editable===true));assert.notEqual(arrows[0].box.y,arrows[1].box.y);
 assert.ok(result.evidence.sourceScanPixels<=4000000);assert.equal(result.page.images.length,0);
 const blank=path.join(root,'blank');fs.mkdirSync(blank);const blankFile=path.join(blank,'source.png');image.rgba.fill(255);writePng(blankFile,image);
 const unproven={...fixed.plan,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(blankFile)).digest('hex')};
 assert.throws(()=>compileSourceScene({root:blank,sourceFile:blankFile,plan:unproven,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:200,heightPt:180}}),/admission history source/);
 const blankPlan=admit(value,{sourceHash:unproven.sourceHash,widthPx:200,heightPx:180}),blankTargets=controls(blankPlan),blankRows=observations(blankTargets);
 const denied=compileSourceScene({root:blank,sourceFile:blankFile,plan:apply(blankPlan,blankTargets,[blankRows,blankRows]).plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:200,heightPt:180}});
 assert.equal(denied.evidence.resolvedRelations,0);assert.equal(denied.page.shapes.length,0);
});
