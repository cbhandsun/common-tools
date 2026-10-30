"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {writePng}=require("../packages/slideclone-core/png");
const {createSourceScenePlanner}=require("../packages/slideclone-core/scene-plan/source-scene-planner");
const {proposeMissingSceneText,discoverMissingSceneText,readMissingSceneObservations,acceptMissingSceneText}=require("../packages/slideclone-core/scene-plan/source-scene-missing-text");
const {partitionMissingSceneText}=require("../packages/slideclone-core/scene-plan/source-scene-missing-text");

test('uncovered text-only member priority is a hypothesis and never supplies glyph content',()=>{
 const box={x:10,y:10,w:30,h:30},objects=[
  {id:'label-node',kind:'container',pictorialContent:'absent',box},
  {id:'illustrated-node',kind:'container',pictorialContent:'present',box:{...box,x:50}},
  {id:'icon',kind:'icon',pictorialContent:'absent',box:{...box,x:90}}];
 const before=JSON.stringify(objects),result=discoverMissingSceneText(objects,[],[],32);
 assert.equal(result.length,3);assert.equal(result[0].labelCandidate,true);
 assert.equal(result[1].labelCandidate,undefined);assert.equal(result[2].labelCandidate,undefined);
 assert.ok(result.every(p=>p.text===null&&p.confidence===0));assert.equal(JSON.stringify(objects),before);
 assert.deepEqual(discoverMissingSceneText(objects,[{text:'covered',box}],[],32).map(p=>p.objectId),['illustrated-node','icon']);
 assert.deepEqual(discoverMissingSceneText(objects,[],[],0),[]);
});
test('a reversed bounded glyph rectangle rejects its unit, preserves other observations and fails completion',async t=>{
 const f=fixture(t),before=fs.readFileSync(f.sourceFile);let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {reviews:[],missingText:[],scene:{coordinateSpace:'source-pixels',
   regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
   objects:[{id:'badge',regionId:'root',kind:'icon',box:{x:75,y:20,w:12,h:14}}],relations:[]}};
  const index=request.localTargets.missing[0],b=JSON.parse(request.prompt.split('Targets: ')[1]).find(t=>t.index===index).candidateBox2D;
  return {reviews:[],recoveredText:[{index,text:'X',confidence:.99,color:'#FFFFFF',box_2d:calls===2?[b[2],b[1],b[0],b[3]]:b}]};
 }})(f);
 assert.equal(calls,3);assert.deepEqual(result.evidence.recoveredMissingText,[]);
 assert.deepEqual(result.evidence.rejectedMissingText,[{index:1,reason:'glyph-source-unit'}]);
 assert.equal(result.plan.admission.complete,false);
 assert.deepEqual(result.plan.admission.rejections,[{collection:'missingText',index:1,reason:'glyph-source-unit'}]);
 assert.deepEqual(fs.readFileSync(f.sourceFile),before);
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const compiled=compileSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan:result.plan,slideSize:{widthPt:100,heightPt:100}});
 assert.ok(compiled.evidence.unresolved.some(item=>item.id==='proposal-missingText-1'&&item.reason==='glyph-source-unit'));
 const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
 assert.equal(auditNativeComponentQuality({pages:[compiled.page],meta:{reconstructionMode:'native-hybrid'}}).checks.find(item=>item.name==='source-scene-completion').passed,false);
});
test('bounded glyph geometry rejection grants no scans; malformed transport and missing bindings still abort',t=>{
 const f=fixture(t),p=[{index:1,text:null,confidence:0,box:{x:75,y:20,w:12,h:14}},
  {index:2,text:null,confidence:0,box:{x:10,y:10,w:10,h:10}}];
 const frame={width:100,height:100,sourceTargets:p.map(r=>({index:r.index,cropBox:r.box})),sheetTargets:p.map(r=>({index:r.index,cropBox:r.box}))};
 for(const box_2d of [[340,750,200,870],[200,870,340,750],[200,750,200,870]]){
  const response={recoveredText:[{index:1,text:'X',confidence:.99,color:'#FFFFFF',box_2d},{index:2,text:null,confidence:0}]};
  const observed=readMissingSceneObservations(response,p,frame);assert.equal(observed[0].rejection,'source-unit');
  assert.equal(observed[0].box,undefined);assert.equal(observed[0].color,undefined);assert.equal(observed[1].text,null);
  const budget={used:4000000},accepted=acceptMissingSceneText(p,[observed,observed],f.image,budget);
  assert.deepEqual(accepted.lines,[]);assert.equal(budget.used,4000000);
 }
 for(const box_2d of [null,[0,0,1001,1000],[0,0,Infinity,1000],[0,0,1000],new Proxy([0,0,1000,1000],{})])
  assert.throws(()=>readMissingSceneObservations({recoveredText:[{index:1,text:'X',confidence:.99,color:'#FFFFFF',box_2d},
   {index:2,text:null,confidence:0}]},p,frame),/Scene missing text/);
 assert.throws(()=>readMissingSceneObservations({recoveredText:[{index:2,text:null,confidence:0}]},p,frame),/binding/);
 const {bindMissingSceneTextRejections:bind}=require('../packages/slideclone-core/scene-plan/source-scene-missing-text'),plan={admission:{complete:false,rejections:[{collection:'object',index:0,reason:'object-contract'}]}};
 const before=JSON.stringify(plan),bound=bind(plan,[{index:1,reason:'glyph-source-unit'},{index:2,reason:'recognition-confidence'}]);
 assert.equal(JSON.stringify(plan),before);assert.equal(bound.admission.complete,false);assert.equal(bound.admission.rejections.length,2);
 assert.equal(bind(plan,[]),plan);assert.equal(bind(undefined,[{index:1,reason:'glyph-source-unit'}]),undefined);
});
test("conflicting optional glyph proposals retain independent targets and explicit safe rejection evidence",t=>{
 const f=fixture(t),valid=f.missingText[0],overlap={...valid,text:"private-token",box_2d:[500,100,600,400]};
 const result=partitionMissingSceneText({missingText:[overlap,valid,valid]},f.ocr.lines,f.image);
 assert.deepEqual(result.rejected,[{index:0,reason:"existing-evidence-overlap"},{index:2,reason:"proposal-overlap"}]);
 assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].index,1);
 assert.equal(JSON.stringify(result.rejected).includes("private-token"),false);
 assert.deepEqual(partitionMissingSceneText({},f.ocr.lines,f.image),{proposals:[],rejected:[]});
 assert.throws(()=>partitionMissingSceneText({missingText:[overlap,{...valid,box_2d:[0,0,1001,1]}]},f.ocr.lines,f.image),/coordinates/);
 assert.throws(()=>partitionMissingSceneText({missingText:Array(33).fill(valid)},f.ocr.lines,f.image),/collection/);
});
test("planner continues independent review while conflicts remain a failed scene completion obligation",async t=>{
 const f=fixture(t);let calls=0;
 const result=await createSourceScenePlanner({recognize:async()=>{
  if(++calls===1)return {reviews:[],missingText:[{...f.missingText[0],box_2d:[500,100,600,400]},f.missingText[0]],
   scene:{coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}}],objects:[],relations:[]}};
  return {reviews:[],recoveredText:[{index:1,text:"X",confidence:.99}]};
 }})(f);
 assert.equal(calls,3);assert.deepEqual(result.ocr.lines.map(line=>line.text),["Original","X"]);
 assert.equal(result.plan.admission.complete,false);
 assert.deepEqual(result.plan.admission.rejections,[{collection:"missingText",index:0,reason:"existing-evidence-overlap"}]);
 const {compileSourceScene}=require("../packages/slideclone-core/scene-plan/source-scene-compiler");
 const {page,evidence}=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan:result.plan,sourceFile:f.sourceFile,root:f.root,slideSize:{widthPt:100,heightPt:100}});
 assert.ok(evidence.unresolved.some(item=>item.reason==="existing-evidence-overlap"));
 const {auditNativeComponentQuality}=require("../packages/slideclone-core/quality/native-component-quality");
 assert.equal(auditNativeComponentQuality({pages:[page],meta:{reconstructionMode:"native-hybrid"}}).checks.find(item=>item.name==="source-scene-completion").passed,false);
});
test("a conflicting proposal without a scene completion carrier still aborts before local calls",async t=>{
 const f=fixture(t);let calls=0;
 await assert.rejects(createSourceScenePlanner({recognize:async()=>{
  calls++;return {reviews:[],missingText:[{...f.missingText[0],box_2d:[500,100,600,400]}]};
 }})(f),/overlaps existing evidence/);
 assert.equal(calls,1);assert.equal(f.ocr.lines.length,1);
});
function fixture(t,light=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-missing-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},sourceFile=path.join(root,"source.png");
 for(let y=20;y<34;y++)for(let x=75;x<87;x++)image.rgba.set(light?[20,80,150,255]:[255,255,255,255],(y*100+x)*4);
 for(let y=22;y<32;y++)for(let x=79;x<81;x++)image.rgba.set(light?[255,255,255,255]:[30,30,30,255],(y*100+x)*4);
 writePng(sourceFile,image);
 const ocr={lines:[{text:"Original",confidence:1,box:{x:10,y:50,w:30,h:10}}]},missingText=[{text:"X",confidence:.99,box_2d:[200,750,340,870]}];
 return {root,sourceFile,dimensions:{widthPx:100,heightPx:100},isCancellationRequested:async()=>false,ocr,image,missingText};
}
test("missing light and dark text is independently recovered with the same global and two local calls",async t=>{
 for(const light of [true,false]){
  const f=fixture(t,light);let calls=0;
  const result=await createSourceScenePlanner({recognize:async request=>{
   calls++;if(calls===1)return {reviews:[],missingText:f.missingText};
   assert.equal(request.task,"classify-ocr");assert.equal(request.images.length,1);assert.equal(request.prompt.includes('"X"'),false);
   const targets=JSON.parse(request.prompt.split("Targets: ")[1]);assert.deepEqual(targets.map(p=>p.index),[1]);
   return {reviews:[],recoveredText:[{index:1,text:"X",confidence:calls===2?.98:.97}]};
  }})(f);
  assert.equal(calls,3);assert.deepEqual(result.ocr.lines.map(l=>l.text),["Original","X"]);assert.equal(result.ocr.lines[1].confidence,.97);
  assert.equal(result.evidence.recoveredMissingText.length,1);assert.deepEqual(f.ocr.lines.map(l=>l.text),["Original"]);
  const directory=fs.readdirSync(f.root).find(n=>n.startsWith("scene-review-")),evidence=JSON.parse(fs.readFileSync(path.join(f.root,directory,"evidence.json")));
  assert.ok(evidence.cropPixels<=4000000);assert.ok(evidence.cropPixels>=12*14);
 }
});
test("blank, unreadable, disagreeing and low confidence proposals cannot add or rewrite text",async t=>{
 for(const mode of ["blank","unreadable","disagree","low-confidence"]){
  const f=fixture(t);if(mode==="blank"){f.image.rgba.fill(255);writePng(f.sourceFile,f.image);}let calls=0;
  const result=await createSourceScenePlanner({recognize:async()=>{
   if(++calls===1)return {reviews:[],missingText:f.missingText};
   return {reviews:[],recoveredText:[{index:1,text:mode==="unreadable"?null:mode==="disagree"&&calls===3?"Y":"X",confidence:mode==="low-confidence"?.89:.99}]};
  }})(f);
  assert.equal(calls,3);assert.deepEqual(result.ocr.lines.map(l=>l.text),["Original"]);assert.equal(result.evidence.rejectedMissingText.length,1);
 }
});
test("missing text fails on incomplete crops, provider failure and source mutation",async t=>{
 for(const mode of ["incomplete","provider","mutation"]){
  const f=fixture(t);let calls=0;
  await assert.rejects(createSourceScenePlanner({recognize:async()=>{
   if(++calls===1)return {reviews:[],missingText:f.missingText};
   if(mode==="provider")throw Error("provider failed");
   if(mode==="mutation")fs.appendFileSync(f.sourceFile,"changed");
   return {reviews:[],recoveredText:mode==="incomplete"?[]:[{index:1,text:"X",confidence:.99}]};
  }})(f));
  assert.deepEqual(f.ocr.lines.map(l=>l.text),["Original"]);
 }
});
test("candidate validation rejects overlaps, unsafe strings, sparse collections, coordinates and hostile fields",t=>{
 const f=fixture(t),valid=f.missingText[0];let calls=0;
 const hostile={};Object.defineProperty(hostile,"missingText",{get(){calls++;throw Error("private-token");}});
 for(const value of [hostile,new Proxy({missingText:[]},{}),{missingText:new Array(1)},
  {missingText:[{...valid,box_2d:[500,100,600,400]}]}, {missingText:[valid,valid]},
  ...["", " X", "X\n", "X\u202e", "X".repeat(257)].map(text=>({missingText:[{...valid,text}]})),
  ...[[200,750,200,870],[200,750,1001,870],[200.5,750,340,870],new Proxy(valid.box_2d,{})].map(box_2d=>({missingText:[{...valid,box_2d}]}))]){
  assert.throws(()=>proposeMissingSceneText(value,f.ocr.lines,f.image),e=>!e.message.includes("private-token"));
 }
 assert.equal(calls,0);assert.deepEqual(proposeMissingSceneText({},f.ocr.lines,f.image),[]);
 const p=proposeMissingSceneText({missingText:f.missingText},f.ocr.lines,f.image);
 for(const recoveredText of [[],[{index:0,text:"X",confidence:1}],[{index:1,text:"X",confidence:NaN}],[{index:1,text:"X",confidence:1},{index:1,text:"X",confidence:1}]])
  assert.throws(()=>readMissingSceneObservations({recoveredText},p),/Scene missing text/);
 const observations=[readMissingSceneObservations({recoveredText:[{index:1,text:"X",confidence:1}]},p)];
 assert.throws(()=>acceptMissingSceneText(p,observations,f.image,{used:0}),/two observations/);
 assert.throws(()=>acceptMissingSceneText(p,[...observations,...observations],f.image,{used:4000000}),/budget/);
});
test("missing and existing targets share the original 32 target and four million pixel limits",async t=>{
 const f=fixture(t);f.ocr.lines=Array.from({length:32},(_,i)=>({text:"Q",confidence:.4,box:{x:1+i*.1,y:50,w:1,h:1}}));let calls=0;
 await assert.rejects(createSourceScenePlanner({recognize:async()=>{calls++;return {reviews:[],missingText:f.missingText};}})(f),/crop review exceeds/);assert.equal(calls,1);
 const g=fixture(t);g.image={width:2000,height:2000,rgba:Buffer.alloc(2000*2000*4,255)};writePng(g.sourceFile,g.image);g.dimensions={widthPx:2000,heightPx:2000};calls=0;
 await assert.rejects(createSourceScenePlanner({recognize:async()=>{
  if(++calls===1)return {reviews:[],missingText:[{text:"X",confidence:1,box_2d:[200,200,800,800]}]};
  return {reviews:[],recoveredText:[{index:1,text:"X",confidence:1}]};
 }})(g),/pixel budget/);assert.ok(calls<=2);
});

