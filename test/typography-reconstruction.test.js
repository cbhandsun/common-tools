"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createParagraphTypographyRefiner}=require("../packages/slideclone-worker-adapter/typography-reconstruction");
function quality(pdr=.15){return {passed:pdr<=.08,checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:pdr<=.08}],metrics:{"pixel-diff-ratio":pdr,"foreground-missing-ratio":.08,"mean-absolute-delta":pdr<=.08?11:15}};}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),"paragraph-refinement-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck={version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,shapes:[],images:[],textBoxes:[
 {id:"a",text:"原文 ΩЖ",box:{x:10,y:10,w:100,h:20},font:{family:"Arial",sizePt:12},source:{sceneRegionId:"panel"}},
 {id:"b",text:"第二行",box:{x:10,y:33,w:100,h:20},font:{family:"Arial",sizePt:12},source:{sceneRegionId:"panel"}}]}]};
 const deckFile=path.join(root,"deck.json"),pptxFile=path.join(root,"deck.pptx");fs.writeFileSync(deckFile,JSON.stringify(deck));fs.writeFileSync(pptxFile,"original");
 return {root,deck,deckFile,pptxFile,initialQuality:quality(),isCancellationRequested:()=>false,
 buildCandidate:async({pptxFile})=>{fs.writeFileSync(pptxFile,"new-native-pptx");},verifyCandidate:async()=>quality(.14)};}
const dependencies={validateDeck:()=>true,auditComponents:()=>({passed:true}),auditSemantic:()=>({passed:true})};

test("actual text audit failures veto a candidate even when all visual scores improve",async t=>{
 const request=fixture(t);request.verifyCandidate=async()=>({...quality(.07),passed:false,
  checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:true},{name:"rendered-typography",passed:false}]});
 const result=await createParagraphTypographyRefiner(dependencies)(request);
 assert.equal(result.accepted,false);assert.equal(result.search.publicationPassed,false);assert.equal(result.pptxFile,request.pptxFile);
 assert.ok(result.search.events.every(e=>e.hardFailures>0));
});

test("incomplete renderer checks cannot hide failed order, ownership or audit coverage",async t=>{
 for(const key of ['order','unverified','ambiguous']){
  const request=fixture(t);request.verifyCandidate=async()=>({...quality(.07),passed:false,
   typographyEvidence:{passed:false,paragraphs:1,missing:0,overflow:0,collisions:0,[key]:1}});
  const result=await createParagraphTypographyRefiner(dependencies)(request);
  assert.equal(result.accepted,false);assert.equal(result.pptxFile,request.pptxFile);
  assert.equal(result.search.publicationPassed,false);
  assert.ok(result.observations.every(row=>row.renderPassed===false&&row.text[key]===1));
 }
});

test("optional search recorder is validated before producing artifacts",()=>{
 assert.throws(()=>createParagraphTypographyRefiner({...dependencies,recordSearch:"invalid"}),/dependencies/u);
});

test("an existing failed structure gate cannot conceal new failures",async t=>{
 const request=fixture(t);let calls=0,builds=0;
 request.buildCandidate=async()=>{builds++;};
 const audit=()=>({passed:false,checks:[{name:++calls===1?"old-failure":"new-failure",passed:false}],findings:[]});
 const result=await createParagraphTypographyRefiner({...dependencies,auditComponents:audit})(request);
 assert.equal(result.accepted,false);assert.equal(builds,0);
 const {structuralRegression}=require("../packages/slideclone-worker-adapter/typography-reconstruction");
 const finding={code:"incomplete",pageIndex:0,elementId:"node"};
 assert.equal(structuralRegression({passed:false,findings:[finding]},{passed:false,findings:[finding,finding]}),true);
 assert.equal(structuralRegression({passed:false,findings:[finding]},{passed:false,findings:[]}),false);
});

test("target renderer measurements drive one shared-size candidate through the same transaction",async t=>{
 const request=fixture(t);let measured=false;
 for(const text of request.deck.pages[0].textBoxes)text.source.evidenceBox={...text.box};
 request.verifyCandidate=async({deck})=>{const text=deck.pages[0].textBoxes[0];if(text.font.sizePt===24)measured=true;
  return {...quality(text.font.sizePt===24?.13:.14),typographyEvidence:{passed:true,paragraphs:deck.pages[0].textBoxes.length,missing:0,overflow:0,collisions:0,
   measurements:[{pageIndex:0,textIndex:0,height:10}]}};};
 const result=await createParagraphTypographyRefiner(dependencies)(request);
 assert.equal(measured,true);assert.ok(result.search.events.some(e=>e.family==='measured-size'));assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt,24);
 assert.equal(result.deliveryState,'refined-unpassed');assert.equal(result.search.publicationPassed,false);
});
test("transaction adopts actual-render improvement, preserves originals and stores safe numeric evidence",async t=>{
 const request=fixture(t),before=structuredClone(request.deck),snapshots=[];
 const r=await createParagraphTypographyRefiner({...dependencies,recordSearch:s=>snapshots.push(s)})(request);
 assert.equal(r.accepted,true);assert.equal(r.deck.pages[0].textBoxes.length,1);assert.deepEqual(request.deck,before);
 assert.equal(fs.readFileSync(request.pptxFile,"utf8"),"original");assert.equal(snapshots.length,1);assert.equal(r.search.publicationPassed,false);
 const log=fs.readFileSync(path.join(request.root,fs.readdirSync(request.root).find(f=>f.startsWith("typography-search-"))),"utf8");
 assert.doesNotMatch(log,/原文|第二行|cookie|headers/u);
});
test("visual regression returns original and incomplete candidates never render",async t=>{
 const request=fixture(t);request.verifyCandidate=async()=>quality(.16);
 const r=await createParagraphTypographyRefiner(dependencies)(request);assert.equal(r.accepted,false);assert.equal(r.pptxFile,request.pptxFile);
 let builds=0;request.buildCandidate=async()=>{builds++;};
 let audits=0;await createParagraphTypographyRefiner({...dependencies,auditComponents:()=>({passed:++audits===1})})(request);assert.equal(builds,0);
});
test("build/render failure and cancellation clean only owned files",async t=>{
 for(const failure of ["build","render","cancel"]){const request=fixture(t),before=fs.readdirSync(request.root);
  if(failure==="build")request.buildCandidate=async()=>{throw new Error("builder failed");};
  if(failure==="render")request.verifyCandidate=async()=>{throw new Error("renderer failed");};
  if(failure==="cancel")request.isCancellationRequested=()=>true;
  await assert.rejects(createParagraphTypographyRefiner(dependencies)(request));assert.deepEqual(fs.readdirSync(request.root),before);}
});
test("workspace escapes and invalid renderer/cancellation boundaries fail",async t=>{
 const request=fixture(t);request.pptxFile=path.join(os.tmpdir(),"outside.pptx");await assert.rejects(createParagraphTypographyRefiner(dependencies)(request));
 const bad=fixture(t);bad.verifyCandidate=async()=>({passed:true,checks:[],metrics:{}});await assert.rejects(createParagraphTypographyRefiner(dependencies)(bad),/evidence/u);
 const cancelled=fixture(t);cancelled.isCancellationRequested=()=>"false";await assert.rejects(createParagraphTypographyRefiner(dependencies)(cancelled),/cancellation/u);
});
