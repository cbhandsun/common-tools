"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseSourceScenePlan,admitSourceScenePlan}=require("../packages/slideclone-core/scene-plan/source-scene-plan");
const source={sourceHash:"a".repeat(64),widthPx:800,heightPx:600};
function scene(){return {coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}},
 {id:"card",parentId:"root",kind:"card",box:{x:100,y:100,w:400,h:400}}],objects:[{id:"icon",regionId:"card",kind:"icon",box:{x:200,y:200,w:100,h:100}}],relations:[]};}
test("scene coordinates are explicit, source-bound and preserve region references",()=>{
 const plan=parseSourceScenePlan(scene(),source);assert.equal(plan.sourceHash,source.sourceHash);
 assert.deepEqual(plan.objects[0].box,{x:160,y:120,w:80,h:60});assert.equal(plan.regions[1].parentId,"region-root");
 assert.equal(parseSourceScenePlan(undefined,source),undefined);
 const empty={coordinateSpace:"normalized-1000",regions:[],objects:[],relations:[]};assert.equal(parseSourceScenePlan(empty,source).regions.length,0);
});
test("explicit source pixel coordinates share the OCR frame without guessing or clamping",()=>{
 const value=scene();value.coordinateSpace="source-pixels";
 value.regions[0].box={x:0,y:0,w:800,h:600};value.regions[1].box={x:80,y:60,w:320,h:240};value.objects[0].box={x:160,y:120,w:80,h:60};
 assert.deepEqual(parseSourceScenePlan(value,source),parseSourceScenePlan(scene(),source));
 for(const mutate of [s=>s.objects[0].box.x=799,s=>s.objects[0].box.y=599,s=>s.objects[0].box.w=.5,
  s=>s.coordinateSpace="pixels",s=>s.objects[0].box.h=Infinity]){
  const invalid=structuredClone(value);mutate(invalid);assert.throws(()=>parseSourceScenePlan(invalid,source),/Scene/);
 }
 let calls=0;value.coordinateSpace={toString(){calls++;throw Error("private-token");}};
 assert.throws(()=>parseSourceScenePlan(value,source),e=>!e.message.includes("private-token"));assert.equal(calls,0);
});
test("pixel coordinates, fractions, overflow and unbounded collections fail instead of being guessed",()=>{
 for(const mutate of [s=>s.coordinateSpace="pixels",s=>s.objects[0].box.x=1.5,s=>s.objects[0].box.w=Infinity,
  s=>s.objects[0].box.w=900,s=>s.objects[0].box.x=-1,s=>s.objects[0].box.w=0,s=>s.regions=Array(25).fill(s.regions[0]),s=>s.objects=Array(65).fill(s.objects[0])]){
  const value=scene();mutate(value);assert.throws(()=>parseSourceScenePlan(value,source),/Scene/);
 }
 assert.throws(()=>parseSourceScenePlan(scene(),{...source,widthPx:16385}),/source/);
 assert.throws(()=>parseSourceScenePlan(scene(),{...source,sourceHash:"private-token"}),e=>!e.message.includes("private-token"));
});
test("cycles, missing references, duplicate identities and relation-to-relation references are rejected",()=>{
 for(const mutate of [s=>s.regions[0].parentId="card",s=>s.regions[1].parentId="missing",s=>s.objects[0].regionId="missing",
  s=>s.objects.push({...s.objects[0]}),s=>s.objects[0].id="../secret",s=>s.relations=[{id:"rel",regionId:"root",fromId:"icon",toId:"missing",direction:"both"}],
  s=>s.relations=[{id:"rel",regionId:"root",fromId:"icon",toId:"card",direction:"both"},{id:"rel2",regionId:"root",fromId:"rel",toId:"card",direction:"both"}]]){
  const value=scene();mutate(value);assert.throws(()=>parseSourceScenePlan(value,source),/Scene/);
 }
});
test("hostile records, proxies and sparse arrays never execute accessors",()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,"coordinateSpace",{get(){calls++;throw Error("private-token");},enumerable:true});
 for(const value of [null,[],hostile,new Proxy(scene(),{}),{...scene(),objects:new Array(1)},
  {...scene(),objects:[{get id(){calls++;throw Error("private-token");}}]}])assert.throws(()=>parseSourceScenePlan(value,source),e=>!e.message.includes("private-token"));
 assert.equal(calls,0);
});
test("numeric model identities are coerced consistently while unsafe numbers and collisions fail",()=>{
 const value=scene();value.regions[0].id=0;value.regions[1].parentId="0";value.regions[1].id=1;value.objects[0].regionId=1;
 const plan=parseSourceScenePlan(value,source);assert.equal(plan.regions[0].id,"region-n0");assert.equal(plan.regions[1].parentId,"region-n0");assert.equal(plan.objects[0].regionId,"region-n1");
 for(const id of [-1,Infinity,1.5,1000000]){const invalid=scene();invalid.regions[0].id=id;assert.throws(()=>parseSourceScenePlan(invalid,source),/identity/);}
 value.objects[0].id="01";value.objects.push({...value.objects[0],id:1});assert.throws(()=>parseSourceScenePlan(value,source),/conflicts/);
});
test("region and object ID scopes can overlap without binding relations to regions",()=>{
 const value=scene();value.regions[1].id=1;value.objects[0].id=1;value.objects[0].regionId=1;
 value.objects.push({...value.objects[0],id:2});value.relations=[{id:1,regionId:"root",fromId:1,toId:2,direction:"forward"}];
 const plan=parseSourceScenePlan(value,source);assert.equal(plan.relations[0].fromId,"object-n1");assert.equal(plan.regions[1].id,"region-n1");
});
function compact(){return {format:"compact-v1",coordinateSpace:"normalized-1000",regions:[[0,null,"section",[0,0,1000,1000]]],
 objects:[[0,0,"container",[100,100,200,200]],[1,0,"icon",[400,100,100,100]]],relations:[[0,0,0,1,"forward"]]};}