test("uncovered graphic units share available slots and require independent tight glyph agreement",t=>{
 const f=fixture(t),objects=[{id:"unit",regionId:"root",kind:"icon",box:{x:75,y:20,w:12,h:14}}];
 const p=discoverMissingSceneText(objects,f.ocr.lines,[],1);assert.equal(p.length,1);assert.equal(p[0].text,null);
 assert.deepEqual(discoverMissingSceneText(objects,f.ocr.lines,[],0),[]);
 assert.deepEqual(discoverMissingSceneText(objects,[...f.ocr.lines,{text:"X",confidence:1,box:objects[0].box}],[],1),[]);
 assert.throws(()=>discoverMissingSceneText(objects,f.ocr.lines,[],33),/capacity/);
 const frame={width:100,height:100,sourceTargets:[{index:1,cropBox:{x:75,y:20,w:12,h:14}}],sheetTargets:[{index:1,cropBox:{x:10,y:10,w:12,h:14}}]};
 const response={recoveredText:[{index:1,text:"X",confidence:.99,color:"#FFFFFF",box_2d:[120,140,220,160]}]};
 const a=readMissingSceneObservations(response,p,frame);assert.deepEqual(a[0].box,{x:79,y:22,w:2,h:10});
 // Include background around the glyph; a uniformly filled box is insufficient.
 const contextual={recoveredText:[{index:1,text:"X",confidence:.99,color:"#FFFFFF",box_2d:[110,130,230,170]}]};
 const both=readMissingSceneObservations(contextual,p,frame),accepted=acceptMissingSceneText(p,[both,both],f.image,{used:0});
 assert.equal(accepted.lines.length,1);assert.equal(accepted.lines[0].text,"X");assert.deepEqual(accepted.lines[0].box,{x:79,y:22,w:2,h:10});
 const shifted=readMissingSceneObservations({recoveredText:[{index:1,text:"X",confidence:.99,color:"#FFFFFF",box_2d:[110,170,230,210]}]},p,frame);
 assert.equal(acceptMissingSceneText(p,[both,shifted],f.image,{used:0}).rejected[0].reason,"glyph-geometry-disagreement");
 assert.throws(()=>readMissingSceneObservations({recoveredText:[{index:1,text:"X",confidence:1}]},p,frame),/collection/);
 assert.equal(readMissingSceneObservations({recoveredText:[{index:1,text:"X",confidence:1,color:"#FFFFFF",box_2d:[0,0,1000,1000]}]},p,frame)[0].rejection,"source-unit");
 assert.throws(()=>readMissingSceneObservations({recoveredText:[{index:1,text:"X",confidence:1,box_2d:[110,130,230,170],color:"private-token"}]},p,frame),/color/);
 const disagreement=both.map(o=>({...o,color:"#101010"}));assert.equal(acceptMissingSceneText(p,[both,disagreement],f.image,{used:0}).lines.length,1);
 assert.throws(()=>readMissingSceneObservations(response,p),/coordinates/);
 const unreadable=readMissingSceneObservations({recoveredText:[{index:1,text:"unreadable",confidence:0,box_2d:[0,0,1000,1000]}]},p,frame);
 assert.equal(unreadable[0].text,null);assert.equal(acceptMissingSceneText(p,[unreadable,unreadable],f.image,{used:4000000}).lines.length,0);
});

