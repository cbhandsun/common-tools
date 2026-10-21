"use strict";
const assert=require("node:assert/strict"), test=require("node:test"), fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createCandidateDecisionJournal:create}=require("../packages/slideclone-worker-adapter/candidate-decision-journal");
const {createStrictNativeCandidatePolicy,assessStrictNativeCandidate}=require("../packages/slideclone-worker-adapter/candidate-quality-policy");
function quality(pdr=0.10) {return {metrics:{"pixel-diff-ratio":pdr,"foreground-missing-ratio":0.10,"mean-absolute-delta":13,"component-regions-attention":97,"worst-component-normalized-severity":8},providerMessage:"private-token user-content"};}

test('search journal bounds and whitelists evidence without reading hostile frontiers',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'search-journal-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=fs.mkdtempSync(path.join(base,'job-')),file=path.join(root,'candidate.pptx');fs.writeFileSync(file,'artifact');
 const journal=create(base);journal.remember({root,pptxFile:file},quality(),1);
 const entry={hash:'a'.repeat(64),metrics:{pdr:.1,missing:.1,mad:13,layout:0,style:0,content:'private-token'},text:'private-token'};
 const evidence={trials:1,publicationPassed:false,status:{action:'stop-stalled'},frontier:[entry],content:'private-token'};
 journal.search(evidence);const serialized=fs.readFileSync(path.join(root,'candidate-decisions.json'),'utf8');
 assert.doesNotMatch(serialized,/private-token/u);assert.equal(JSON.parse(serialized).searches[0].action,'stop-stalled');
 let reads=0;const hostile=new Proxy([],{get(){reads++;throw Error('private-token');}});
 for(const frontier of [new Array(1),hostile,[{...entry,metrics:{...entry.metrics,pdr:2}}]])assert.throws(()=>journal.search({...evidence,frontier}));
 assert.equal(reads,0);
});

test("strict native decisions record all gate reasons without changing admission or leaking content",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"candidate-strict-decisions-"));
  try {
    const root=fs.mkdtempSync(path.join(base,"job-")),file=path.join(root,"candidate.pptx");fs.writeFileSync(file,"artifact");
    const journal=create(base),before={...quality(),checks:[{name:"quality-rendered",passed:true}]};
    const after={...quality(0.09),checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:false}]};
    journal.remember({root,pptxFile:file},before,1);journal.remember({root,pptxFile:file},after,1);
    const input={baselineQuality:before,candidateQuality:after,candidateDeck:{slideSize:{widthPt:960,heightPt:540},pages:[{textBoxes:[],shapes:[],images:[]}]}};
    const actual=createStrictNativeCandidatePolicy({recordDecision:journal.decide})(input);
    assert.deepEqual(actual,assessStrictNativeCandidate(input));
    const serialized=fs.readFileSync(path.join(root,"candidate-decisions.json"),"utf8"),saved=JSON.parse(serialized).decisions[0];
    assert.equal(saved.policy,"strict-native");assert.equal(saved.accepted,actual.passed);
    assert.deepEqual(saved.reasons,actual.reasons);assert.equal(saved.candidateId,2);
    assert.equal(serialized.includes("private-token"),false);
    assert.throws(()=>createStrictNativeCandidatePolicy({recordDecision:null}),/invalid/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test("journal retries transient replacement locks and preserves the last evidence on permanent failure",t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"candidate-decisions-lock-"));
  try {
    const root=fs.mkdtempSync(path.join(base,"job-")),file=path.join(root,"candidate.pptx");
    fs.writeFileSync(file,"artifact");
    const journal=create(base),rename=fs.renameSync;
    journal.remember({root,pptxFile:file},quality(),1);
    let calls=0, mode="transient";
    t.mock.method(fs,"renameSync",(from,to)=>{
      calls++;
      if(mode!=="transient" || calls<3) throw Object.assign(new Error("replacement locked"),{code:mode==="io"?"EIO":"EPERM"});
      return rename(from,to);
    });
    journal.decide({baselineQuality:quality(),candidateQuality:quality(),accepted:true,sharedRegression:0});
    assert.equal(calls,3);
    const destination=path.join(root,"candidate-decisions.json"),before=fs.readFileSync(destination);
    mode="permanent";calls=0;
    assert.throws(()=>journal.decide({baselineQuality:quality(),candidateQuality:quality(),accepted:true,sharedRegression:0}),{code:"EPERM"});
    assert.equal(calls,6);assert.deepEqual(fs.readFileSync(destination),before);
    mode="io";calls=0;
    assert.throws(()=>journal.decide({baselineQuality:quality(),candidateQuality:quality(),accepted:true,sharedRegression:0}),{code:"EIO"});
    assert.equal(calls,1);assert.deepEqual(fs.readFileSync(destination),before);
    assert.equal(fs.readdirSync(root).some(name=>name.startsWith(".candidate-decisions-")),false);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("candidate decisions identify real artifacts and local regressions without provider text",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"candidate-decisions-"));
  try {
    const root=fs.mkdtempSync(path.join(base,"job-")), file=path.join(root,"candidate.pptx"); fs.writeFileSync(file,"artifact");
    const journal=create(base),before=quality(),after=quality(0.086);
    journal.remember({root,pptxFile:file},before,10); journal.remember({root,pptxFile:file},after,9);
    journal.decide({baselineQuality:before,candidateQuality:after,accepted:false,sharedRegression:0.135});
    const text=fs.readFileSync(path.join(root,"candidate-decisions.json"),"utf8"),saved=JSON.parse(text);
    assert.equal(text.includes("private-token"),false); assert.equal(text.includes(root),false);
    assert.equal(saved.decisions[0].candidateId,2); assert.deepEqual(saved.decisions[0].reasons,["shared-component-regression"]);
    assert.match(saved.renders[0].sha256,/^[a-f0-9]{64}$/); assert.equal(saved.publishable,false);
    assert.throws(()=>journal.decide({baselineQuality:before,candidateQuality:after,accepted:false,sharedRegression:0,policy:"ocr-recovery",policyReasons:["private-token"]}),/reasons are invalid/);
    for(let i=0;i<270;i++) journal.decide({baselineQuality:before,candidateQuality:after,accepted:true,sharedRegression:0});
    const bounded=JSON.parse(fs.readFileSync(path.join(root,"candidate-decisions.json"))); assert.equal(bounded.decisions.length,256);assert.equal(bounded.dropped,15);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
test("journal publication replaces a hardlinked output without altering the linked file",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"candidate-decisions-link-"));
  try {
    const root=fs.mkdtempSync(path.join(base,"job-")),external=path.join(base,"unrelated.json"),file=path.join(root,"candidate.pptx");
    fs.writeFileSync(external,"original");fs.linkSync(external,path.join(root,"candidate-decisions.json"));fs.writeFileSync(file,"artifact");
    create(base).remember({root,pptxFile:file},quality(),1);
    assert.equal(fs.readFileSync(external,"utf8"),"original");
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
test("malformed, hostile and out-of-workspace decision inputs fail closed",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"candidate-decisions-"));
  try {
    const journal=create(base);
    for(const input of [null,{}, {accepted:true,sharedRegression:NaN}]) assert.throws(()=>journal.decide(input),/invalid/);
    const hostile={}; Object.defineProperty(hostile,"accepted",{get(){throw Error("private-token");},enumerable:true});
    assert.throws(()=>journal.decide(hostile),/invalid/);
    assert.throws(()=>journal.remember({root:base,pptxFile:path.join(base,"missing")},quality(),10));
    assert.doesNotThrow(()=>journal.remember({},null,0));
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
