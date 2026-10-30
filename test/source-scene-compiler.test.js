"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {writePng}=require("../packages/slideclone-core/png");
const {parseSourceScenePlan}=require("../packages/slideclone-core/scene-plan/source-scene-plan");
const {compileSourceScene}=require("../packages/slideclone-core/scene-plan/source-scene-compiler");
const {measureSceneContainer}=require("../packages/slideclone-core/scene-plan/source-scene-container");
const {materializeSceneIcon}=require("../packages/slideclone-core/scene-plan/source-scene-icon");
const {measureSceneIcon,measureSceneIconDetailed,materializeSceneIconDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-compile-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*400+x)*4);
 for(let y=50;y<200;y++)for(let x=80;x<280;x++)put(x,y,[210,230,245]);
 for(let y=95;y<115;y++)for(let x=130;x<150;x++)if(x<135||x>=145||y<100||y>=110)put(x,y,[30,60,90]);
 const sourceFile=path.join(root,"source.png");writePng(sourceFile,image);
 const plan=parseSourceScenePlan({coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}},
  {id:"card",parentId:"root",kind:"card",box:{x:190,y:150,w:520,h:540}}],objects:[{id:"icon",regionId:"card",kind:"icon",box:{x:320,y:310,w:60,h:90}}],relations:[]},
 {sourceHash:crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"),widthPx:400,heightPx:300});
 const page={shapes:[],images:[],textBoxes:[{id:"label",text:"Label",box:{x:100,y:65,w:80,h:20}}]};
 return {root,sourceFile,image,plan,page,slideSize:{widthPt:400,heightPt:300}};
}

test('surface portfolio mode uses actual source receipts and does not alter a fully admitted simple page',t=>{
 const f=fixture(t),legacy=compileSourceScene(f),root=path.join(f.root,'portfolio');fs.mkdirSync(root);
 const original=fs.readFileSync(f.sourceFile),chosen=compileSourceScene({...f,root,surfaceSelection:true});
 assert.ok(chosen.evidence.surfaceSelection);assert.equal(chosen.evidence.surfaceSelection.completeRegionSelection,false);
 assert.deepEqual(chosen.page.shapes,legacy.page.shapes);assert.deepEqual(chosen.page.images,legacy.page.images);
 assert.deepEqual(chosen.page.textBoxes,legacy.page.textBoxes);assert.deepEqual(fs.readFileSync(f.sourceFile),original);
 assert.ok(chosen.evidence.glyphOwnedPixels<=100000);assert.ok(chosen.evidence.sourceScanPixels<=4000000);
 const preflight=require('../packages/slideclone-core/scene-plan/source-scene-compiler').preflightSourceScene({...f,surfaceSelection:true});
 assert.equal(preflight.evidence.surfaceSelection,undefined);assert.equal(preflight.evidence.glyphOwnedPixels,0);
});