test("a counter inside clipped foreground is not admitted as a complete recovered glyph",t=>{
 const f=fixture(t);for(let y=20;y<34;y++)for(let x=75;x<87;x++)f.image.rgba.set([255,255,255,255],(y*100+x)*4);
 for(let y=20;y<34;y++)for(let x=75;x<78;x++)f.image.rgba.set([20,80,150,255],(y*100+x)*4);
 for(let y=25;y<29;y++)for(let x=81;x<85;x++)f.image.rgba.set([20,80,150,255],(y*100+x)*4);
 const p=discoverMissingSceneText([{id:"clipped",regionId:"root",kind:"icon",box:{x:75,y:20,w:12,h:14}}],f.ocr.lines,[],1);
 const observations=[[{index:1,text:"X",confidence:1,box:p[0].box}],[{index:1,text:"X",confidence:1,box:p[0].box}]];
 const result=acceptMissingSceneText(p,observations,f.image,{used:0});assert.equal(result.lines.length,0);assert.equal(result.rejected[0].reason,"glyph-geometry-disagreement");
});

test("source-connected glyphs fit inside both observed contexts and cannot duplicate neighboring OCR",t=>{
 const f=fixture(t),objects=[{id:"partial",regionId:"root",kind:"icon",box:{x:75,y:25,w:12,h:8}}],p=discoverMissingSceneText(objects,f.ocr.lines,[],1);
 const frame={width:100,height:100,sourceTargets:[{index:1,cropBox:{x:75,y:20,w:12,h:14}}],sheetTargets:[{index:1,cropBox:{x:10,y:10,w:12,h:14}}]};
 const response={recoveredText:[{index:1,text:"X",confidence:1,color:"#FFFFFF",box_2d:[150,100,230,220]}]};
 const observation=readMissingSceneObservations(response,p,frame),result=acceptMissingSceneText(p,[observation,observation],f.image,{used:0});
 assert.equal(result.lines.length,1);assert.deepEqual(result.lines[0].box,{x:79,y:22,w:2,h:10});
 const duplicate=acceptMissingSceneText(p,[observation,observation],f.image,{used:0},[{text:"Existing",confidence:1,box:{x:79,y:21,w:2,h:3}}]);
 assert.equal(duplicate.lines.length,0);assert.equal(duplicate.rejected[0].reason,"existing-ocr-overlap");
 const low=observation.map(o=>({...o,confidence:.89}));assert.equal(acceptMissingSceneText(p,[observation,low],f.image,{used:0}).lines.length,0);
 const transparent={...f.image,rgba:Buffer.from(f.image.rgba)};transparent.rgba[(20*100+75)*4+3]=0;
 assert.equal(acceptMissingSceneText(p,[observation,observation],transparent,{used:0}).lines.length,0);
});