function anchored(){return {format:'compact-v4',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[[0,null,'section',[0,0,1000,1000]]],objects:[[0,0,'container',[100,100,300,300],'absent'],[1,0,'container',[100,400,300,600],'absent']],
 relations:[[0,0,0,1,'forward',[180,305,220,395]]]};}
test('compact-v4 preserves the source location of each physical arrow without changing capacity or legacy contracts',()=>{
 const value=anchored(),before=JSON.stringify(value),parsed=parseSourceScenePlan(value,source),admitted=admitSourceScenePlan(value,source);
 assert.deepEqual(parsed.relations[0].shaftBox,{x:244,y:108,w:72,h:24});assert.deepEqual(admitted.relations,parsed.relations);
 assert.equal(admitted.admission.complete,true);assert.equal(JSON.stringify(value),before);
 const legacy=structuredClone(value);legacy.format='compact-v3';legacy.relations[0].pop();
 assert.equal(parseSourceScenePlan(legacy,source).relations[0].shaftBox,undefined);
 value.objects[1][1]=0;value.objects[1][3]=[150,150,250,250];
 assert.equal(admitSourceScenePlan(value,source).objects[1].pictorialContent,'absent');
 const empty=anchored();empty.objects=[];empty.relations=[];assert.equal(parseSourceScenePlan(empty,source).relations.length,0);
 const full=anchored();full.relations=Array.from({length:24},(_,id)=>[id,0,0,1,'forward',[180,305,220,395]]);
 assert.equal(parseSourceScenePlan(full,source).relations.length,24);full.relations.push(full.relations[0]);assert.throws(()=>parseSourceScenePlan(full,source),/collection/);
});
test('arrow anchors reject unsafe coordinates, tuples, hostile getters and out-of-owner positions',()=>{
 for(const anchor of [null,[],[180,305,220],[180,305,220,Infinity],[180,305,220,1001],[220,305,180,395],[180,-1,220,395]]){
  const value=anchored();value.relations[0][5]=anchor;assert.throws(()=>parseSourceScenePlan(value,source),TypeError);
  assert.equal(admitSourceScenePlan(value,source).admission.complete,false);
 }
 let calls=0;const value=anchored(),hostile=[180,305,220,395];Object.defineProperty(hostile,0,{get(){calls++;throw Error('private-key');}});
 value.relations[0][5]=hostile;assert.throws(()=>parseSourceScenePlan(value,source),e=>e instanceof TypeError&&!e.message.includes('private-key'));assert.equal(calls,0);
 value.relations[0][5]=[180,305,220,395];value.regions.push([2,0,'diagram',[0,0,100,100]]);value.relations[0][1]=2;
 assert.throws(()=>parseSourceScenePlan(value,source),/anchor scope/);
 const admitted=admitSourceScenePlan(value,source);assert.equal(admitted.relations.length,0);
 assert.equal(admitted.admission.rejections[0].detailCode,'relation-anchor-scope');
});