test('surface portfolio opt-in rejects malformed or hostile flags before filesystem or getter access',t=>{
 const f=fixture(t);let calls=0;
 for(const flag of [null,1,'true',{},[]])assert.throws(()=>compileSourceScene({...f,surfaceSelection:flag}),TypeError);
 const getter={...f};Object.defineProperty(getter,'surfaceSelection',{enumerable:true,get(){calls++;throw Error('private-content');}});
 assert.throws(()=>compileSourceScene(getter),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.throws(()=>compileSourceScene(new Proxy(f,{get(){calls++;throw Error('private-content');}})),TypeError);assert.equal(calls,0);
 assert.equal(compileSourceScene({...f,surfaceSelection:false}).evidence.surfaceSelection,undefined);
});

test('exterior controls are descriptor-validated before option reads and preserve content-safe errors',t=>{
 const f=fixture(t);let calls=0;
 for(const flag of [null,1,'true',{},[]])assert.throws(()=>compileSourceScene({...f,spatialExterior:flag}),TypeError);
 const input={...f};Object.defineProperty(input,'spatialExterior',{enumerable:true,get(){calls++;throw Error('private-content');}});
 assert.throws(()=>compileSourceScene(input),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(calls,0);
});

test('an out-of-region source proposal cannot reserve portfolio rights before the compiler rejects its scope',t=>{
 const f=fixture(t);f.plan.objects.push({id:'object-outside',regionId:'region-card',kind:'container',box:{x:0,y:0,w:30,h:30},pictorialContent:'absent'});
 const result=compileSourceScene({...f,surfaceSelection:true});
 assert.ok(result.evidence.unresolved.some(row=>row.id==='object-outside'&&row.reason==='object-containment'));
 assert.equal(result.evidence.surfaceSelection.rows.some(row=>row.id==='object-outside'),false);
 assert.equal(result.page.shapes.some(shape=>shape.source?.sceneInventoryId==='object-outside'),false);
});

test('observed-inventory compilation counts source identities, excludes region surfaces, and audits surviving output',t=>{
 const f=fixture(t),legacy=compileSourceScene(f);
 f.plan.observedInventory=[{regionId:'region-root',containers:0,icons:0,relations:0},{regionId:'region-card',containers:0,icons:1,relations:0}];
 const output=path.join(f.root,'observed');fs.mkdirSync(output);
 const compiled=compileSourceScene({...f,root:output}),inventory=compiled.evidence.observedInventory;
 const {auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
 assert.deepEqual(inventory.regions[1].materialized,{containers:0,icons:1,relations:0});
 assert.equal(inventory.units.length,1);assert.equal(inventory.units[0].id,'object-icon');
 assert.equal(auditSceneInventory(inventory,compiled.page.shapes,compiled.page.images,f.plan.sourceHash).length,0);
 assert.equal(auditSceneInventory(inventory,compiled.page.shapes,[],f.plan.sourceHash)[0].reason,'compile-missing');
 const drawings=p=>JSON.stringify({...p,source:undefined,shapes:p.shapes.map(s=>({...s,source:undefined})),images:p.images.map(s=>({...s,source:undefined})),textBoxes:p.textBoxes.map(s=>({...s,source:undefined}))});
 assert.equal(drawings(compiled.page),drawings(legacy.page));assert.equal(compiled.evidence.sourceScanPixels,legacy.evidence.sourceScanPixels);
 const preflight=require('../packages/slideclone-core/scene-plan/source-scene-compiler').preflightSourceScene(f);
 assert.equal(preflight.physicalInventory.plan.observedInventory.length,2);
});

test('source-measured physical panels bind complete native labels into a movable group',t=>{
 const f=fixture(t);
 f.page.textBoxes[0].source={editable:true,confidence:.99,evidenceBox:{...f.page.textBoxes[0].box}};
 const original=structuredClone(f.page),result=compileSourceScene(f);
 const panel=result.page.shapes.find(s=>s.source?.detector==='source-scene-container');
 assert.ok(panel);
 assert.equal(result.page.textBoxes[0].source.nativeComponentGroupId,'scene-unit-region-card');
 assert.equal(panel.source.nativeComponentGroupId,'scene-unit-region-card');
 assert.equal(result.evidence.physicallyGroupedText,1);
 assert.deepEqual(f.page,original);
 assert.equal(result.page.textBoxes[0].text,original.textBoxes[0].text);
 assert.deepEqual(result.page.textBoxes[0].box,original.textBoxes[0].box);
});

test('preflight exposes only source-measured object aliases and final physical output stays identical',t=>{
 const f=fixture(t);f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[
  {id:'first',kind:'container',regionId:'region-root',box:{x:76,y:45,w:208,h:162}},
  {id:'repeat',kind:'container',regionId:'region-root',box:{x:76,y:45,w:208,h:162}}];
 const before=JSON.stringify(f.plan),preflight=require('../packages/slideclone-core/scene-plan/source-scene-compiler').preflightSourceScene(f);
 assert.equal(preflight.evidence.containerAliases,1);assert.equal(preflight.physicalInventory.evidence.releasedObjectSlots,1);
 assert.equal(preflight.physicalInventory.plan.objects.length,1);assert.equal(JSON.stringify(f.plan),before);
 const original=compileSourceScene(f),compacted=compileSourceScene({...f,plan:preflight.physicalInventory.plan});
 assert.deepEqual(compacted.page.shapes,original.page.shapes);assert.deepEqual(compacted.page.textBoxes,original.page.textBoxes);
 assert.deepEqual(compacted.page.images,original.page.images);assert.ok(preflight.evidence.sourceScanPixels<=4000000);
 assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
});
test('preflight writes no assets and final changed text evidence cannot inherit icon ownership from a byte cache',t=>{
 const f=fixture(t),preflight=require('../packages/slideclone-core/scene-plan/source-scene-compiler').preflightSourceScene(f);
 assert.equal(preflight.evidence.icons,1);assert.equal(preflight.evidence.glyphOwnedPixels,0);
 assert.equal(fs.existsSync(path.join(f.root,'assets')),false);assert.equal(JSON.stringify(preflight.compilationSession),'{}');
 const result=compileSourceScene({...f,compilationSession:preflight.compilationSession,
  page:{...f.page,textBoxes:[...f.page.textBoxes,{id:'new-source-glyph',text:'Actual glyph',box:{x:130,y:95,w:20,h:20}}]}});
 assert.equal(result.evidence.icons,0);assert.ok(result.evidence.unresolved.some(r=>r.id==='object-icon'&&r.reason==='icon-isolation'));
 assert.equal(result.compilationSession,preflight.compilationSession);assert.ok(result.evidence.sourceScanPixels<=4000000);
 assert.equal(JSON.stringify(result.page).includes('compilationSession'),false);assert.equal(JSON.stringify(result.page).includes('rgba'),false);
 for(const token of [{},structuredClone(preflight.compilationSession),new Proxy(preflight.compilationSession,{})])
  assert.throws(()=>compileSourceScene({...f,compilationSession:token}),TypeError);
 f.image.rgba.fill(255);writePng(f.sourceFile,f.image);
 assert.throws(()=>compileSourceScene({...f,compilationSession:preflight.compilationSession}),/source binding/);
});
test("semantic tables recover their source-painted header cells without individual object proposals",t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 for(const [x,color]of [[60,[150,210,245]],[200,[245,200,225]]])for(let y=50;y<90;y++)for(let px=x;px<x+120;px++)f.image.rgba.set([...color,255],(y*400+px)*4);
 writePng(f.sourceFile,f.image);
 f.plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}},
  {id:'table',parentId:'root',kind:'table',box:{x:40,y:40,w:300,h:150}}
 ],objects:[],relations:[]},{sourceHash:crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex'),widthPx:400,heightPx:300});
 f.page={shapes:[],images:[],textBoxes:[{id:'left',text:'First',box:{x:80,y:60,w:80,h:20}},{id:'right',text:'Second',box:{x:220,y:60,w:80,h:20}}]};
 const before=JSON.stringify(f.page),result=compileSourceScene(f);
 assert.equal(result.evidence.tableHeaderBackgrounds,2);
 assert.equal(result.page.shapes.length,2);assert.equal(result.page.images.length,0);
 assert.deepEqual(result.page.shapes.map(s=>s.style.fill).sort(),['#96D2F5','#F5C8E1']);
 assert.ok(result.page.shapes.every(s=>s.source.editable&&s.source.sceneRegionId==='region-table'));
 assert.deepEqual(result.page.textBoxes.map(t=>t.text),['First','Second']);assert.equal(JSON.stringify(f.page),before);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 f.plan.regions.find(r=>r.id==='region-table').kind='container';
 f.page.textBoxes.push(...[110,150].flatMap(y=>[{id:'body-left-'+y,text:'Left',box:{x:80,y,w:80,h:20}},{id:'body-right-'+y,text:'Right',box:{x:220,y,w:80,h:20}}]));
 const physical=compileSourceScene(f);assert.equal(physical.evidence.tableHeaderBackgrounds,2);
 assert.deepEqual(physical.page.shapes.map(s=>s.style.fill).sort(),['#96D2F5','#F5C8E1']);
 f.image.rgba.fill(255);writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 const blank=compileSourceScene(f);assert.equal(blank.evidence.tableHeaderBackgrounds,0);assert.equal(blank.page.shapes.length,0);
});
test("table header proposals stay in source coordinates, preserve controls and use only spare object slots",()=>{
 const {proposeSceneTableHeaders:propose}=require('../packages/slideclone-core/scene-plan/source-scene-table-headers');
 const input={regions:[{id:'table',kind:'table',box:{x:40,y:40,w:300,h:150}}],widthPx:400,heightPx:300,
  slideSize:{widthPt:200,heightPt:150},capacity:64,textBoxes:[
   {text:'A',box:{x:40,y:30,w:40,h:10}},{text:'B',box:{x:110,y:30,w:40,h:10}},
   {text:'body',box:{x:40,y:55,w:40,h:10}}
  ]};
 const before=JSON.stringify(input),headers=propose(input);
 assert.equal(headers.length,2);assert.deepEqual(headers[0].box,{x:50,y:54,w:140,h:32});
 assert.equal(JSON.stringify(input),before);headers[0].box.x=0;assert.equal(propose(input)[0].box.x,50);
 assert.equal(propose({...input,capacity:1}).length,1);assert.equal(propose({...input,capacity:0}).length,0);
 assert.deepEqual(propose({...input,textBoxes:[]}),[]);
 assert.deepEqual(propose({...input,textBoxes:[input.textBoxes[0]]}),[]);
 assert.deepEqual(propose({...input,textBoxes:[input.textBoxes[0],{text:'overlap',box:{x:45,y:30,w:35,h:10}}]}),[]);
 assert.deepEqual(propose({...input,regions:[{...input.regions[0],kind:'diagram'}]}),[]);
 const narrow={...input,regions:[{id:'edge',kind:'table',box:{x:70,y:50,w:250,h:45}}]};
 assert.ok(propose(narrow).every(h=>h.box.x>=70&&h.box.y>=50&&h.box.x+h.box.w<=320&&h.box.y+h.box.h<=95));
});
test("unsafe table controls fail before accessors, provider rectangles or source reads can acquire authority",()=>{
 const {proposeSceneTableHeaders:propose}=require('../packages/slideclone-core/scene-plan/source-scene-table-headers');
 const input={regions:[],textBoxes:[],widthPx:400,heightPx:300,slideSize:{widthPt:400,heightPt:300},capacity:64};
 let calls=0;const hostile={};Object.defineProperty(hostile,'x',{get(){calls++;throw Error('private');}});
 for(const value of [null,new Proxy(input,{}),{...input,capacity:65},{...input,capacity:-1},{...input,widthPx:Infinity},
  {...input,regions:new Array(1)},{...input,textBoxes:new Proxy([],{})},
  {...input,regions:[{id:'table',kind:'table',box:hostile}]},
  {...input,textBoxes:[{text:'A',box:{x:1,y:1,w:10,h:10},source:{evidenceBox:hostile}}]},
  {...input,textBoxes:[{text:'A',box:{x:399,y:1,w:10,h:10}}]}])assert.throws(()=>propose(value),TypeError);
 assert.equal(calls,0);
});
test("optional table source probes reserve the original scan budget and propagate genuine measurement failures",()=>{
 const {appendSceneTableHeaderBackgrounds:append}=require('../packages/slideclone-core/scene-plan/source-scene-table-headers');
 const image={width:200,height:100,rgba:Buffer.alloc(200*100*4,255)},headers=[{id:'header',regionId:'table',box:{x:30,y:20,w:100,h:30}}];
 let calls=0;const input={headers,image,slideSize:{widthPt:200,heightPt:100},shapes:[],budget:{used:4000000},
  measure:()=>{calls++;throw Error('measurement-failure');},glyphReserve:()=>0};
 assert.deepEqual(append(input),{accepted:0,skippedBudget:1});assert.equal(calls,0);assert.equal(input.budget.used,4000000);
 assert.deepEqual(append({...input,budget:{used:0},glyphReserve:()=>4000001}),{accepted:0,skippedBudget:1});assert.equal(calls,0);
 assert.throws(()=>append({...input,budget:{used:0}}),/measurement-failure/);assert.equal(calls,1);
 assert.deepEqual(append({...input,budget:{used:0},measure:()=>null}),{accepted:0,skippedBudget:0});
 const {sceneGlyphOcclusionScanReserve:reserve}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 assert.equal(reserve({},headers[0].box),0);assert.throws(()=>reserve({},new Proxy(headers[0].box,{})),TypeError);
});
test("scene compilation emits source measured containers and isolated icons and assigns text to the smallest region",t=>{
 const f=fixture(t),before=JSON.stringify(f.page),result=compileSourceScene(f);
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.icons,1);assert.equal(result.evidence.assignedText,1);
 assert.equal(result.page.textBoxes[0].source.sceneRegionId,"region-card");assert.equal(JSON.stringify(f.page),before);
 const panel=result.page.shapes[0];assert.ok(Math.abs(panel.box.x-80)<3);assert.ok(Math.abs(panel.box.w-200)<4);
 assert.equal(panel.source.residualBackgroundFill,true);assert.equal(panel.style.fill,"#D2E6F5");
 assert.ok(fs.existsSync(path.join(f.root,result.page.images[0].assetPath)));assert.ok(result.page.images[0].source.tightCropAdmission);
});
test("a model box on blank source cannot create a panel or image",t=>{
 const f=fixture(t);f.image.rgba.fill(255);writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
 const result=compileSourceScene(f);assert.equal(result.evidence.containers,0);assert.equal(result.evidence.icons,0);
 assert.ok(result.evidence.unresolved.some(item=>item.reason==="container-perimeter"));
});