test("low-confidence out-of-unit glyphs reject only their candidate without geometry authority or pixel scans",t=>{
 const f=fixture(t),p=discoverMissingSceneText([{id:"badge",kind:"icon",box:{x:74,y:19,w:14,h:16}}],f.ocr.lines,[],1);
 const frame={width:100,height:100,sourceTargets:[{index:1,cropBox:{x:70,y:15,w:30,h:30}}],sheetTargets:[{index:1,cropBox:{x:0,y:0,w:30,h:30}}]};
 const response={recoveredText:[{index:1,text:"X",confidence:.89,color:"#FFFFFF",box_2d:[0,0,400,400]}]};
 const observation=readMissingSceneObservations(response,p,frame);
 assert.equal(observation[0].box,undefined);assert.equal(observation[0].color,undefined);
 const budget={used:17},result=acceptMissingSceneText(p,[observation,observation],f.image,budget,f.ocr.lines);
 assert.equal(result.lines.length,0);assert.deepEqual(result.rejected,[{index:1,reason:"recognition-confidence"}]);assert.equal(budget.used,17);
 response.recoveredText[0].confidence=.9;
 const rejected=readMissingSceneObservations(response,p,frame);
 assert.equal(rejected[0].rejection,"source-unit");assert.equal(rejected[0].box,undefined);assert.equal(rejected[0].color,undefined);
 const rejectedBudget={used:17};
 assert.deepEqual(acceptMissingSceneText(p,[rejected,observation],f.image,rejectedBudget).rejected,[{index:1,reason:"glyph-source-unit"}]);
 assert.equal(rejectedBudget.used,17);
 response.recoveredText[0].confidence=.89;response.recoveredText[0].box_2d=[0,0,400,Infinity];
 assert.throws(()=>readMissingSceneObservations(response,p,frame),/coordinates/);
});

