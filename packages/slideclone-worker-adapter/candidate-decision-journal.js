// @ts-check
"use strict";
const fs=require("node:fs"), path=require("node:path"), crypto=require("node:crypto");
const {types}=require("node:util");
const LIMIT=256;
const REASONS=new Set(["native-deck-missing","quality-not-rendered","global-visual-regression","optional-visual-regression","large-raster-regression","native-component-regression","native-text-not-improved","ocr-recovery-not-improved","pixel-diff-not-improved","ocr-recovery-policy","visual-fidelity","visual-regressed","large-raster","native-component-quality","semantic-editability"]);
const FIELDS=["pixel-diff-ratio","foreground-missing-ratio","mean-absolute-delta","component-regions-attention","worst-component-normalized-severity"];
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value!==null && typeof value==="object" && !types.isProxy(value) && !Array.isArray(value)
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property); }
/** @param {unknown} quality */
function metrics(quality) {
  if(!record(quality)||!record(quality.metrics)) return null;
  const values=quality.metrics;
  return FIELDS.map((name,index)=>{
    const value=values[name], maximum=index<2?1:index===2?255:index===3?30000:10;
    return typeof value==="number" && Number.isFinite(value) && value>=0 && value<=maximum ? value : null;
  });
}
/** Bounded evidence contains numeric metrics and artifact hashes only.
 * @param {string} base */