test("compiler recovers a glyph-occluded source body while retaining its native text",t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 for(let y=20;y<80;y++)for(let x=20;x<80;x++){
  if((x-49.5)**2+(y-49.5)**2>=900)continue;
  const glyph=x>=30&&x<70&&y>=30&&y<70&&(x<41||x>=59||y>=44&&y<56);
  f.image.rgba.set(glyph?[255,255,255,255]:[0,130,70,255],(y*400+x)*4);
 }
 writePng(f.sourceFile,f.image);
 f.plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}
 ],objects:[{id:'body',regionId:'root',kind:'container',box:{x:20,y:20,w:60,h:60}}],relations:[]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex'),widthPx:400,heightPx:300});
 f.page={shapes:[],images:[],textBoxes:[{id:'label',text:'H',box:{x:30,y:30,w:40,h:40},font:{color:'#FFFFFF',sizePt:40,family:'Arial'}}]};
 const before=JSON.stringify(f.page),sourceHash=f.plan.sourceHash,result=compileSourceScene(f);
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.glyphMeasurements,1);
 assert.equal(result.page.images.length,0);assert.equal(result.page.textBoxes[0].text,'H');
 assert.equal(result.page.textBoxes[0].font.color,'#FFFFFF');
 assert.ok(result.page.shapes.some(shape=>shape.source.editable&&shape.style.fill==='#008246'));
 const body=result.page.shapes.find(shape=>shape.style.fill==='#008246');
 assert.ok(body.source.sourcePaintSupport<.58);assert.ok(body.source.sourceGlyphOcclusionPixels>0);
 assert.ok(body.source.sourcePerimeterSupport>=.58);
 assert.equal(JSON.stringify(f.page),before);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex'),sourceHash);
 const legacy=compileSourceScene({...f,page:{...f.page,textBoxes:f.page.textBoxes.map(({font,...text})=>text)}});
 assert.equal(legacy.evidence.containers,0);assert.ok(result.evidence.sourceScanPixels<=4000000);
});

