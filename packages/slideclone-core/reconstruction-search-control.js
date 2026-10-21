// @ts-check
"use strict";
const {record,numeric,identity,list}=require("./typography-contract");
/** @typedef {{pdr:number,missing:number,mad:number,layout:number,style:number}} Metrics */
/** @typedef {{hash:string,family:string,metrics:Metrics,hardFailures:number}} Candidate */
/** @param {unknown} v @returns {Metrics} */
function metrics(v){if(!record(v))throw new TypeError("Invalid search metrics");return {
  pdr:numeric(v.pdr,0,1),missing:numeric(v.missing,0,1),mad:numeric(v.mad,0,255),
  layout:numeric(v.layout,0,100000),style:numeric(v.style,0,100000)};}
/** @param {unknown} v */
function hash(v){if(typeof v!=="string"||!/^[a-f0-9]{64}$/u.test(v))throw new TypeError("Invalid search identity");return v;}
/** @param {Metrics} a @param {Metrics} b */
function dominates(a,b){return Object.keys(a).every(k=>a[/** @type {keyof Metrics} */(k)]<=b[/** @type {keyof Metrics} */(k)])
 &&Object.keys(a).some(k=>a[/** @type {keyof Metrics} */(k)]<b[/** @type {keyof Metrics} */(k)]);}
/** Search termination is independent of publication. Only numeric evidence and hashes are retained.
 * Defaults are initial engineering policy, not an industry quality standard.
 * @param {unknown} input */
function createReconstructionSearchControl(input){
 if(!record(input))throw new TypeError("Invalid search policy");
 const families=list(input.families,32).map(identity);if(!families.length||new Set(families).size!==families.length)throw new TypeError("Invalid search families");
 const patience=numeric(input.patience??3,1,32),limit=numeric(input.maximumCandidates??64,1,256);
 if(!Number.isInteger(patience)||!Number.isInteger(limit))throw new TypeError("Invalid search limits");
 const delta=metrics(input.minimumGain??{pdr:.001,missing:.001,mad:.1,layout:1,style:1});
 if(Object.values(delta).some(v=>v<=0))throw new TypeError("Invalid search gain policy");
 const baseline=metrics(input.baseline),baselineHash=hash(input.baselineHash);
 const failures=numeric(input.hardFailures??0,0,100000);if(!Number.isInteger(failures))throw new TypeError("Invalid search failure count");
 const states=new Map(families.map(f=>[f,{stale:0,trials:0,finished:false}]));
 const seen=new Set([baselineHash]);/** @type {Map<string,string>} */const pending=new Map();
 /** @type {Candidate[]} */let frontier=[{hash:baselineHash,family:"baseline",metrics:baseline,hardFailures:failures}];
 /** @type {Metrics[]} */let anchors=failures===0?[baseline]:[];
 /** @type {Record<string,unknown>[]} */const events=[];
 let trials=0,passed=false;
 /** @param {string} reason */
 function status(reason){return {action:passed?"stop-passed":trials>=limit?"stop-budget":families.every(f=>states.get(f)?.finished)?"stop-stalled":"continue",reason};}
 return {
  /** @param {unknown} request */
  prepare(request){
   if(!record(request))throw new TypeError("Invalid search proposal");
   const id=hash(request.hash),family=identity(request.family),state=states.get(family);
   if(!state)throw new TypeError("Unknown search family");
   const current=status("search-active");if(current.action!=="continue")return {...current,render:false};
   if(trials+pending.size>=limit)return {action:"stop-budget",reason:"candidate-capacity",render:false};
   if(seen.has(id))return {action:"skip",reason:"duplicate-output",render:false};
   if(state.finished)return {action:"switch-family",reason:"family-stalled",render:false};
   if(request.maximumPdrGain!==undefined){
    const potential=numeric(request.maximumPdrGain,0,1);
    if(request.influenceBoundVerified!==true)throw new TypeError("Unverified search influence bound");
    const best=Math.min(...frontier.filter(c=>c.hardFailures===0).map(c=>c.metrics.pdr));
    if(Number.isFinite(best)&&best-potential>.08){state.finished=true;return {action:"switch-family",reason:"insufficient-region-coverage",render:false};}
   }
   seen.add(id);pending.set(id,family);return {action:"render",reason:"distinct-proposal",render:true};
  },
  /** @param {unknown} request */
  complete(request){
   if(!record(request))throw new TypeError("Invalid search observation");
   const id=hash(request.hash),family=pending.get(id),state=family?states.get(family):undefined;
   if(!family||!state)throw new TypeError("Search observation was not prepared");
   const after=metrics(request.metrics),hardFailures=numeric(request.hardFailures,0,100000);
   if(!Number.isInteger(hardFailures))throw new TypeError("Invalid search failure count");
   if(typeof request.strictPassed!=="boolean" || request.strictPassed&&(hardFailures>0||after.pdr>.08||after.missing>.12||after.mad>12||after.layout>0||after.style>0))
    throw new TypeError("Contradictory search success");
   pending.delete(id);trials++;state.trials++;
   const eligible=hardFailures===0;
   const improvement=eligible && (!anchors.length || anchors.some(c=>dominates(after,c)
    &&Object.keys(after).some(k=>c[/** @type {keyof Metrics} */(k)]-after[/** @type {keyof Metrics} */(k)]>=delta[/** @type {keyof Metrics} */(k)])));
   if(improvement){anchors=anchors.filter(c=>!dominates(after,c));anchors.push(after);}
   if(eligible&&!frontier.some(c=>c.hardFailures===0&&(dominates(c.metrics,after)||JSON.stringify(c.metrics)===JSON.stringify(after)))){
    frontier=frontier.filter(c=>c.hardFailures===0&&!dominates(after,c.metrics));frontier.push({hash:id,family,metrics:after,hardFailures});
   }
   state.stale=improvement?0:state.stale+1;if(state.stale>=patience)state.finished=true;
   passed=request.strictPassed;
   const reason=!eligible?"hard-check-failed":improvement?"meaningful-gain":state.finished?"family-stalled":"below-minimum-gain";
   events.push({hash:id,family,metrics:after,hardFailures,improvement,reason});
   const result=status(reason);return result.action==="continue"&&state.finished?{action:"switch-family",reason}:result;
  },
  /** @param {unknown} family */
  finishFamily(family){const id=identity(family),state=states.get(id);if(!state)throw new TypeError("Unknown search family");state.finished=true;return status("family-exhausted");},
  snapshot(){return structuredClone({version:1,publicationPassed:passed,trials,status:status("snapshot"),frontier,events,
   policy:{patience,maximumCandidates:limit,minimumGain:delta},families:families.map(f=>({family:f,...states.get(f)}))});}
 };
}
module.exports={createReconstructionSearchControl,dominates};
