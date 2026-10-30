// @ts-check
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {record,parseTypographyDeck,jsonSnapshot}=require("../slideclone-core/typography/typography-contract");
const {proposeParagraphTypography,assertTypographyContent}=require("../slideclone-core/typography/paragraph-typography");
const {auditTypographyLayout}=require("../slideclone-core/quality/typography-quality");
const {proposeContainerParagraphLayout}=require("../slideclone-core/typography/paragraph-container-layout");
const {fitParagraphRenderFeedback}=require("../slideclone-core/typography/paragraph-render-feedback");
const {parseRenderedTypographyAudit}=require("../slideclone-core/typography/rendered-typography-audit");
const {createReconstructionSearchControl,dominates}=require("../slideclone-core/archetypes/reconstruction-search-control");
/** @typedef {import('../slideclone-core/typography/typography-contract').Deck} Deck */
/** @typedef {{passed:boolean,metrics:Record<string,number>,checks:{name:string,passed:boolean}[],typographyEvidence?:Record<string,unknown>}} Quality */
/** @typedef {{deck:Deck,deckFile:string,pptxFile:string,quality:Quality}} Artifact */
/** @typedef {{validateDeck:(deck:unknown,root:string)=>unknown,auditComponents:(deck:unknown)=>{passed:boolean},auditSemantic:(deck:unknown)=>{passed:boolean},recordSearch?:(report:unknown)=>void}} Dependencies */
/** Compare individual failing gates and finding multiplicities, even if both reports already fail.
 * @param {unknown} baseline @param {unknown} candidate */
function structuralRegression(baseline,candidate){
 const a=jsonSnapshot(baseline),b=jsonSnapshot(candidate);
 if(!record(a)||!record(b)||typeof a.passed!=="boolean"||typeof b.passed!=="boolean")throw new TypeError("Invalid typography structural audit");
 if(a.passed&&!b.passed)return true;
 /** @param {Record<string,unknown>} report */
 function failures(report){const inventory=new Map();
  if(report.checks!==undefined){if(!Array.isArray(report.checks))throw new TypeError("Invalid structural checks");
   for(const check of report.checks){if(!record(check)||typeof check.name!=="string"||typeof check.passed!=="boolean")throw new TypeError("Invalid structural check");
    if(!check.passed){const key=JSON.stringify(["gate",check.name]);inventory.set(key,(inventory.get(key)??0)+1);}}}
  if(report.findings!==undefined){if(!Array.isArray(report.findings))throw new TypeError("Invalid structural findings");
   for(const finding of report.findings){if(!record(finding)||typeof finding.code!=="string")throw new TypeError("Invalid structural finding");
    const key=JSON.stringify(Object.keys(finding).sort().map(k=>[k,finding[k]]));inventory.set(key,(inventory.get(key)??0)+1);}}
  return inventory;}
 const previous=failures(a),next=failures(b);return [...next].some(([key,count])=>count>(previous.get(key)??0));
}
/** @param {unknown} input @returns {Quality} */
function quality(input){const q=jsonSnapshot(input);if(!record(q)||typeof q.passed!=="boolean"||!record(q.metrics)||!Array.isArray(q.checks)
 ||q.checks.some(c=>!record(c)||typeof c.name!=="string"||typeof c.passed!=="boolean")
 ||q.passed&&!q.checks.every(c=>c.passed)
 ||!q.checks.some(c=>record(c)&&c.name==="quality-rendered"&&c.passed===true))throw new TypeError("Typography render evidence missing");
 for(const [k,max] of [["pixel-diff-ratio",1],["foreground-missing-ratio",1],["mean-absolute-delta",255]]){
  const value=q.metrics[String(k)];if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>Number(max))throw new TypeError("Invalid typography render metric");
 }if(q.typographyEvidence!==undefined){const evidence=parseRenderedTypographyAudit(q.typographyEvidence);
  if(!evidence||q.passed&&!evidence.passed)throw new TypeError("Invalid typography text evidence");q.typographyEvidence=evidence;}
 return /** @type {Quality} */(q);}
/** @param {Quality} q @param {ReturnType<typeof auditTypographyLayout>} a */
function metrics(q,a){return {pdr:q.metrics["pixel-diff-ratio"]??1,missing:q.metrics["foreground-missing-ratio"]??1,
 mad:q.metrics["mean-absolute-delta"]??255,layout:a.layout,style:a.style};}