test("a source-bound edge panel compiles as one editable background without borrowing the page background",t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 for(let y=260;y<300;y++)for(let x=0;x<400;x++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);
 f.plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}},
  {id:'edge',parentId:'root',kind:'container',box:{x:0,y:260,w:400,h:40}}
 ],objects:[],relations:[]},{sourceHash:crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex'),widthPx:400,heightPx:300});
 const result=compileSourceScene(f);
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.resolvedRelations,0);
 const shape=result.page.shapes.find(s=>s.source?.sceneRegionId==='region-edge');
 assert.deepEqual(shape.box,{x:0,y:260,w:400,h:40});assert.equal(shape.style.fill,'#1E3C5A');
 assert.equal(shape.source.editable,true);assert.equal(shape.source.residualBackgroundFill,true);
 assert.ok(result.evidence.sourceScanPixels<=262144);assert.equal(result.page.images.length,0);
 assert.equal(require('../packages/slideclone-core/quality/native-component-quality').auditNativeComponentQuality({pages:[result.page]}).passed,true);
});
test("source mutation and dimensions are rejected before object emission",t=>{
 const f=fixture(t);fs.appendFileSync(f.sourceFile,"changed");assert.throws(()=>compileSourceScene(f),/binding/);
 const g=fixture(t);g.plan.widthPx=401;assert.throws(()=>compileSourceScene(g),/binding/);
});
test("rejected scene proposals and unresolved relations fail native completion independently of visual scores",t=>{
 const {auditNativeComponentQuality}=require("../packages/slideclone-core/quality/native-component-quality");
 const f=fixture(t);f.plan.admission={complete:false,rejections:[{collection:"object",index:3,reason:"object-contract"}]};
 const result=compileSourceScene(f),audit=auditNativeComponentQuality({pages:[result.page]});
 assert.equal(audit.passed,false);assert.equal(audit.metrics.unresolvedSceneComponents,1);
 assert.equal(audit.checks.find(c=>c.name==="source-scene-completion").passed,false);
 const clear=compileSourceScene(fixture(t));assert.equal(auditNativeComponentQuality({pages:[clear.page]}).passed,true);
 assert.equal(auditNativeComponentQuality({pages:[{...clear.page,source:{sourceScene:{version:1,unresolved:null}}}]}).passed,false);
});
test("scene completion rejects sparse, proxy and accessor evidence without running getters",()=>{
 const {auditNativeComponentQuality}=require("../packages/slideclone-core/quality/native-component-quality");
 let calls=0;const hostile={version:1};Object.defineProperty(hostile,"unresolved",{get(){calls++;throw Error("private-token");}});
 for(const scene of [hostile,new Proxy({version:1,unresolved:[]},{}),{version:1,unresolved:new Array(1)},
  {version:1,unresolved:new Proxy([],{})},{version:1,unresolved:Array(113).fill({id:"x",reason:"unknown"})}]){
  const audit=auditNativeComponentQuality({pages:[{shapes:[],images:[],source:{sourceScene:scene}}]});
  assert.equal(audit.passed,false);assert.equal(audit.checks.find(c=>c.name==="source-scene-completion").passed,false);
 }
 assert.equal(calls,0);
});
test("scene completion rejects hostile source records before accessing scene evidence",()=>{
 const {auditNativeComponentQuality}=require("../packages/slideclone-core/quality/native-component-quality");
 let calls=0;const hostile={};Object.defineProperty(hostile,"sourceScene",{get(){calls++;throw Error("private-token");}});
 const proxy=new Proxy({}, {get(){calls++;throw Error("private-token");},getOwnPropertyDescriptor(){calls++;throw Error("private-token");}});
 for(const source of [hostile,proxy,null,[],"invalid"]){
  const audit=auditNativeComponentQuality({pages:[{shapes:[],images:[],source}]});
  assert.equal(audit.passed,false);
  assert.equal(audit.checks.find(c=>c.name==="source-scene-completion").passed,false);
 }
 assert.equal(calls,0);
});
test("invalid containment and unobserved topology stay unresolved without inventing connectors",t=>{
 const f=fixture(t);f.plan.objects[0].box.x=300;f.plan.relations=[{id:"relation",regionId:"region-root",fromId:"object-icon",toId:"region-card",direction:"both"}];
 const result=compileSourceScene(f);assert.equal(result.evidence.icons,0);
 assert.ok(result.evidence.unresolved.some(item=>item.reason==="object-containment"));
 assert.ok(result.evidence.unresolved.some(item=>item.reason==="relation-source-evidence"&&item.detailCode==="relation-scope"));
 assert.equal(result.page.shapes.some(shape=>shape.type==="connector"),false);
});
test("scene compiler emits an attached connector only between source measured containers",t=>{
 const f=fixture(t);
 for(let y=50;y<200;y++)for(let x=300;x<380;x++)f.image.rgba.set([230,215,245,255],(y*400+x)*4);
 for(let x=280;x<300;x++)for(let y=124;y<=126;y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let x=295;x<=299;x++)for(let y=125-(299-x);y<=125+(299-x);y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
 f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[{id:"left",regionId:"region-root",kind:"container",box:{x:76,y:45,w:208,h:162}},
  {id:"right",regionId:"region-root",kind:"container",box:{x:296,y:45,w:88,h:162}}];
 f.plan.relations=[{id:"edge",regionId:"region-root",fromId:"left",toId:"right",direction:"forward"}];
 const result=compileSourceScene(f);assert.equal(result.evidence.containers,2);assert.equal(result.evidence.resolvedRelations,1);
 const edge=result.page.shapes.find(s=>s.source?.detector==="source-scene-relation");assert.ok(edge);
 assert.deepEqual(edge.style.startAnchor,{elementId:"scene-container-left",side:"right",position:.5});
 assert.deepEqual(edge.style.endAnchor,{elementId:"scene-container-right",side:"left",position:.5});
 assert.equal(require("../packages/slideclone-core/quality/native-component-quality").auditNativeComponentQuality({pages:[result.page]}).passed,true);
 f.plan.relations[0].shaftBox={x:280,y:115,w:20,h:20};
 const anchored=compileSourceScene(f);assert.equal(anchored.evidence.resolvedRelations,1);
 assert.deepEqual(anchored.page.shapes,result.page.shapes);
 f.plan.relations[0].shaftBox={x:280,y:210,w:20,h:20};
 const wrong=compileSourceScene(f);assert.equal(wrong.evidence.resolvedRelations,0);
 assert.ok(wrong.evidence.unresolved.some(r=>r.id==='edge'&&r.detailCode==='relation-anchor'));
 assert.equal(wrong.evidence.sourceScanPixels,anchored.evidence.sourceScanPixels);
});
test("source fill touching the window boundary and oversized scans cannot become containers",t=>{
 const f=fixture(t),budget={used:0};assert.equal(measureSceneContainer(f.image,{x:100,y:80,w:20,h:20},[],budget),null);
 assert.equal(measureSceneContainer(f.image,{x:0,y:0,w:400,h:300},[],{used:0}),null);
 assert.throws(()=>measureSceneContainer(f.image,{x:76,y:45,w:208,h:162},[],{used:4000000}),/budget/);
});
test("a rejected exterior component does not hide a closed panel of the same fill",t=>{
 const f=fixture(t);
 // The loose hint starts above the panel in a matching exterior strip. The
 // old first-match flood returned null as soon as that strip hit the window.
 for(let y=30;y<48;y++)for(let x=0;x<400;x++)f.image.rgba.set([210,230,245,255],(y*400+x)*4);
 const hint={x:76,y:45,w:208,h:162},budget={used:0};
 const measured=measureSceneContainer(f.image,hint,[],budget);
 assert.ok(measured);assert.deepEqual(measured.box,{x:80,y:50,w:200,h:150});
 assert.ok(budget.used<=262144);
});
test("semantic diagrams remain grouping metadata even when an enclosing fill is measurable",t=>{
 const f=fixture(t);f.plan.regions[1].kind="diagram";f.plan.objects=[];
 const result=compileSourceScene(f);
 assert.equal(result.evidence.containers,0);assert.equal(result.page.shapes.length,0);
 assert.equal(result.evidence.assignedText,1);assert.equal(result.page.source.sourceScene.regionTree[1].kind,"diagram");
});

test("semantic sections recover only independently measured hollow source rings",t=>{
 const f=fixture(t);f.plan.objects=[];f.plan.regions=f.plan.regions.slice(0,1);
 f.plan.regions[0].box={x:75,y:45,w:210,h:160};
 for(let n=80;n<=280;n++)for(let d=0;d<3;d++)for(const y of [50+d,197+d])f.image.rgba.set([30,70,90,255],(y*400+n)*4);
 for(let n=50;n<=200;n++)for(let d=0;d<3;d++)for(const x of [80+d,277+d])f.image.rgba.set([30,70,90,255],(n*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
 const result=compileSourceScene(f),ring=result.page.shapes.find(s=>s.id.startsWith("scene-region-outline-"));
 assert.ok(ring);assert.equal(ring.type,"freeform");assert.equal(ring.style.freeformSegments.filter(s=>s.type==="moveTo").length,2);
 assert.equal(ring.source.residualBackgroundFill,undefined);assert.equal(result.evidence.containers,0);assert.equal(result.evidence.regionOutlines,1);
 assert.equal(result.page.textBoxes[0].text,"Label");assert.equal(result.page.shapes.length,1);
 const existing=compileSourceScene({...f,page:{...f.page,shapes:[ring]}});
 assert.equal(existing.page.shapes.length,1);assert.equal(existing.evidence.regionOutlines,0);
 const scaled=compileSourceScene({...f,slideSize:{widthPt:200,heightPt:150},page:{...f.page,textBoxes:[]}});
 assert.equal(scaled.evidence.regionOutlines,1);assert.equal(scaled.page.shapes[0].box.w,ring.box.w/2);
 const owned=compileSourceScene({...f,page:{...f.page,textBoxes:[{text:"Label",box:{x:80,y:70,w:3,h:20}}]}});
 assert.equal(owned.evidence.regionOutlines,0);
 for(let y=45;y<56;y++)for(let x=160;x<176;x++)f.image.rgba.set([255,255,255,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
 assert.equal(compileSourceScene(f).page.shapes.length,0);
});

test("repeated physical hints reuse source scans and leave optional outlines within the original pixel allowance",t=>{
 const f=fixture(t);f.plan.regions=f.plan.regions.slice(0,1);
 f.plan.objects=Array.from({length:64},(_,i)=>({id:`object-${i}`,regionId:f.plan.regions[0].id,kind:"container",box:{x:76,y:45,w:208,h:162}}));
 const result=compileSourceScene(f);
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.containerAliases,63);assert.equal(result.evidence.regionOutlines,0);assert.equal(result.evidence.regionOutlineSkippedBudget,0);
 assert.equal(result.evidence.fillReuses,63);assert.equal(result.evidence.outlineReuses,126);assert.ok(result.evidence.sourceScanPixels<262144);
 assert.equal(result.evidence.unresolved.length,0);
});

test("different semantic hints for one source body retain one native identity and an attached alias relation",t=>{
 const f=fixture(t);
 for(let y=50;y<200;y++)for(let x=300;x<380;x++)f.image.rgba.set([230,215,245,255],(y*400+x)*4);
 for(let x=280;x<300;x++)for(let y=124;y<=126;y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let x=295;x<=299;x++)for(let y=125-(299-x);y<=125+(299-x);y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
 f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[
  {id:"left",regionId:"region-root",kind:"container",box:{x:78,y:48,w:204,h:154}},
  {id:"alias",regionId:"region-root",kind:"container",box:{x:76,y:45,w:208,h:162}},
  {id:"right",regionId:"region-root",kind:"container",box:{x:296,y:45,w:88,h:162}}];
 f.plan.relations=[{id:"edge",regionId:"region-root",fromId:"alias",toId:"right",direction:"forward"}];
 const result=compileSourceScene(f),edge=result.page.shapes.find(s=>s.source?.detector==="source-scene-relation");
 assert.equal(result.evidence.containers,2);assert.equal(result.evidence.containerAliases,1);assert.equal(result.evidence.resolvedRelations,1);
 assert.ok(edge);assert.equal(edge.style.startAnchor.elementId,"scene-container-left");
 assert.ok(result.page.shapes.some(s=>s.id===edge.style.startAnchor.elementId));
 assert.equal(result.page.shapes.some(s=>s.id==="scene-container-alias"),false);
 assert.deepEqual(edge.source.sourceNodeIds,["scene-container-left","scene-container-right"]);
 assert.equal(result.evidence.unresolved.length,0);assert.ok(result.evidence.sourceScanPixels<=4000000);
 f.plan.relations.push({id:"alias-self",regionId:"region-root",fromId:"alias",toId:"left",direction:"forward"});
 const self=compileSourceScene(f);
 assert.equal(self.evidence.resolvedRelations,1);
 assert.ok(self.evidence.unresolved.some(r=>r.id==="alias-self"&&r.detailCode==="same-physical-node"));
 assert.equal(self.page.shapes.some(s=>s.id==="scene-alias-self"),false);
});
test("icon candidates cannot contain text or connected/clipped strokes",t=>{
 const f=fixture(t),input={image:f.image,box:{x:128,y:93,w:24,h:27},id:"icon",regionId:"card",root:f.root,slideSize:f.slideSize,textBoxes:[]};
 assert.equal(materializeSceneIcon({...input,textBoxes:[{text:"Caption",box:{x:130,y:100,w:40,h:10}}]}),null);
 assert.throws(()=>materializeSceneIcon({...input,budget:{used:4000000}}),/budget/);
 for(let x=110;x<170;x++)f.image.rgba.set([30,60,90,255],(105*400+x)*4);
 assert.equal(materializeSceneIcon(input),null);
});
test('source icon stages distinguish empty, text-owned, clipped and unsupported windows while preserving legacy measurement',t=>{
 const f=fixture(t),request={image:f.image,box:{x:128,y:93,w:24,h:27},id:'icon',regionId:'card',root:f.root,slideSize:f.slideSize,textBoxes:[],budget:{used:0}};
 const before=Buffer.from(f.image.rgba),detail=measureSceneIconDetailed(request);
 assert.equal(detail.reason,'icon-source-isolated');assert.ok(detail.measurement);
 assert.deepEqual(measureSceneIcon({...request,budget:{used:0}}),detail.measurement);
 assert.deepEqual(f.image.rgba,before);assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
 const text=measureSceneIconDetailed({...request,textBoxes:[{text:'private contents',box:{x:130,y:100,w:40,h:10}}]});
 assert.equal(text.measurement,null);assert.equal(text.reason,'icon-source-text');
 assert.ok(!JSON.stringify(text).includes('private contents'));
 const empty=measureSceneIconDetailed({...request,image:{...f.image,rgba:Buffer.alloc(f.image.rgba.length,255)}});
 assert.equal(empty.reason,'icon-source-empty');assert.equal(empty.measurement,null);
 const small=measureSceneIconDetailed({...request,box:{x:0,y:0,w:1,h:1},budget:{used:0}});
 assert.equal(small.reason,'icon-source-window');assert.equal(small.measurement,null);
 const extremeBudget={used:0},extreme=measureSceneIconDetailed({...request,image:{width:600,height:500,rgba:Buffer.alloc(600*500*4,255)},
  box:{x:0,y:0,w:600,h:500},budget:extremeBudget});
 assert.equal(extreme.reason,'icon-source-window');assert.equal(extremeBudget.used,0);
 assert.throws(()=>measureSceneIconDetailed({...request,id:'../private-token'}),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.throws(()=>measureSceneIconDetailed({...request,budget:{used:4000000}}),/budget/);
 for(let x=110;x<170;x++)f.image.rgba.set([30,60,90,255],(105*400+x)*4);
 const clipped=measureSceneIconDetailed(request);assert.equal(clipped.measurement,null);assert.equal(clipped.reason,'icon-source-clipped-component');
});
test('real preflight and final compiler retain the same safe failure stage without granting paint or writing failed assets',t=>{
 const f=fixture(t);f.page.textBoxes=[{id:'caption',text:'private contents',box:{x:130,y:100,w:40,h:10}}];
 for(const preflight of [true,false]){
  const compiled=compileSourceScene({...f,preflight});
  assert.deepEqual(compiled.evidence.unresolved.find(r=>r.id==='object-icon'),{id:'object-icon',reason:'icon-isolation',detailCode:'icon-source-text'});
  assert.equal(compiled.evidence.icons,0);assert.equal(compiled.page.images.length,0);
 }
 const request={image:f.image,box:{x:128,y:93,w:24,h:27},id:'icon',regionId:'card',root:f.root,slideSize:f.slideSize,textBoxes:f.page.textBoxes};
 assert.deepEqual(materializeSceneIconDetailed(request),{measurement:null,reason:'icon-source-text'});
 assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
});
test("source ink isolates an icon from caption ink inside a loose model hint",t=>{
 const f=fixture(t);
 for(let y=97;y<110;y++)for(let x=163;x<174;x++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 const textBoxes=[{text:"Caption",box:{x:160,y:93,w:20,h:25}}];
 const icon=materializeSceneIcon({image:f.image,box:{x:128,y:93,w:55,h:27},id:"loose",regionId:"card",root:f.root,slideSize:f.slideSize,textBoxes});
 assert.ok(icon);assert.ok(icon.box.x+icon.box.w<160);
 assert.ok(icon.source.tightCropAdmission.removedNeighborPixels>0);
});
test("a loose icon hint cannot cut off source ink connected to caption ownership",t=>{
 const f=fixture(t);
 for(let x=145;x<174;x++)f.image.rgba.set([30,60,90,255],(105*400+x)*4);
 const icon=materializeSceneIcon({image:f.image,box:{x:128,y:93,w:55,h:27},id:"connected",regionId:"card",root:f.root,slideSize:f.slideSize,
  textBoxes:[{text:"Caption",box:{x:160,y:93,w:20,h:25}}]});
 assert.equal(icon,null);
});
test("isolated neighboring fragments are not allowed to clip or replace admitted icon details",t=>{
 const f=fixture(t);for(let x=115;x<126;x++)f.image.rgba.set([30,60,90,255],(85*400+x)*4);
 const icon=materializeSceneIcon({image:f.image,box:{x:128,y:93,w:24,h:27},id:"icon",regionId:"card",root:f.root,slideSize:f.slideSize,textBoxes:[]});
 assert.ok(icon);assert.ok(icon.box.x>=128);assert.ok(icon.box.y>=93);assert.ok(icon.source.tightCropAdmission.removedNeighborPixels>0);
});
test("scene icons reject linked output directories and existing identities without overwriting",t=>{
 const f=fixture(t),input={image:f.image,box:{x:128,y:93,w:24,h:27},id:"icon",regionId:"card",root:f.root,slideSize:f.slideSize,textBoxes:[]};
 const icon=materializeSceneIcon(input);assert.ok(icon);const file=path.join(f.root,icon.assetPath),before=fs.readFileSync(file);
 assert.throws(()=>materializeSceneIcon(input),/identity/);assert.deepEqual(fs.readFileSync(file),before);
 const g=fixture(t),target=path.join(g.root,"other");fs.mkdirSync(target);fs.symlinkSync(target,path.join(g.root,"assets"),process.platform==="win32"?"junction":"dir");
 assert.throws(()=>materializeSceneIcon({...input,image:g.image,root:g.root}),/directory/);
 assert.throws(()=>materializeSceneIcon({...input,id:"../private-token"}),e=>/identity/.test(e.message)&&!e.message.includes("private-token"));
});
test("a wavy perimeter compiles as separate native background and hollow outline instead of a filled ink box",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-outline-compile-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:800,height:800,rgba:Buffer.alloc(800*800*4,255)};
 const put=(x,y)=>image.rgba.set([30,70,90,255],(y*800+x)*4);
 for(let n=80;n<=680;n++){const wave=Math.round(10*Math.sin((n-80)*2*Math.PI/600));
  for(let d=0;d<4;d++){put(n,80+wave+d);put(n,677+wave+d);put(80+wave+d,n);put(677+wave+d,n);}}
 const sourceFile=path.join(root,"source.png");writePng(sourceFile,image);
 const plan=parseSourceScenePlan({format:"compact-v2",coordinateSpace:"normalized-1000",boxFormat:"ymin-xmin-ymax-xmax",
  regions:[[0,null,"section",[0,0,1000,1000]]],objects:[[0,0,"container",[100,100,850,850]]],relations:[]},
 {sourceHash:crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"),widthPx:800,heightPx:800});
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:800,heightPt:800}});
 assert.equal(result.evidence.containers,1);assert.equal(result.page.shapes.length,2);
 const background=result.page.shapes.find(s=>s.source.detector==="source-scene-container"),outline=result.page.shapes.find(s=>s.source.detector==="source-scene-outline");
 assert.equal(background.type,"freeform");assert.equal(background.style.freeformSegments.filter(s=>s.type==="moveTo").length,1);
 assert.equal(background.style.fill,"#FFFFFF");assert.equal(background.source.residualBackgroundFill,true);
 assert.equal(outline.style.fill,"#1e465a");assert.equal(outline.source.residualBackgroundFill,undefined);
 assert.equal(outline.style.freeformSegments.filter(s=>s.type==="moveTo").length,2);assert.ok(outline.style.freeformSegments.length<=120);
 assert.doesNotThrow(()=>require("../packages/slideclone-core/deck-ir-tree").validateDeckIrTree(result.page));
 assert.equal(outline.source.sourceScanPixels,undefined);assert.equal(result.page.images.length,0);
 for(let y=130;y<630;y++)for(let x=130;x<630;x++)image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
 writePng(sourceFile,image);plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");
 const shell=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:800,heightPt:800}});
 assert.equal(shell.evidence.containers,1);assert.equal(shell.page.shapes.length,1);assert.equal(shell.page.shapes[0].type,"freeform");
 assert.equal(shell.page.shapes[0].source.residualBackgroundFill,false);assert.equal(shell.page.shapes[0].style.fill,"#1e465a");
});

test("a measured hollow perimeter consumes duplicate axis fragments before residual erasure",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-outline-owner-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:800,height:800,rgba:Buffer.alloc(800*800*4,255)};
 for(let n=80;n<=680;n++)for(let d=0;d<4;d++)for(const [x,y] of [[n,80+d],[n,677+d],[80+d,n],[677+d,n]])image.rgba.set([30,70,90,255],(y*800+x)*4);
 for(let y=120;y<640;y++)for(let x=120;x<640;x++)image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
 const sourceFile=path.join(root,"source.png");writePng(sourceFile,image);
 const plan=parseSourceScenePlan({format:"compact-v2",coordinateSpace:"normalized-1000",boxFormat:"ymin-xmin-ymax-xmax",
  regions:[[0,null,"section",[0,0,1000,1000]]],objects:[[0,0,"container",[100,100,850,850]]],relations:[]},
 {sourceHash:crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"),widthPx:800,heightPx:800});
 const duplicate={id:"duplicate",type:"line",box:{x:81,y:110,w:0,h:500},style:{strokeWidthPt:2},source:{detector:"long-axis-line"}};
 const inside={...duplicate,id:"inside",box:{x:200,y:110,w:0,h:500}},crossing={...duplicate,id:"crossing",box:{x:10,y:81,w:700,h:0}};
 const visual={...duplicate,id:'visual-duplicate',style:{stroke:'#445566',strokeWidthPt:2,connectorType:'straight'},
  source:{nativeRebuild:true,detector:'visual-atom-native-connector',nativeComponentPart:'connector'}};
 const arrow={...visual,id:'visual-arrow',style:{...visual.style,endArrow:'triangle'}};
 const attached={...visual,id:'visual-referenced'},reference={...visual,id:'reference',box:{x:200,y:110,w:0,h:500},
  style:{...visual.style,startAnchor:{elementId:attached.id}}};
 const page={shapes:[duplicate,inside,crossing,visual,arrow,attached,reference],images:[],textBoxes:[]},before=JSON.stringify(page);
 const result=compileSourceScene({page,plan,sourceFile,root,slideSize:{widthPt:800,heightPt:800}});
 assert.equal(result.evidence.containers,1);assert.equal(result.page.shapes.some(s=>s.id==="duplicate"),false);
 assert.equal(result.page.shapes.some(s=>s.id===visual.id),false);
 for(const item of [arrow,attached,reference])assert.deepEqual(result.page.shapes.find(s=>s.id===item.id),item);
 assert.deepEqual(result.evidence.outlineAxisRetirements.removed,[visual.id]);
 assert.ok(result.evidence.outlineAxisRetirements.geometryChecks>0);
 for(const id of ["inside","crossing"])assert.equal(result.page.shapes.some(s=>s.id===id),true);
 assert.equal(JSON.stringify(page),before);
 assert.ok(result.page.shapes.some(s=>s.type==="freeform"));
 assert.equal(JSON.stringify(result.page).includes("sourcePixels"),false);
});

test("source-measured disk backgrounds preserve their silhouette and editable text", t => {
  const f = fixture(t); f.image.rgba.fill(255);
  for(let y=60;y<140;y++)for(let x=100;x<180;x++)if(Math.hypot(x+.5-140,y+.5-100)<=40)
    f.image.rgba.set([30,110,180,255],(y*400+x)*4);
  for(let y=80;y<120;y++)for(let x=132;x<148;x++)f.image.rgba.set([255,255,255,255],(y*400+x)*4);
  writePng(f.sourceFile,f.image);
  f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
  f.plan.regions=f.plan.regions.slice(0,1);
  f.plan.objects=[{id:"badge",regionId:f.plan.regions[0].id,kind:"container",box:{x:100,y:60,w:80,h:80}}];
  f.page.textBoxes=[{id:"glyph",text:"7",box:{x:132,y:80,w:16,h:40}}];
  const result=compileSourceScene(f);
  assert.equal(result.evidence.containers,1);assert.equal(result.evidence.icons,0);
  assert.equal(result.page.images.length,0);assert.equal(result.page.shapes[0].type,"freeform");
  assert.deepEqual(result.page.textBoxes[0].box,f.page.textBoxes[0].box);
  assert.equal(result.page.textBoxes[0].text,"7");
  assert.equal(result.page.shapes[0].style.fill,"#1E6EB4");
  f.image.rgba.fill(255);writePng(f.sourceFile,f.image);
  f.plan.sourceHash=crypto.createHash("sha256").update(fs.readFileSync(f.sourceFile)).digest("hex");
  const blank=compileSourceScene(f);
  assert.equal(blank.evidence.containers,0);assert.equal(blank.page.shapes.length,0);
  assert.ok(blank.evidence.unresolved.some(r=>r.reason==="container-perimeter"));
});


test("a top-level physical card compiles without a duplicate object slot while a semantic section stays metadata",t=>{
 const f=fixture(t),card=f.plan.regions[1];card.parentId=null;f.plan.regions=[card];f.plan.objects=[];
 const result=compileSourceScene(f);
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.unresolved.length,0);
 assert.equal(result.page.shapes.find(s=>s.source.detector==='source-scene-container').style.fill,'#D2E6F5');
 const semantic=compileSourceScene({...f,plan:{...f.plan,regions:[{...card,kind:'section'}]}});
 assert.equal(semantic.evidence.containers,0);assert.equal(semantic.page.shapes.length,0);
 f.image.rgba.fill(255);writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 const blank=compileSourceScene(f);assert.equal(blank.evidence.containers,0);assert.equal(blank.page.shapes.length,0);
 assert.ok(blank.evidence.unresolved.some(r=>r.reason==='container-perimeter'));
});