test('compact-v3 semantic presence is bounded scheduling metadata and preserves legacy tuple contracts',()=>{
 const value={format:'compact-v3',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',regions:[[0,null,'section',[0,0,1000,1000]]],
  objects:[[0,0,'container',[100,100,300,300],'present'],[1,0,'container',[100,400,300,600],'absent']],relations:[[0,0,0,1,'forward']]};
 const before=JSON.stringify(value),parsed=parseSourceScenePlan(value,source),admitted=admitSourceScenePlan(value,source);
 assert.deepEqual(parsed.objects.map(o=>o.pictorialContent),['present','absent']);assert.equal(parsed.objects.length,2);
 assert.equal(parsed.relations.length,1);assert.equal(admitted.admission.complete,true);assert.equal(JSON.stringify(value),before);
 assert.equal(parsed.objects[0].nativePictorial,undefined);assert.equal(parsed.objects[0].parentObjectId,undefined);
 const legacy=compact();legacy.objects[0].push('present');assert.throws(()=>parseSourceScenePlan(legacy,source),/collection/);
 for(const hint of [null,true,0,'illustration',{},[]]){const bad=structuredClone(value);bad.objects[0][4]=hint;
  assert.throws(()=>parseSourceScenePlan(bad,source),/pictorial content/);
  const partial=admitSourceScenePlan(bad,source);assert.equal(partial.objects.length,1);assert.equal(partial.admission.complete,false);
  assert.equal(partial.admission.rejections[0].detailCode,'object-pictorial-content');}
 const normalized=scene();normalized.objects[0].pictorialContent='unknown';assert.equal(parseSourceScenePlan(normalized,source).objects[0].pictorialContent,'unknown');
 let calls=0;normalized.objects[0].pictorialContent={toString(){calls++;throw Error('secret');}};
 assert.throws(()=>parseSourceScenePlan(normalized,source),error=>error instanceof TypeError&&!error.message.includes('secret'));
 normalized.format={toString(){calls++;throw Error('secret');}};assert.throws(()=>parseSourceScenePlan(normalized,source),TypeError);assert.equal(calls,0);
});
test("compact transport preserves the same strict scene contract and namespaces",()=>{
 const plan=parseSourceScenePlan(compact(),source);
 assert.deepEqual(plan.objects[0].box,{x:80,y:60,w:160,h:120});assert.equal(plan.relations[0].fromId,"object-n0");
 const empty={format:"compact-v1",coordinateSpace:"normalized-1000",regions:[],objects:[],relations:[]};
 assert.equal(parseSourceScenePlan(empty,source).objects.length,0);
 for(const mutate of [v=>v.objects[0][3][0]=1.5,v=>v.objects[0][3][2]=1000,v=>v.objects[0].push("extra"),
  v=>v.objects=Array(65).fill(v.objects[0]),v=>v.objects[0][1]=2,v=>v.format="unknown"]){
  const value=compact();mutate(value);assert.throws(()=>parseSourceScenePlan(value,source),/Scene/);
 }
});
test("compact tuple proxies, accessors and sparse coordinates cannot execute user code",()=>{
 let calls=0;const hostile=[];Object.defineProperty(hostile,0,{get(){calls++;throw new Error("private-token");}});hostile.length=4;
 for(const row of [hostile,new Proxy([0,0,"icon",[1,1,10,10]],{}),[0,0,"icon",new Array(4)]]){
  const value=compact();value.objects=[row];assert.throws(()=>parseSourceScenePlan(value,source),e=>!e.message.includes("private-token"));
 }
 assert.equal(calls,0);
});
test("proposal admission preserves independent valid objects and reports local rejections and dangling relations",()=>{
 const value=scene();value.objects.push({id:"bad",regionId:"missing",kind:"icon",box:{x:10,y:10,w:10,h:10}});
 value.relations=[{id:"ok",regionId:"root",fromId:"icon",toId:"card",direction:"both"},
  {id:"bad-edge",regionId:"root",fromId:"icon",toId:"bad",direction:"forward"}];
 const original=JSON.stringify(value),plan=admitSourceScenePlan(value,source);
 assert.equal(plan.objects.length,1);assert.equal(plan.relations.length,1);assert.equal(plan.admission.complete,false);
 assert.deepEqual(plan.admission.rejections.map(({collection,index,reason})=>({collection,index,reason})),[{collection:"object",index:1,reason:"object-contract"},{collection:"relation",index:1,reason:"relation-contract"}]);
 assert.equal(JSON.stringify(value),original);assert.throws(()=>parseSourceScenePlan(value,source),/region/);
});
test("compact proposal admission rejects malformed local tuples independently of valid source units",()=>{
 const value=compact();value.objects.push([2,0,"icon",[20,20,20,20],"extra"]);
 value.relations.push([1,0,1,2,"forward"]);
 const before=JSON.stringify(value),plan=admitSourceScenePlan(value,source);
 assert.equal(plan.objects.length,2);assert.equal(plan.relations.length,1);assert.equal(plan.admission.complete,false);
 assert.deepEqual(plan.admission.rejections.map(({collection,index,reason})=>({collection,index,reason})),[{collection:"object",index:2,reason:"object-contract"},{collection:"relation",index:1,reason:"relation-contract"}]);
 assert.equal(JSON.stringify(value),before);assert.throws(()=>parseSourceScenePlan(value,source),/Scene/);
});
test("admission retains hard source, tree, collection and security boundaries",()=>{
 for(const mutate of [s=>s.regions[0].parentId="card",s=>s.regions=Array(25).fill(s.regions[0]),
  s=>s.objects=Array(65).fill(s.objects[0]),s=>s.objects=new Array(1),s=>s.relations=new Proxy([],{}),s=>s.coordinateSpace="pixels"]){
  const value=scene();mutate(value);assert.throws(()=>admitSourceScenePlan(value,source),/Scene/);
 }
 let calls=0;const value=scene();value.objects.push({get id(){calls++;throw Error("private-token");}});
 const plan=admitSourceScenePlan(value,source);assert.equal(calls,0);assert.equal(plan.admission.complete,false);assert.equal(plan.objects.length,1);
 assert.equal(admitSourceScenePlan(undefined,source),undefined);
 assert.equal(admitSourceScenePlan({coordinateSpace:"normalized-1000",regions:[],objects:[],relations:[]},source).admission.complete,true);
 assert.throws(()=>admitSourceScenePlan(scene(),{...source,sourceHash:"private-token"}),e=>!e.message.includes("private-token"));
});
function compactCorners(){return {format:"compact-v2",coordinateSpace:"normalized-1000",boxFormat:"ymin-xmin-ymax-xmax",
 regions:[[0,null,"section",[0,0,1000,1000]]],objects:[[0,0,"container",[100,200,300,500]],[1,0,"icon",[400,600,500,700]]],relations:[[0,0,0,1,"forward"]]};}

