"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createLegacyTextSearch}=require("../packages/slideclone-worker-adapter/legacy-text-search");
function quality(pdr=.15){return {passed:false,checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:false}],
 metrics:{'pixel-diff-ratio':pdr,'foreground-missing-ratio':.05,'mean-absolute-delta':15}};}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-text-search-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const metadata={generatedDeck:{slideSize:{widthPt:100,heightPt:50},pages:[{shapes:[],images:[],textBoxes:[{id:'body',text:'私有 Ω漢',
  box:{x:5,y:5,w:80,h:20},font:{family:'Arial',sizePt:12},source:{evidenceBox:{x:5,y:5,w:80,h:20}}}]}]}};
 const proposal=n=>{const deck=structuredClone(metadata.generatedDeck);deck.pages[0].textBoxes[0].font.sizePt=12+n;
  return {deck,changedTextBoxes:1,parameters:{fontFamily:'Arial'}};};
 return {metadata,proposal,request:{root,metadata,sourceImages:[],visualQuality:quality(),family:'font-family',candidateTextBoxes:1,
  proposals:[1,2,3,4,5].map(proposal),cancelled:async()=>false,runBuild:async({pptxFile})=>fs.writeFileSync(pptxFile,'artifact'),
  verify:async()=>quality(),acceptQuality:(a,b)=>b.metrics['pixel-diff-ratio']<a.metrics['pixel-diff-ratio']}};}

test('stalled legacy stages stop after three distinct failures and re-entry does not rebuild',async t=>{
 const f=fixture(t),snapshots=[],run=createLegacyTextSearch({recordSearch:r=>snapshots.push(r)});let builds=0;
 f.request.runBuild=async({pptxFile})=>{builds++;fs.writeFileSync(pptxFile,'artifact');};
 const first=await run(f.request);assert.equal(first.accepted,false);assert.equal(builds,3);
 await run(f.request);assert.equal(builds,3);assert.equal(snapshots.length,2);
 assert.deepEqual(fs.readdirSync(f.request.root),[]);assert.doesNotMatch(JSON.stringify(snapshots),/私有|Ω|漢|root|headers/u);
 assert.equal(first.search.publicationPassed,false);
});

test('font domains remain independent so a later real family can still win',async t=>{
 const f=fixture(t),run=createLegacyTextSearch({fontFamilies:['Arial','Calibri']});let trials=0;
 f.request.proposals.push({...f.proposal(6),parameters:{fontFamily:'Calibri'}});
 f.request.verify=async()=>quality(++trials===4?.14:.15);
 const result=await run(f.request);assert.equal(result.accepted,true);assert.equal(result.fontFamily,'Calibri');assert.equal(trials,4);
 assert.equal(result.search.publicationPassed,false);assert.equal(fs.readdirSync(f.request.root).length,2);
});

test('a shared record spans font, scale and nudge while visual-only edits do not reopen stalled stages',async t=>{
 const f=fixture(t),run=createLegacyTextSearch();let builds=0;
 f.request.runBuild=async({pptxFile})=>{builds++;fs.writeFileSync(pptxFile,'artifact');};await run(f.request);
 const scale={...f.request,family:'text-scale',proposals:[6,7,8,9].map(n=>({...f.proposal(n),parameters:{targetScale:1.04}}))};
 await run(scale);assert.equal(builds,6);
 const nudge={...f.request,family:'text-nudge',proposals:[10,11,12,13].map(n=>({...f.proposal(n),parameters:{deltaYPt:.2}}))};
 const final=await run(nudge);assert.equal(builds,9);assert.equal(final.search.trials,9);assert.equal(final.search.status.action,'stop-stalled');
 f.metadata.generatedDeck.pages[0].textBoxes[0].font.family='Calibri';
 await run({...f.request,proposals:[f.proposal(20)]});assert.equal(builds,9);
 f.metadata.generatedDeck.pages[0].textBoxes[0].source.evidenceBox.h=21;
 const refreshed=await run({...f.request,proposals:[f.proposal(20)]});assert.equal(builds,10);assert.equal(refreshed.search.trials,1);
 f.metadata.generatedDeck.pages[0].textBoxes[0].source.sourceWordObservation={version:2};
 const newObservation=await run({...f.request,proposals:[f.proposal(21)]});assert.equal(builds,11);assert.equal(newObservation.search.trials,1);
});

test('duplicate rendered output across legacy stages never consumes another render',async t=>{
 const f=fixture(t),run=createLegacyTextSearch();f.request.proposals=[f.proposal(1)];await run(f.request);
 const result=await run({...f.request,family:'text-scale',proposals:[{...f.proposal(1),parameters:{targetScale:1.04}}]});
 assert.equal(result.search.trials,1);assert.equal(result.accepted,false);
});