function createCandidateDecisionJournal(base) {
  const canonical=fs.realpathSync(base);
  /** @type {WeakMap<object,number>} */ const identities=new WeakMap();
  /** @type {Array<Record<string,unknown>>} */ const renders=[];
  /** @type {Array<Record<string,unknown>>} */ const decisions=[];
  /** @type {Array<Record<string,unknown>>} */ const searches=[];
  /** @type {string|null} */ let root=null;
  let dropped=0;
  function write() {
    if(!root) return;
    if(fs.realpathSync(root)!==root) throw new Error("candidate decision root changed");
    const destination=path.join(root,"candidate-decisions.json"),existing=fs.lstatSync(destination,{throwIfNoEntry:false});
    if(existing && (!existing.isFile() || existing.isSymbolicLink())) throw new TypeError("candidate decision output is invalid");
    const temporary=path.join(root,`.candidate-decisions-${crypto.randomUUID()}.json`);
    try {
      fs.writeFileSync(temporary,JSON.stringify({version:1,publishable:false,renders,decisions,searches,dropped}),{encoding:"utf8",flag:"wx"});
      if(fs.realpathSync(root)!==root) throw new Error("candidate decision root changed");
      for(let attempt=0;attempt<6;attempt++) {
        if(fs.realpathSync(root)!==root) throw new Error("candidate decision root changed");
        const current=fs.lstatSync(destination,{throwIfNoEntry:false});
        if(current && (!current.isFile() || current.isSymbolicLink())) throw new TypeError("candidate decision output is invalid");
        try { fs.renameSync(temporary,destination); break; }
        catch(error) {
          if(!(error instanceof Error) || !("code" in error)
            || (error.code!=="EPERM" && error.code!=="EBUSY") || attempt===5) throw error;
          // Windows scanners can briefly hold a just-published file. Retain
          // atomic replacement; never unlink or truncate the previous journal.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20*(attempt+1));
        }
      }
    } finally { fs.rmSync(temporary,{force:true}); }
  }
  return {
    /** Store fixed numeric evidence only; never source text, messages or paths.
     * @param {unknown} input */
    search(input) {
      if(!record(input)||typeof input.publicationPassed!=="boolean"||!Number.isSafeInteger(input.trials)||Number(input.trials)<0||Number(input.trials)>256
        ||!record(input.status)||typeof input.status.action!=="string"||!["continue","stop-passed","stop-budget","stop-stalled"].includes(input.status.action)
        ||!Array.isArray(input.frontier))throw new TypeError("Invalid search journal evidence");
      const candidates=require('../slideclone-core/typography-contract').list(input.frontier,256);
      const frontier=candidates.map(item=>{
        if(!record(item)||typeof item.hash!=="string"||!/^[a-f0-9]{64}$/u.test(item.hash)||!record(item.metrics))throw new TypeError("Invalid search journal candidate");
        const values=item.metrics;
        if(["pdr","missing","mad","layout","style"].some(k=>typeof values[k]!=="number"||!Number.isFinite(values[k])||values[k]<0||values[k]>(k==='pdr'||k==='missing'?1:k==='mad'?255:100000))
          ||['layout','style'].some(k=>!Number.isInteger(values[k])))
          throw new TypeError("Invalid search journal metric");
        return {hash:item.hash,metrics:Object.fromEntries(["pdr","missing","mad","layout","style"].map(k=>[k,values[k]]))};
      });
      if(searches.length>=32){dropped++;write();return;}
      searches.push({trials:input.trials,publicationPassed:input.publicationPassed,action:input.status.action,frontier});write();
    },
    /** @param {unknown} request @param {unknown} quality @param {number} elapsedMs */
    remember(request,quality,elapsedMs) {
      if(!record(request)||!record(quality)||!metrics(quality)) return;
      if(typeof request.root!=="string"||typeof request.pptxFile!=="string"||!path.isAbsolute(request.root)||!path.isAbsolute(request.pptxFile)
        || !Number.isFinite(elapsedMs)||elapsedMs<0) throw new TypeError("candidate render decision is invalid");
      const directory=fs.realpathSync(request.root), relative=path.relative(canonical,directory);
      const file=fs.realpathSync(request.pptxFile), fileRelative=path.relative(directory,file);
      if(!relative||relative.startsWith("..")||path.isAbsolute(relative)||!fileRelative||fileRelative.startsWith("..")||path.isAbsolute(fileRelative)
        || fs.lstatSync(request.pptxFile).isSymbolicLink()) throw new TypeError("candidate decision artifact is outside its workspace");
      if(root===null) root=directory;
      if(renders.length>=LIMIT) {dropped++;write();return;}
      const id=renders.length+1, size=fs.statSync(file).size;
      if(size<1||size>256*1024*1024) throw new RangeError("candidate decision artifact exceeds its budget");
      identities.set(quality,id);
      const digest=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      renders.push({id,sha256:digest,metrics:metrics(quality),elapsedMs,cacheHit:record(quality.metrics)&&quality.metrics["quality-verification-cache-hit"]===1});
      write();
    },
    /** @param {unknown} input */
    decide(input) {
      if(!record(input)||typeof input.accepted!=="boolean"||typeof input.sharedRegression!=="number"||Number.isNaN(input.sharedRegression)
        || input.sharedRegression<0) throw new TypeError("candidate policy decision is invalid");
      const policy=input.policy??"final-refinement";
      if(policy!=="final-refinement" && policy!=="ocr-recovery" && policy!=="strict-native") throw new TypeError("candidate policy name is invalid");
      if(input.policyReasons!==undefined && (!Array.isArray(input.policyReasons)||types.isProxy(input.policyReasons)
        || input.policyReasons.length>REASONS.size || Reflect.ownKeys(input.policyReasons).length!==input.policyReasons.length+1
        || Object.values(Object.getOwnPropertyDescriptors(input.policyReasons)).some(property=>!("value" in property))
        || input.policyReasons.some(reason=>typeof reason!=="string"||!REASONS.has(reason)))) throw new TypeError("candidate policy reasons are invalid");
      const before=metrics(input.baselineQuality), after=metrics(input.candidateQuality);
      if(!before||!after) return;
      if(decisions.length>=LIMIT) {dropped++;write();return;}
      const globalRegression=before.slice(0,3).some((value,index)=>value===null||after[index]===null||/** @type {number} */(after[index])>value+1e-9);
      const componentRegression=input.sharedRegression>0.08;
      const reasons=input.accepted?[]:input.policyReasons??[...(globalRegression?["global-visual-regression"]:[]),...(componentRegression?["shared-component-regression"]:[]),...(!globalRegression&&!componentRegression?["quality-policy"]:[])];
      decisions.push({policy,baselineId:record(input.baselineQuality)?identities.get(input.baselineQuality)??0:0,
        candidateId:record(input.candidateQuality)?identities.get(input.candidateQuality)??0:0,
        accepted:input.accepted,reasons,before,after,sharedRegression:Number.isFinite(input.sharedRegression)?input.sharedRegression:null});
      write();
    }
  };
}
module.exports={createCandidateDecisionJournal};
