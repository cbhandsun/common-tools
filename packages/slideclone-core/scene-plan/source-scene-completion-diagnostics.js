// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {sceneObligationCoverage}=require('./source-scene-obligation-coverage');
const {pendingSceneProgramObligations}=require('./source-scene-program-obligations');
const {sceneObjectBatches}=require('./source-scene-object-batches');
const {parseFrameFailureWitness}=require('./source-scene-frame-diagnostics');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {Parameters<typeof sceneObligationCoverage>[1]} Actual */
/** @typedef {{path:string,code:string,witness?:import('./source-scene-frame-diagnostics').FrameFailureWitness}} SourceCheck */
/** @typedef {{kind:string,memberId?:string,inventory?:string,sourceChecks:SourceCheck[]}} Blocker */
const sourceCodes=new Set(['patterned-rail-gap','patterned-corner-unproven','patterned-corner-ambiguous',
 'patterned-rail-evidence','patterned-frame-unproven','patterned-source-text','patterned-source-scan-budget',
 'patterned-geometry-budget','patterned-path-parts','patterned-enclosure-geometry','patterned-exterior-unstable']);
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** Fixed diagnostic codes only. Unknown scanner details remain unclassified;
 * neither provider text nor arbitrary exception messages enter this summary.
 * @param {unknown[]} failures @param {string} memberId */
function sourceChecks(failures,memberId){
 /** @type {SourceCheck[]} */const checks=[];
 for(const raw of failures){
  if(!record(raw)||raw.id!==memberId)continue;
  const alternatives=raw.alternativeFailures??[];
  if(!list(alternatives)||alternatives.length>32||alternatives.some(row=>!record(row)))
   throw new TypeError('Scene completion diagnostic source checks are invalid');
  for(const row of alternatives){
   if(!record(row))throw new TypeError('Scene completion diagnostic source checks are invalid');
   const path=row.path==='outline'||row.path==='fill'?row.path:'unspecified';
   const code=typeof row.code==='string'&&sourceCodes.has(row.code)?row.code:'unclassified';
   const witness=code==='patterned-rail-gap'||code==='patterned-corner-unproven'?parseFrameFailureWitness(row.witness):undefined;
   if(witness&&(code==='patterned-rail-gap')!==(witness.kind==='rail-gap'))throw new TypeError('Scene frame diagnostic is invalid');
   const check={path,code,...(witness?{witness}:{})};
   if(!checks.some(c=>JSON.stringify(c)===JSON.stringify(check)))checks.push(check);
  }
  if(typeof raw.detailCode==='string'&&sourceCodes.has(raw.detailCode)
   &&!checks.some(c=>c.code===raw.detailCode))checks.push({path:'unspecified',code:raw.detailCode});
 }
 return checks;
}
/** Report the current compiler's blocking members separately from editing and
 * visual acceptance. No completion rule, source proof, output receipt or
 * historical obligation is changed by this diagnostic. In particular, a
 * surviving admitted program cannot hide a missing original dependency.
 * @param {Plan} plan @param {Actual} actual @param {unknown} rejected @param {unknown} unresolved */
function sceneRegionCompletionDiagnostics(plan,actual,rejected,unresolved){
 const coverage=sceneObligationCoverage(plan,actual);
 if(!list(rejected)||rejected.length>48||rejected.some(row=>!record(row)||!identity(row.regionId)
  ||!plan.regions.some(r=>r.id===row.regionId)||!list(row.missing)||row.missing.length>1024
  ||row.missing.some(value=>typeof value!=='string'||value.length>128))
  ||!list(unresolved)||unresolved.length>1024||unresolved.some(row=>!record(row)||!identity(row.id)))
  throw new TypeError('Scene completion diagnostics are invalid');
 const pending=pendingSceneProgramObligations(plan);
 const aliases=pending.length?sceneObjectBatches(plan)?.aliases??[]:[];
 const regions=plan.regions.flatMap(region=>{
  /** @type {Blocker[]} */const blockers=[];
  const add=(/** @type {Blocker} */blocker)=>{
   if(!blockers.some(b=>JSON.stringify(b)===JSON.stringify(blocker)))blockers.push(blocker);
  };
  for(const row of rejected){
   if(!record(row)||row.regionId!==region.id||!list(row.missing))continue;
   for(const missing of row.missing){
    const object=plan.objects.find(o=>o.id===missing),relation=plan.relations.find(r=>r.id===missing),member=object??relation;
    const pictorial=typeof missing==='string'&&missing.endsWith(':pictorial')
     ?plan.objects.find(o=>o.id===missing.slice(0,-10)):undefined;
    if(missing===region.id&&['card','container'].includes(region.kind))
     add({kind:'owner-surface-not-materialized',memberId:region.id,sourceChecks:sourceChecks(unresolved,region.id)});
    else if(member)add({kind:object?'object-not-materialized':'relation-not-materialized',
     memberId:member.id,sourceChecks:sourceChecks(unresolved,member.id)});
    else if(pictorial)add({kind:'pictorial-content-not-materialized',memberId:pictorial.id,sourceChecks:[]});
    else if(missing==='observed-containers'||missing==='observed-icons'||missing==='observed-relations')
     add({kind:'observed-inventory-mismatch',inventory:missing.slice(9),sourceChecks:[]});
    else if(missing==='source-label-binding'||missing==='final-label-binding')add({kind:'label-binding',sourceChecks:[]});
    else if(missing==='region-program')add({kind:'region-program-missing',sourceChecks:[]});
    else add({kind:'unclassified',sourceChecks:[]});
   }
  }
  const tasks=pending.filter(task=>task.program.regionId===region.id);
  const missingObjects=[...new Set(tasks.flatMap(task=>task.program.objects.filter(id=>
   !plan.objects.some(o=>o.id===(aliases.find(a=>a.id===id)?.canonicalId??id)))))];
  const missingRelations=[...new Set(tasks.flatMap(task=>task.program.relations.filter(id=>!plan.relations.some(r=>r.id===id))))];
  return blockers.length||missingObjects.length||missingRelations.length?[{regionId:region.id,blockers,
   pendingDependencies:{objects:missingObjects,relations:missingRelations}}]:[];
 });
 return {coverage,diagnostics:{version:1,basis:'compiler-region-completion-only',
  editingVerification:'not-assessed',visualVerification:'not-assessed',regions}};
}
module.exports={sceneRegionCompletionDiagnostics};