test('compact-v3 preserves explicit parent coercion and empty and maximum inventory boundaries',()=>{
 const value=compactCorners();value.format='compact-v3';value.objects=[[10,0,'container',[100,100,700,700],'present'],[11,10,'icon',[200,200,400,400],'unknown']];value.relations=[];
 const before=JSON.stringify(value),plan=admitSourceScenePlan(value,source);
 assert.equal(plan.admission.complete,true);assert.equal(plan.objects[1].parentObjectId,'object-n10');
 assert.deepEqual(plan.objects.map(o=>o.pictorialContent),['present','unknown']);assert.equal(JSON.stringify(value),before);
 assert.ok(plan.objects.every(o=>o.nativePictorial===undefined));
 const empty={...value,regions:[],objects:[],relations:[]};assert.equal(parseSourceScenePlan(empty,source).objects.length,0);
 const maximum={...value,objects:Array.from({length:64},(_,id)=>[id,0,'container',[100,100,200,200],'present'])};
 assert.equal(parseSourceScenePlan(maximum,source).objects.length,64);maximum.objects.push([64,0,'container',[100,100,200,200],'present']);
 assert.throws(()=>admitSourceScenePlan(maximum,source),/collection/);
 for(const format of ['compact-v1','compact-v2']){const legacy=compactCorners();legacy.format=format;legacy.objects[0].push('present');assert.throws(()=>parseSourceScenePlan(legacy,source),/collection/);
  const admitted=admitSourceScenePlan(legacy,source);assert.equal(admitted.admission.complete,false);assert.ok(admitted.admission.rejections.some(r=>r.collection==='object'&&r.detailCode==='collection'));}
});