/** @param {Deck} deck */
function digest(deck){return crypto.createHash("sha256").update(JSON.stringify(deck.pages.map(p=>({textBoxes:p.textBoxes.map(t=>({
 id:t.id,text:t.text,box:t.box,font:t.font,runs:t.runs,positionedRuns:t.positionedRuns,style:t.style,rotation:t.rotation}))})))).digest("hex");}
/** @param {string} root @param {string} file @param {boolean} required */
function ownedFile(root,file,required){const relative=path.relative(root,file);
 if(!relative||relative.startsWith("..")||path.isAbsolute(relative))throw new TypeError("Typography artifact outside workspace");
 const info=fs.lstatSync(file,{throwIfNoEntry:false});if(!info&&!required)return;
 if(!info||!info.isFile()||info.isSymbolicLink()||required&&(info.size<1||info.size>256*1024*1024)
  ||fs.realpathSync(path.dirname(file))!==root)throw new TypeError("Invalid typography artifact");}
/** Last-stage proposal transaction: source inputs, graphics and completion receipts stay immutable.
 * Strict publication still belongs to the existing worker. Non-dominated rejected artifacts are diagnostics only.
 * @param {Dependencies} dependencies */
function createParagraphTypographyRefiner(dependencies){
 if(!record(dependencies)||[dependencies.validateDeck,dependencies.auditComponents,dependencies.auditSemantic].some(fn=>typeof fn!=="function")
  ||dependencies.recordSearch!==undefined&&typeof dependencies.recordSearch!=="function")
  throw new TypeError("Invalid typography dependencies");
 return async (/** @type {unknown} */request)=>{
  if(!record(request)||typeof request.root!=="string"||!path.isAbsolute(request.root)||typeof request.deckFile!=="string"
   ||typeof request.pptxFile!=="string"||typeof request.buildCandidate!=="function"||typeof request.verifyCandidate!=="function"
   ||typeof request.isCancellationRequested!=="function")throw new TypeError("Invalid typography reconstruction request");
  const root=fs.realpathSync(request.root);if(fs.lstatSync(request.root).isSymbolicLink())throw new TypeError("Invalid typography workspace");
  const deck=parseTypographyDeck(request.deck),initial=quality(request.initialQuality);
  ownedFile(root,request.deckFile,true);ownedFile(root,request.pptxFile,true);dependencies.validateDeck(deck,root);
  const cancelled=/** @type {()=>unknown|Promise<unknown>} */(request.isCancellationRequested);
  async function active(){const value=await cancelled();if(typeof value!=="boolean")throw new TypeError("Invalid typography cancellation");if(value)throw new Error("editable job was cancelled");}
  const build=/** @type {(input:{deckFile:string,pptxFile:string})=>Promise<unknown>} */(request.buildCandidate);
  const verify=/** @type {(input:{deck:Deck,pptxFile:string})=>Promise<unknown>} */(request.verifyCandidate);
  await active();const originalAudit=auditTypographyLayout(deck);
  const baselineComponents=dependencies.auditComponents(deck),baselineSemantic=dependencies.auditSemantic(deck);
  const controller=createReconstructionSearchControl({baseline:metrics(initial,originalAudit),baselineHash:digest(deck),
   hardFailures:0,
   families:["paragraph-flow","shared-style","container-flow","measured-size","font-family"],maximumCandidates:12,patience:3});
  /** @type {Artifact} */let best={deck,deckFile:request.deckFile,pptxFile:request.pptxFile,quality:initial};
  let bestMetrics=metrics(initial,originalAudit),accepted=false;
  /** @type {Map<string,Artifact>} */const artifacts=new Map();/** @type {string[]} */const created=[];
  /** @type {Record<string,unknown>[]} */const observations=[];
  /** @type {Deck|null} */let feedbackDeck=null;
  try{
   for(const family of ["paragraph-flow","shared-style","container-flow","measured-size","font-family"]){
    const variants=family==="font-family"?["Microsoft YaHei","DengXian","Arial"]:[undefined];
    for(const font of variants){
     await active();const proposal=proposeParagraphTypography(deck,{merge:family!=="shared-style",...(font?{family:font}:{})});
     if(family==='measured-size'&&!feedbackDeck)continue;
     /** @type {Deck} */const candidate=family==='measured-size'&&feedbackDeck?feedbackDeck:family==="container-flow"?proposeContainerParagraphLayout(proposal.deck).deck:proposal.deck;
     const id=digest(candidate),audit=auditTypographyLayout(candidate);
     const prepared=controller.prepare({family,hash:id});if(!prepared.render)continue;
     const components=dependencies.auditComponents(candidate),semantic=dependencies.auditSemantic(candidate);
     const hardFailures=Number(structuralRegression(baselineComponents,components))+Number(structuralRegression(baselineSemantic,semantic));
     if(!audit.passed||hardFailures){controller.complete({hash:id,metrics:{...metrics(initial,audit)},hardFailures:hardFailures+Number(!audit.passed),strictPassed:false});continue;}
     assertTypographyContent(deck,candidate);dependencies.validateDeck(candidate,root);
     const token=crypto.randomUUID(),deckFile=path.join(root,`paragraph-${token}.json`),pptxFile=path.join(root,`paragraph-${token}.pptx`);
     fs.writeFileSync(deckFile,JSON.stringify(candidate),{flag:"wx"});created.push(deckFile);
     fs.closeSync(fs.openSync(pptxFile,"wx"));created.push(pptxFile);
     await build({deckFile,pptxFile});await active();ownedFile(root,pptxFile,true);
     const rendered=quality(await verify({deck:candidate,pptxFile}));await active();
     if(family==='paragraph-flow'&&rendered.typographyEvidence?.measurements!==undefined)
      feedbackDeck=fitParagraphRenderFeedback(candidate,rendered.typographyEvidence).deck;
     const measured=metrics(rendered,audit),artifact={deck:candidate,deckFile,pptxFile,quality:rendered};
     // Adoption cannot trade a readability win for a visual or regional regression.
     const regional=Object.keys(initial.metrics).filter(k=>/^(?:component-regions-attention|worst-component-)/u.test(k));
     const regionSafe=regional.every(k=>typeof rendered.metrics[k]==="number"&&Number(rendered.metrics[k])<=Number(initial.metrics[k]));
     const renderSafe=rendered.checks.every(c=>c.name==="visual-fidelity"||c.passed)&&rendered.typographyEvidence?.passed!==false;
     observations.push({hash:id,family,regionalPassed:regionSafe,renderPassed:renderSafe,
      ...(rendered.typographyEvidence?{text:Object.fromEntries(['paragraphs','missing','overflow','collisions','order','unverified','ambiguous'].map(k=>[k,rendered.typographyEvidence?.[k]]))}:{})});
     const decision=controller.complete({hash:id,metrics:measured,hardFailures:Number(!regionSafe)+Number(!renderSafe),strictPassed:components.passed&&semantic.passed&&regionSafe&&renderSafe&&rendered.passed});
     artifacts.set(id,artifact);
     const visualSafe=measured.pdr<=bestMetrics.pdr&&measured.missing<=bestMetrics.missing&&measured.mad<=bestMetrics.mad;
     if(regionSafe&&renderSafe&&visualSafe&&(dominates(measured,bestMetrics)||!accepted&&proposal.report.mergedLines>0)){
      best=artifact;bestMetrics=measured;accepted=true;
     }
     if(decision.action.startsWith("stop-"))break;
    }
    const status=controller.finishFamily(family);if(status.action.startsWith("stop-"))break;
   }
   const snapshot=controller.snapshot();dependencies.recordSearch?.(snapshot);
   const retained=new Set(snapshot.frontier.map(c=>c.hash));
   for(const [id,artifact] of artifacts)if(!retained.has(id)&&artifact!==best){for(const file of [artifact.deckFile,artifact.pptxFile]){
    ownedFile(root,file,false);fs.unlinkSync(file);created.splice(created.indexOf(file),1);
   }}
   const searchFile=path.join(root,`typography-search-${crypto.randomUUID()}.json`);
   fs.writeFileSync(searchFile,JSON.stringify({...snapshot,observations}),{flag:"wx"});
   return {...best,accepted,search:snapshot,searchFile,observations,deliveryState:snapshot.publicationPassed?'strict-passed':accepted?'refined-unpassed':'no-safe-candidate',
    diagnostics:[...artifacts].filter(([id])=>retained.has(id)).map(([id,a])=>({hash:id,deckFile:a.deckFile,pptxFile:a.pptxFile,publishable:false}))};
  }catch(error){const failures=[error];for(const file of created){try{ownedFile(root,file,false);if(fs.existsSync(file))fs.unlinkSync(file);}catch(cleanupError){failures.push(cleanupError);}}
   if(failures.length>1)throw new AggregateError(failures,"Typography reconstruction and cleanup failed",{cause:error});throw error;}
 };
}
module.exports={createParagraphTypographyRefiner,structuralRegression};
