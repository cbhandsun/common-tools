// @ts-check
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {record,list,jsonSnapshot,numeric}=require("../slideclone-core/typography/typography-contract");
const {parseRenderedTypographyAudit}=require("../slideclone-core/typography/rendered-typography-audit");
const {createReconstructionSearchControl}=require("../slideclone-core/archetypes/reconstruction-search-control");
/** @typedef {{deck:Record<string,unknown>,changedTextBoxes:number,parameters:Record<string,unknown>}} Proposal */
/** @typedef {ReturnType<typeof createReconstructionSearchControl>} Control */
/** @typedef {{accepted:true,changedTextBoxes:number,candidateTextBoxes:number,deck:Record<string,unknown>,deckFile:string,pptxFile:string,quality:Record<string,unknown>}} Artifact */
const FAMILIES=["font-family","text-scale","text-nudge"];
const FONT_FIELDS=["family","latinFamily","eastAsianFamily","complexScriptFamily"];
/** @param {unknown} value */
function fontName(value){
 if(typeof value!=='string'||!value.trim()||value.length>256||/[;{}<>"'\\]/u.test(value)
  ||[...value].some(c=>{const code=c.codePointAt(0)??0;return code<32||code===127;}))throw new TypeError("Invalid legacy font family");
 return value;
}
/** Font proposals must change the channels and run overrides that the writer actually uses.
 * @param {unknown} input @param {string} family */
function textFontFamilyMatches(input,family){
 const text=jsonSnapshot(input);if(!record(text)||!record(text.font))throw new TypeError("Invalid legacy font text");
 const target=fontName(family).toLowerCase();
 const matches=(/** @type {Record<string,unknown>} */ font)=>FONT_FIELDS.every(key=>font[key]===undefined
  ||typeof font[key]==='string'&&font[key].toLowerCase()===target);
 if(typeof text.font.family!=='string'||text.font.family.toLowerCase()!==target||!matches(text.font))return false;
 for(const key of ['runs','positionedRuns'])if(text[key]!==undefined)for(const row of list(text[key],512)){
  if(!record(row))throw new TypeError("Invalid legacy font run");
  const override=key==='runs'?row.font:row.fontOverride;
  if(override!==undefined&&(!record(override)||!matches(override)))return false;
 }return true;
}
/** @param {unknown} input @param {string} family */
function replaceTextFontFamily(input,family){
 fontName(family);
 const text=jsonSnapshot(input);if(!record(text)||!record(text.font))throw new TypeError("Invalid legacy font text");
 const fields=Object.fromEntries(FONT_FIELDS.map(key=>[key,family]));text.font={...text.font,...fields};
 for(const key of ['runs','positionedRuns'])if(text[key]!==undefined)text[key]=list(text[key],512).map(row=>{
  if(!record(row))throw new TypeError("Invalid legacy font run");const field=key==='runs'?'font':'fontOverride';
  if(row[field]!==undefined&&!record(row[field]))throw new TypeError("Invalid legacy font override");
  return {...row,[field]:{...(record(row[field])?row[field]:{}),...fields}};
 });return text;
}
/** @param {unknown} input */
function digest(input){return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");}
/** Ignore diagnostics that do not affect rendered output. Keep the object tree and grouping.
 * @param {Record<string,unknown>} deck @param {boolean} evidence */
function identity(deck,evidence){
 const pages=list(deck.pages,50).map(page=>{
  if(!record(page))throw new TypeError("Invalid text search page");
  const texts=list(page.textBoxes,10000).map(text=>{
   if(!record(text))throw new TypeError("Invalid text search text");
   const source=record(text.source)?text.source:{};
   if(evidence){const {finalEditableTextFontFamilyFit:fontFit,finalWorstTextScaleFit:scaleFit,finalWorstTextBoxNudgeFit:nudgeFit,...observation}=source;
    void fontFit;void scaleFit;void nudgeFit;return {id:text.id,text:text.text,source:observation};}
   const {source:ignored,...rendered}=text;void ignored;return rendered;
  });
  return {textBoxes:texts,shapes:page.shapes,images:page.images,groups:page.groups,groupNodes:page.groupNodes};
 });return digest({slideSize:deck.slideSize,pages});
}
/** @param {unknown} raw */
function qualityEvidence(raw){
 const q=jsonSnapshot(raw);if(!record(q)||!record(q.metrics)||!Array.isArray(q.checks))return null;
 if(q.passed!==undefined&&typeof q.passed!=="boolean")return null;
 const checks=list(q.checks,256);if(checks.some(c=>!record(c)||typeof c.name!=="string"||typeof c.passed!=="boolean")
  ||!checks.some(c=>record(c)&&c.name==="quality-rendered"&&c.passed))return null;
 const m=q.metrics;
 if(!["pixel-diff-ratio","foreground-missing-ratio","mean-absolute-delta"].every((key,i)=>
  typeof m[key]==="number"&&Number.isFinite(m[key])&&Number(m[key])>=0&&Number(m[key])<=([1,1,255][i]??0)))return null;
 const typography=q.typographyEvidence===undefined?null:parseRenderedTypographyAudit(q.typographyEvidence);
 const hardFailed=checks.some(c=>record(c)&&c.name!=="visual-fidelity"&&!c.passed)||typography?.passed===false;
 if(q.passed&&(hardFailed||checks.some(c=>record(c)&&!c.passed)))return null;
 return {quality:q,hardFailed,metrics:{pdr:Number(m["pixel-diff-ratio"]),missing:Number(m["foreground-missing-ratio"]),
  mad:Number(m["mean-absolute-delta"]),layout:0,style:0}};
}
/** @param {string} root @param {string} file @param {boolean} required */
function artifactFile(root,file,required){
 const info=fs.lstatSync(file,{throwIfNoEntry:false});if(!info&&!required)return false;
 if(path.dirname(file)!==root||!info||!info.isFile()||info.isSymbolicLink()||fs.realpathSync(file)!==file
  ||required&&(info.size<1||info.size>256*1024*1024))throw new TypeError("Invalid text search artifact");return true;
}
/** A shared record spans re-entries into legacy font, scale and nudge stages.
 * It controls search only; the worker retains sole authority for publication.
 * @param {{recordSearch?:(report:unknown)=>void,fontFamilies?:string[]}} [options] */
function createLegacyTextSearch(options={}){
 if(!record(options)||options.recordSearch!==undefined&&typeof options.recordSearch!=="function")throw new TypeError("Invalid text search recorder");
 const fonts=list(options.fontFamilies===undefined?["Arial"]:options.fontFamilies,16).map(fontName);
 if(!fonts.length||new Set(fonts).size!==fonts.length)throw new TypeError("Invalid text search fonts");
 const fontDomains=new Map(fonts.map(font=>[font,`font-family-${digest(font).slice(0,16)}`]));
 const families=[...fontDomains.values(),"text-scale","text-nudge"];
 /** @type {WeakMap<object,{root:string,revision:string,control:Control}>} */const sessions=new WeakMap();
 return async (/** @type {unknown} */input)=>{
  if(!record(input)||!record(input.metadata)||!record(input.metadata.generatedDeck)||typeof input.family!=="string"||!FAMILIES.includes(input.family)
   ||typeof input.root!=="string"||typeof input.runBuild!=="function"||typeof input.verify!=="function"||typeof input.cancelled!=="function"
   ||typeof input.acceptQuality!=="function")throw new TypeError("Invalid legacy text search request");
  const family=input.family,metadata=input.metadata,deck=jsonSnapshot(metadata.generatedDeck);
  const proposals=list(input.proposals,256),candidateTextBoxes=numeric(input.candidateTextBoxes,0,10000);
  if(!Number.isInteger(candidateTextBoxes))throw new TypeError("Invalid text search count");
  const empty={accepted:false,changedTextBoxes:candidateTextBoxes,candidateTextBoxes};
  if(!proposals.length)return empty;
  const sources=list(input.sourceImages,50).map(file=>{if(typeof file!=="string"||!path.isAbsolute(file))throw new TypeError("Invalid text search source");return file;});
  const baseline=qualityEvidence(input.visualQuality);if(!baseline)return empty;
  if(!record(deck))throw new TypeError("Invalid text search deck");
  const cancel=/** @type {()=>Promise<unknown>} */(input.cancelled);
  async function active(){const value=await cancel();if(typeof value!=="boolean")throw new TypeError("Invalid text search cancellation");if(value)throw new Error("editable job was cancelled");}
  await active();
  if(!path.isAbsolute(input.root)||fs.lstatSync(input.root).isSymbolicLink())throw new TypeError("Invalid text search root");
  const root=fs.realpathSync(input.root);if(!fs.statSync(root).isDirectory())throw new TypeError("Invalid text search root");
  const revision=identity(deck,true);let session=sessions.get(metadata);
  if(!session||session.root!==root||session.revision!==revision){session={root,revision,control:createReconstructionSearchControl({
   baseline:baseline.metrics,baselineHash:identity(deck,false),hardFailures:Number(baseline.hardFailed),families,maximumCandidates:64,patience:3})};sessions.set(metadata,session);}
  const control=session.control;
  const build=/** @type {(request:{deckFile:string,pptxFile:string})=>Promise<unknown>} */(input.runBuild);
  const verify=/** @type {(request:Record<string,unknown>)=>Promise<unknown>} */(input.verify);
  const accept=/** @type {(before:unknown,after:unknown)=>unknown} */(input.acceptQuality);
  /** @type {Artifact|null} */let best=null;
  /** @type {Set<string>} */const owned=new Set();
  /** @param {string} file */
  function remove(file){if(!owned.has(file))throw new Error("Unowned text search cleanup");if(artifactFile(root,file,false))fs.unlinkSync(file);owned.delete(file);}
  try{
   for(const raw of proposals){await active();const proposal=jsonSnapshot(raw);
    if(!record(proposal)||!record(proposal.deck)||!record(proposal.parameters))throw new TypeError("Invalid text search proposal");
    const changed=numeric(proposal.changedTextBoxes,0,10000);if(!Number.isInteger(changed))throw new TypeError("Invalid text search proposal count");
    if(!changed)continue;
    const parameter=family==='font-family'?'fontFamily':family==='text-scale'?'targetScale':'deltaYPt';
    if(Object.keys(proposal.parameters).length!==1||!(parameter in proposal.parameters))throw new TypeError("Invalid text search parameter");
    if(parameter!=='fontFamily')numeric(proposal.parameters[parameter],parameter==='targetScale'?.92:-1.2,parameter==='targetScale'?1.1:1.2);
    if(identity(proposal.deck,true)!==revision)throw new TypeError("Text search proposal changed source or graphics");
    const domain=family==='font-family'?fontDomains.get(String(proposal.parameters.fontFamily)):family;
    if(!domain)throw new TypeError("Unknown text search font");
    const hash=identity(proposal.deck,false),prepared=control.prepare({family:domain,hash});
    if(!prepared.render){if(prepared.action.startsWith("stop-"))break;continue;}
    const token=crypto.randomUUID(),deckFile=path.join(root,`legacy-${family}-${token}.json`),pptxFile=path.join(root,`legacy-${family}-${token}.pptx`);
    fs.writeFileSync(deckFile,JSON.stringify(proposal.deck),{flag:"wx"});owned.add(deckFile);
    fs.closeSync(fs.openSync(pptxFile,"wx"));owned.add(pptxFile);
    await build({deckFile,pptxFile});await active();artifactFile(root,pptxFile,true);
    const observed=await verify({root,pptxFile,sourceImages:sources,deck:proposal.deck,referenceQuality:input.visualQuality,isCancellationRequested:cancel});await active();
    const evidence=qualityEvidence(observed);
    const accepted=evidence&&!evidence.hardFailed?accept(input.visualQuality,observed):false;
    if(typeof accepted!=="boolean")throw new TypeError("Invalid text search acceptance");
    const improvesBest=accepted&&(best===null||accept(best.quality,observed));
    if(typeof improvesBest!=="boolean")throw new TypeError("Invalid text search comparison");
    const decision=control.complete({hash,metrics:evidence?.metrics??baseline.metrics,hardFailures:Number(!accepted),strictPassed:false});
    if(accepted&&improvesBest&&evidence){if(best){remove(best.deckFile);remove(best.pptxFile);}
     best={...proposal.parameters,accepted:true,changedTextBoxes:changed,candidateTextBoxes,deck:proposal.deck,deckFile,pptxFile,quality:evidence.quality};
    }else{remove(deckFile);remove(pptxFile);}
    if(decision.action.startsWith("stop-"))break;
   }
   for(const domain of family==='font-family'?fontDomains.values():[family])control.finishFamily(domain);
   const search=control.snapshot();options.recordSearch?.(search);
   return {...(best??empty),search};
  }catch(error){sessions.delete(metadata);const failures=[error];
   for(const file of [...owned])try{remove(file);}catch(cleanupError){failures.push(cleanupError);}
   if(failures.length>1)throw new AggregateError(failures,"Text search and cleanup failed",{cause:error});throw error;}
 };
}
module.exports={createLegacyTextSearch,textFontFamilyMatches,replaceTextFontFamily};