test('compact-v3 hostile presence metadata and tuple boundaries cannot execute or reveal provider content',()=>{
 let calls=0;const value=compactCorners();value.format='compact-v3';value.relations=[];value.objects=value.objects.map(o=>[...o,'unknown']);
 const hostile=structuredClone(value);Object.defineProperty(hostile.objects[0],4,{get(){calls++;throw Error('private-token');}});
 for(const invalid of [hostile,{...value,objects:[new Proxy(value.objects[0],{})]}, {...value,objects:[new Array(5)]}]){
  assert.throws(()=>parseSourceScenePlan(invalid,source),error=>error instanceof TypeError&&!error.message.includes('private-token'));
  const admitted=admitSourceScenePlan(invalid,source);assert.equal(admitted.admission.complete,false);assert.ok(!JSON.stringify(admitted).includes('private-token'));
 }
 const hints={...value,objects:[{...value.objects[0]}]};assert.throws(()=>parseSourceScenePlan(hints,source),/collection/);
 assert.equal(calls,0);
});
test("explicit compact-v2 Y-X endpoints map non-square source dimensions without guessing",()=>{
 const value=compactCorners(),before=JSON.stringify(value),plan=parseSourceScenePlan(value,source);
 assert.deepEqual(plan.objects[0].box,{x:160,y:60,w:240,h:120});assert.equal(plan.relations[0].toId,"object-n1");
 assert.equal(JSON.stringify(value),before);
 assert.equal(parseSourceScenePlan({...value,regions:[],objects:[],relations:[]},source).objects.length,0);
 for(const mutate of [v=>delete v.boxFormat,v=>v.boxFormat="xmin-ymin-xmax-ymax",v=>v.coordinateSpace="source-pixels",
  v=>v.objects[0][3]=[100,200,100,500],v=>v.objects[0][3]=[300,200,100,500],v=>v.objects[0][3][3]=1001,
  v=>v.objects[0][3][0]=-1,v=>v.objects[0][3][0]=.5,v=>v.objects[0][3][0]=Infinity,v=>v.objects[0][3][0]="100"]){
  const invalid=compactCorners();mutate(invalid);assert.throws(()=>parseSourceScenePlan(invalid,source),/Scene/);
 }
});
test("compact-v2 admission preserves valid corners while recording bad units and their dangling relations",()=>{
 const value=compactCorners();value.objects.push([2,0,"icon",[500,600,400,700]]);value.relations.push([1,0,0,2,"forward"]);
 const plan=admitSourceScenePlan(value,source);assert.equal(plan.objects.length,2);assert.equal(plan.relations.length,1);
 assert.equal(plan.admission.complete,false);assert.equal(plan.admission.rejections.length,2);
 for(const change of [v=>delete v.boxFormat,v=>v.coordinateSpace="source-pixels",v=>v.regions[0][3]=[0,0,1001,1000]]){
  const invalid=compactCorners();change(invalid);assert.throws(()=>admitSourceScenePlan(invalid,source),/Scene/);
 }
 let calls=0;const hostile=[100,200,300,500];Object.defineProperty(hostile,0,{get(){calls++;throw Error("private-token");}});
 for(const box of [hostile,new Proxy([100,200,300,500],{}),new Array(4)]){
  const invalid=compactCorners();invalid.objects[0][3]=box;
  assert.throws(()=>parseSourceScenePlan(invalid,source),e=>!e.message.includes("private-token"));
  assert.equal(admitSourceScenePlan(invalid,source).admission.complete,false);
 }assert.equal(calls,0);
});