test('build, render, cancellation and recorder failure clean rejected and previously adopted artifacts',async t=>{
 for(const mode of ['build','render','cancel','recorder']){const f=fixture(t);let calls=0,builds=0,cancellations=0;
  f.request.verify=async()=>{if(++calls===2&&mode==='render')throw new Error('render failed');return quality(.14-calls*.01);};
  f.request.runBuild=async({pptxFile})=>{if(++builds===2&&mode==='build')throw new Error('build failed');fs.writeFileSync(pptxFile,'artifact');};
  if(mode==='cancel')f.request.cancelled=async()=>++cancellations>5;
  const run=createLegacyTextSearch({...(mode==='recorder'?{recordSearch:()=>{throw new Error('recorder failed');}}:{})});
  await assert.rejects(run(f.request));assert.deepEqual(fs.readdirSync(f.request.root),[]);
 }
});

test('invalid and hostile boundaries fail before building without invoking getters',async t=>{
 const f=fixture(t);let builds=0;f.request.runBuild=async()=>{builds++;};
 for(const bad of [{...f.request,family:'unknown'},{...f.request,proposals:new Array(1)},
  {...f.request,candidateTextBoxes:1.5},{...f.request,cancelled:async()=>''},
  {...f.request,proposals:[{...f.proposal(1),parameters:{fontFamily:'Arial',headers:'private'}}]},
  {...f.request,proposals:[{...f.proposal(1),parameters:{fontFamily:'Unknown'}}]}])await assert.rejects(createLegacyTextSearch()(bad));
 let reads=0;const hostile={...f.request};Object.defineProperty(hostile,'root',{get(){reads++;return f.request.root;}});
 await assert.rejects(createLegacyTextSearch()(hostile));assert.equal(reads,0);assert.equal(builds,0);
 assert.throws(()=>createLegacyTextSearch({fontFamilies:null}));
 assert.throws(()=>createLegacyTextSearch({fontFamilies:['Arial','Arial']}));
});

test('legacy candidates cannot change source content, evidence, physical ownership or graphics',async t=>{
 const f=fixture(t);let builds=0;f.request.runBuild=async()=>{builds++;};
 for(const change of [d=>{d.pages[0].textBoxes[0].text='lost';},d=>{d.pages[0].textBoxes[0].source.evidenceBox.h=1;},
  d=>{d.pages[0].textBoxes[0].source.nativeComponentGroupId='different';},d=>{d.pages[0].shapes.push({id:'added'});}]){
  const proposal=f.proposal(1);change(proposal.deck);
  await assert.rejects(createLegacyTextSearch()({...f.request,proposals:[proposal]}),/changed source or graphics/u);
 }assert.equal(builds,0);
});

test('failed text audits and malformed render evidence veto otherwise improving legacy candidates',async t=>{
 for(const evidence of [{...quality(.14),typographyEvidence:{passed:false,paragraphs:1,missing:0,overflow:0,collisions:0,unverified:1}},
  {...quality(.14),checks:[{name:'quality-rendered',passed:true},{name:'typography-rendered-order',passed:false}]},
  {...quality(.14),metrics:{}},{...quality(.14),passed:true}]){
  const f=fixture(t);f.request.verify=async()=>evidence;
  const result=await createLegacyTextSearch()(f.request);assert.equal(result.accepted,false);assert.deepEqual(fs.readdirSync(f.request.root),[]);
 }
});

test('empty legacy plans remain a no-op and invalid roots cannot create artifacts',async t=>{
 const f=fixture(t);assert.equal((await createLegacyTextSearch()({...f.request,proposals:[]})).accepted,false);
 await assert.rejects(createLegacyTextSearch()({...f.request,root:'relative'}),/root/u);
 await assert.rejects(createLegacyTextSearch()({...f.request,root:path.join(f.request.root,'missing')}));
});

test('an already failed baseline remains repairable when the candidate fixes the text gate',async t=>{
 const f=fixture(t);f.request.visualQuality={...quality(),checks:[...quality().checks,{name:'typography-rendered-containment',passed:false}]};
 f.request.verify=async()=>quality(.14);const result=await createLegacyTextSearch()(f.request);
 assert.equal(result.accepted,true);assert.equal(result.search.publicationPassed,false);
});

test('legacy font helpers validate names and preserve exact formatting without executing input properties',()=>{
 const {replaceTextFontFamily,textFontFamilyMatches}=require('../packages/slideclone-worker-adapter/legacy-text-search');
 const text={id:'t',text:'Ω漢',font:{family:'Arial',sizePt:14}};
 for(const family of ['',null,'Arial;url(secret)','x'.repeat(257),'A\0B','A\u007fB']){
  assert.throws(()=>replaceTextFontFamily(text,family));assert.throws(()=>textFontFamilyMatches(text,family));}
 let reads=0;const hostile={get font(){reads++;return text.font;}};
 assert.throws(()=>replaceTextFontFamily(hostile,'Arial'));assert.equal(reads,0);
 assert.equal(textFontFamilyMatches(text,'Arial'),true);assert.equal(textFontFamilyMatches(text,'DengXian'),false);
});