test("missing-glyph discovery is independent of an uncovered physical unit's icon or container classification",t=>{
 const f=fixture(t),unit={id:"unit",regionId:"root",kind:"icon",box:{x:75,y:20,w:12,h:14}};
 const icon=discoverMissingSceneText([unit],f.ocr.lines,[],1);
 const container=discoverMissingSceneText([{...unit,kind:"container"}],f.ocr.lines,[],1);
 assert.deepEqual(container,icon);assert.equal(container[0].text,null);assert.equal(container[0].confidence,0);
 assert.equal(discoverMissingSceneText([{...unit,kind:"unknown"}],f.ocr.lines,[],1).length,0);
 assert.equal(discoverMissingSceneText([{...unit,kind:"container"}],[{text:"X",confidence:1,box:unit.box}],[],1).length,0);
 assert.equal(discoverMissingSceneText([{...unit,kind:"container"}],f.ocr.lines,icon,1).length,0);
 assert.equal(discoverMissingSceneText([{...unit,kind:"container"}],f.ocr.lines,[],0).length,0);
});

test("an out-of-unit observation cannot abort or authorize an independent valid proposal",t=>{
 const f=fixture(t),valid={index:2,text:"X",confidence:1,box:{x:75,y:20,w:12,h:14}};
 const invalid={index:1,text:null,confidence:0,box:{x:10,y:10,w:12,h:14}};
 const denied={index:1,text:"Y",confidence:1,rejection:"source-unit"};
 const observed={index:2,text:"X",confidence:1};
 const result=acceptMissingSceneText([invalid,valid],[[denied,observed],[{...denied},observed]],f.image,{used:0});
 assert.equal(result.lines.length,1);assert.equal(result.lines[0].text,"X");
 assert.deepEqual(result.rejected,[{index:1,reason:"glyph-source-unit"}]);
 // A rejection in either independent observation vetoes the unit; there is
 // no fall-through into source probing or partial geometry authorization.
 const budget={used:4000000};
 assert.deepEqual(acceptMissingSceneText([invalid],[[denied],[{index:1,text:"Y",confidence:1}]],f.image,budget).lines,[]);
 assert.equal(budget.used,4000000);
});
test("visible gutter index annotations cannot become source text or acquire source pixel authority",t=>{
 const f=fixture(t),proposals=discoverMissingSceneText([{id:"unit",kind:"icon",box:{x:75,y:20,w:12,h:14}}],f.ocr.lines,[],1);
 const {createSceneCropSheet}=require("../packages/slideclone-core/scene-plan/source-scene-crop-sheet");
 const sourceTargets=[{index:1,cropBox:{x:70,y:15,w:25,h:30},candidateBox:{x:5,y:5,w:12,h:14}}];
 const sheet=createSceneCropSheet({image:f.image,targets:sourceTargets}),crop=sheet.targets[0].cropBox;
 const {sourceBox2D}=require("../packages/slideclone-core/scene-plan/source-scene-coordinate-frame");
 const frame={width:sheet.image.width,height:sheet.image.height,sourceTargets,sheetTargets:sheet.targets};
 const annotation={x:crop.x,y:crop.y-7,w:3,h:5};
 const response={recoveredText:[{index:1,text:"1",confidence:1,color:"#000000",box_2d:sourceBox2D(annotation,sheet.image)}]};
 const observed=readMissingSceneObservations(response,proposals,frame);
 assert.equal(observed[0].rejection,"source-unit");assert.equal(observed[0].box,undefined);assert.equal(observed[0].color,undefined);
 const budget={used:4000000},result=acceptMissingSceneText(proposals,[observed,observed],f.image,budget);
 assert.deepEqual(result.lines,[]);assert.deepEqual(result.rejected,[{index:1,reason:"glyph-source-unit"}]);assert.equal(budget.used,4000000);
});