test("scene inventory allocates major physical regions and whole-page coverage under the approved object batches",()=>{
 const {SCENE_PLAN_PROMPT,SCENE_PROGRAM_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 for(const prompt of [SCENE_PLAN_PROMPT,SCENE_PROGRAM_PROMPT]){
 assert.match(prompt,/including heading areas, side notes and lower sections/u);
 assert.match(prompt,/top-level panels/u);
 assert.match(prompt,/one page-level section region/u);
 assert.match(prompt,/semantic metadata and never authorizes a drawable background/u);
 assert.match(prompt,/do not need duplicate enclosing objects/u);
 assert.match(prompt,/HARD LIMIT 24 regions(?: and 64 object proposals in THIS global batch;|, 64 object proposals and) 24 relation proposals in THIS global batch/u);
 assert.match(prompt,/two later local views share ONE consensus batch of at most 32 object proposals and 24 relation proposals, including repairs/u);
 }
 const value=compactCorners();value.regions[0][2]='card';value.objects=[];value.relations=[];
 const plan=parseSourceScenePlan(value,source);assert.equal(plan.regions[0].kind,'card');assert.equal(plan.objects.length,0);
});



test("rejected proposals retain a bounded safe contract stage without provider content",()=>{
 const variants=[['object-kind',v=>v.objects[0].kind='unsupported-private-token'],['object-region',v=>v.objects[0].regionId='missing'],['coordinates',v=>v.objects[0].box.x=1001],['identity',v=>v.objects[0].id='private token']];
 for(const [detailCode,mutate] of variants){const value=scene();mutate(value);const before=JSON.stringify(value);const plan=admitSourceScenePlan(value,source);assert.equal(plan.objects.length,0);assert.equal(plan.admission.rejections[0].reason,'object-contract');assert.equal(plan.admission.rejections[0].detailCode,detailCode);assert.equal(JSON.stringify(value),before);assert.ok(!JSON.stringify(plan).includes('private-token'));}
 const duplicate=scene();duplicate.objects.push(structuredClone(duplicate.objects[0]));assert.equal(admitSourceScenePlan(duplicate,source).admission.rejections[0].detailCode,'identity-conflict');
 const compact=compactCorners();compact.objects[0][3]=[300,200,100,500];assert.equal(admitSourceScenePlan(compact,source).admission.rejections[0].detailCode,'corner-coordinates');
 let calls=0;const hostile=scene();hostile.objects[0]={get id(){calls++;throw Error('private-token');}};const plan=admitSourceScenePlan(hostile,source);assert.equal(calls,0);assert.equal(plan.admission.rejections[0].detailCode,'object-kind');assert.ok(!JSON.stringify(plan).includes('private-token'));
});


test('admission coerces only explicit contained container parent chains to their legal region',()=>{
 const value=compactCorners();value.objects=[[10,0,'container',[100,100,700,700]],[11,10,'icon',[200,200,400,400]]];value.relations=[];const before=JSON.stringify(value);
 assert.throws(()=>parseSourceScenePlan(value,source),/region/);const plan=admitSourceScenePlan(value,source);assert.equal(plan.objects.length,2);assert.equal(plan.admission.complete,true);assert.equal(plan.objects[1].regionId,'region-n0');assert.equal(plan.objects[1].parentObjectId,'object-n10');assert.deepEqual(plan.objects[1].box,{x:160,y:120,w:160,h:120});assert.equal(JSON.stringify(value),before);
 for(const mutate of [v=>v.objects[0][2]='icon',v=>v.objects[1][3]=[200,200,800,800],v=>v.objects.push([...v.objects[0]]),v=>v.objects[1][1]=99]){const invalid=structuredClone(value);mutate(invalid);const p=admitSourceScenePlan(invalid,source);assert.ok(p.admission.rejections.length>0);assert.ok(!p.objects.some(o=>o.id==='object-n11'));}
 const cyclic=structuredClone(value);cyclic.objects[0][1]=11;assert.equal(admitSourceScenePlan(cyclic,source).objects.length,0);
 const malformed=structuredClone(value);let calls=0;Object.defineProperty(malformed.objects[0],0,{get(){calls++;throw Error('private-token');}});const bad=admitSourceScenePlan(malformed,source);assert.equal(calls,0);assert.equal(bad.objects.length,0);assert.ok(!JSON.stringify(bad).includes('private-token'));
});