test("fill and recovered perimeter keep independent native geometry instead of stretching the body to the border",t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)f.image.rgba.set([210,230,245,255],(y*400+x)*4);
 for(let y=92;y<122;y++)for(let x=100;x<160;x++)if(x%12<5)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[{id:'loose',regionId:'region-root',kind:'container',box:{x:78,y:55,w:104,h:68}}];
 f.page.textBoxes=[{id:'label',text:'Label',box:{x:100,y:92,w:60,h:30}}];
 const result=compileSourceScene(f),fill=result.page.shapes.find(s=>s.id==='scene-container-loose'),outline=result.page.shapes.find(s=>s.id==='scene-outline-loose');
 assert.deepEqual(fill.box,{x:80,y:80,w:100,h:60});assert.deepEqual(outline.box,{x:76,y:76,w:108,h:68});
 assert.equal(fill.style.fill,'#D2E6F5');assert.equal(outline.style.fill,'#1e3c5a');
 assert.equal(result.evidence.measuredBoundaryOutlines,1);assert.equal(result.page.images.length,0);
 assert.deepEqual(result.page.textBoxes[0].box,f.page.textBoxes[0].box);
});

test("relations bind the independently measured outer perimeter rather than a fill-only attachment",t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 for(const left of [80,240]){
  for(let y=76;y<144;y++)for(let x=left-4;x<left+104;x++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
  for(let y=80;y<140;y++)for(let x=left;x<left+100;x++)f.image.rgba.set([210,230,245,255],(y*400+x)*4);
 }
 for(let x=185;x<=234;x++)for(let y=109;y<=111;y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let x=230;x<=234;x++)for(let y=110-(234-x);y<=110+(234-x);y++)f.image.rgba.set([30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 f.plan.regions=f.plan.regions.slice(0,1);f.plan.objects=[{id:'left',regionId:'region-root',kind:'container',box:{x:78,y:55,w:104,h:68}},
 {id:'right',regionId:'region-root',kind:'container',box:{x:238,y:55,w:104,h:68}}];
 f.plan.relations=[{id:'edge',regionId:'region-root',fromId:'left',toId:'right',direction:'forward'}];f.page.textBoxes=[];
 const result=compileSourceScene(f),edge=result.page.shapes.find(s=>s.id==='scene-edge');
 assert.equal(result.evidence.resolvedRelations,1);assert.ok(edge);
 assert.equal(edge.style.startAnchor.elementId,'scene-outline-left');assert.equal(edge.style.endAnchor.elementId,'scene-outline-right');
 assert.deepEqual(edge.box,{x:184,y:110,w:52,h:0});assert.ok(edge.source.sourceShaftSupport>=.9);
});


test('source relation admission is invariant to slide-unit conversion at the unchanged two-pixel limit',t=>{
 const f=fixture(t);f.image={width:1312,height:1199,rgba:Buffer.alloc(1312*1199*4,255)};f.page.textBoxes=[];
 for(const left of [160,377])for(let y=109;y<287;y++)for(let x=left;x<left+200;x++)
  if(x-left+y-109>=4&&left+199-x+y-109>=4&&x-left+286-y>=4&&left+199-x+286-y>=4)f.image.rgba.set([210,230,245,255],(y*1312+x)*4);
 for(let x=360;x<377;x++)for(let y=195;y<=197;y++)f.image.rgba.set([30,60,90,255],(y*1312+x)*4);
 for(let x=372;x<377;x++)for(let y=196-(376-x);y<=196+(376-x);y++)f.image.rgba.set([30,60,90,255],(y*1312+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 f.plan.widthPx=1312;f.plan.heightPx=1199;f.plan.regions=[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:1312,h:1199}}];
 f.slideSize={widthPt:1312,heightPt:1199};f.plan.objects=[{id:'left',regionId:'region-root',kind:'container',box:{x:160,y:109,w:200,h:178}},
 {id:'right',regionId:'region-root',kind:'container',box:{x:377,y:109,w:200,h:178}}];
 f.plan.relations=[{id:'edge',regionId:'region-root',fromId:'left',toId:'right',direction:'forward'}];
 const original=compileSourceScene(f),scaled=compileSourceScene({...f,slideSize:{widthPt:960,heightPt:877}});
 assert.equal(original.evidence.resolvedRelations,1);assert.equal(scaled.evidence.resolvedRelations,1);
 const a=original.page.shapes.find(s=>s.id==='scene-edge'),b=scaled.page.shapes.find(s=>s.id==='scene-edge');
 assert.deepEqual(b.style.startAnchor,a.style.startAnchor);assert.deepEqual(b.style.endAnchor,a.style.endAnchor);
 assert.equal(scaled.evidence.sourceScanPixels,original.evidence.sourceScanPixels);
});

test('an observed beveled filled node keeps its source silhouette instead of painting bounding-box corners',t=>{
 const f=fixture(t);f.image.rgba.fill(255);
 const inside=(x,y,x0,y0,w,h,cut)=>x>=x0&&y>=y0&&x<x0+w&&y<y0+h&&x-x0+y-y0>=cut&&x0+w-1-x+y-y0>=cut&&x-x0+y0+h-1-y>=cut&&x0+w-1-x+y0+h-1-y>=cut;
 for(let y=50;y<150;y++)for(let x=50;x<170;x++)if(inside(x,y,50,50,120,100,12))f.image.rgba.set(inside(x,y,54,54,112,92,10)?[210,230,245,255]:[30,60,90,255],(y*400+x)*4);
 writePng(f.sourceFile,f.image);f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');f.plan.regions=[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}];f.plan.objects=[{id:'object-node',regionId:'region-root',kind:'container',box:{x:50,y:50,w:120,h:100}}];f.page.textBoxes=[];
 const before=Buffer.from(f.image.rgba),result=compileSourceScene(f),body=result.page.shapes.find(s=>s.id==='scene-container-object-node'),ring=result.page.shapes.find(s=>s.id==='scene-outline-object-node');
 assert.ok(body);assert.ok(ring);assert.equal(body.type,'freeform');assert.equal(body.style.fill,'#D2E6F5');assert.ok(body.style.freeformSegments.length<=120);assert.equal(body.style.freeformSegments.filter(s=>s.type==='moveTo').length,1);
 const polygon=body.style.freeformSegments.filter(s=>s.type!=='close').map(s=>s.points[0]);const filled=(x,y)=>{let n=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)n=!n;}return n;};
 assert.equal(filled(.02,.02),false);assert.equal(filled(.5,.5),true);assert.equal(ring.style.freeformSegments.filter(s=>s.type==='moveTo').length,2);assert.deepEqual(f.image.rgba,before);assert.ok(result.evidence.sourceScanPixels<=4000000);
});
