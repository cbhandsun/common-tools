// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {sceneObjectLimit,sceneObjectBatches}=require('./source-scene-object-batches');
const {sceneRelationBatches}=require('./source-scene-relation-batches');
const {sceneAdmissionHistory}=require('./source-scene-admission-history');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-region-program').RegionProgram} RegionProgram */
/** @typedef {{index:number,program:RegionProgram}} RegionProgramObligation */
/** @typedef {RegionProgramObligation&{sourceHash:string,widthPx:number,heightPx:number}} RegionProgramResolution */
/** @param {unknown} v @returns {v is string} */
const identity=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v);
/** @param {unknown} v @returns {v is string} */
const label=v=>typeof v==='string'&&/^label-[a-f0-9]{24}$/u.test(v);
/** @param {unknown} value @param {number} maximum @returns {value is string[]} */
function members(value,maximum){return list(value)&&value.length<=maximum&&value.every(identity)&&new Set(value).size===value.length;}
/** Resolve only the existing source/owner-bound physical alias ledger. The
 * original task remains immutable; an unknown/new identity cannot stand in for
 * a missing dependency. This grants no source, paint or completion authority.
 * @param {Plan} plan @param {RegionProgram} program @returns {RegionProgram} */
function canonicalProgramDependencies(plan,program){
 const ledger=sceneObjectBatches(plan);
 const members=ledger?.batches.flatMap(batch=>batch.members)??[];
 const objects=program.objects.map(id=>{
  const alias=ledger?.aliases.find(row=>row.id===id);if(!alias)return id;
  const original=members.find(row=>row.id===id),retained=plan.objects.find(row=>row.id===alias.canonicalId);
  return original?.regionId===program.regionId&&retained?.regionId===program.regionId?alias.canonicalId:id;
 });
 const relations=program.relations.map(id=>{
  if(plan.relations.some(r=>r.id===id))return id;
  const regional=plan.relations.find(r=>r.regionId===program.regionId&&r.id.startsWith('relation-regional-'));
  return regional?regional.id:id;
 });
 return {...program,objects:[...new Set(objects)],relations:[...new Set(relations)]};
}
/** Keep rejected dependencies as tasks, never drawing/erase authority. The
 * existing parser validates owner and typography against the original OCR
 * context before any references are retained. Full admission runs on restore.
 * @param {unknown} raw @param {Plan} plan @param {unknown} sourceRefs
 * @param {(value:unknown,namespace:string)=>string} scope
 * @param {typeof import('./source-scene-region-program').parseRegionPrograms} parse
 * @returns {RegionProgram|undefined} */
function retainRegionProgramObligation(raw,plan,sourceRefs,scope,parse){
 if(!record(raw)||Object.keys(raw).some(k=>!['regionId','objects','relations','labels'].includes(k)))return undefined;
 try{
  const objectLimit=sceneObjectLimit(plan);sceneRelationBatches(plan);
  const isolated=parse([{...raw,objects:[],relations:[]}],{version:1,sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,
   regions:plan.regions,objects:[],relations:[]},sourceRefs,scope)?.[0];
  if(!isolated)return undefined;
  /** @param {unknown} value @param {string} namespace @param {number} maximum */
  const refs=(value,namespace,maximum)=>{
   if(!list(value)||value.length>maximum)throw new TypeError('Scene pending program dependencies are invalid');
   const result=value.map(v=>scope(v,namespace));
   if(!members(result,maximum))throw new TypeError('Scene pending program dependencies are invalid');return result;
  };
  return {...isolated,objects:refs(raw.objects,'object',objectLimit),relations:refs(raw.relations,'relation',plan.relationBatches?48:24)};
 }catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;return undefined;}
}
/** Read sanitized tasks without granting completion or resolving historical
 * admission failures. Reject hostile nested controls before any iteration.
 * Ambiguous owners/labels stay tasks; restore will not pick a first winner.
 * @param {Plan} plan @returns {RegionProgramObligation[]} */
function pendingSceneProgramObligations(plan){return readProgramObligations(plan,false);}
/** @param {Plan} plan @param {boolean} resolved @returns {RegionProgramObligation[]} */
function readProgramObligations(plan,resolved){
 if(!record(plan))throw new TypeError('Scene pending programs are invalid');
 const values=resolved?plan.resolvedRegionPrograms:plan.pendingRegionPrograms;
 if(values===undefined)return [];
 if(resolved&&(typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
   ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000)
  ||!list(values)||values.length>24||!list(plan.regions)||plan.regions.length>24
  ||plan.regions.some(r=>!record(r)||!identity(r.id))
  ||plan.regionPrograms!==undefined&&(!list(plan.regionPrograms)||plan.regionPrograms.length+(resolved?0:values.length)>24)
  ||!record(plan.admission)||!list(plan.admission.rejections)||plan.admission.rejections.length>256
  ||plan.admission.rejections.some(r=>!record(r)))throw new TypeError('Scene pending programs are invalid');
 const indices=new Set(),objectLimit=sceneObjectLimit(plan);sceneRelationBatches(plan);
 for(const task of values){
  if(!record(task)||Reflect.ownKeys(task).length!==(resolved?5:2)||!Number.isSafeInteger(task.index)||task.index<0||task.index>=24||indices.has(task.index)
   ||resolved&&(!('sourceHash' in task)||task.sourceHash!==plan.sourceHash||!('widthPx' in task)||task.widthPx!==plan.widthPx
    ||!('heightPx' in task)||task.heightPx!==plan.heightPx)
   ||!record(task.program)||Reflect.ownKeys(task.program).length!==4)throw new TypeError('Scene pending program is invalid');
  indices.add(task.index);const program=task.program;
  if(!identity(program.regionId)||!plan.regions.some(r=>r.id===program.regionId)
   ||!members(program.objects,objectLimit)||!members(program.relations,plan.relationBatches?48:24)
   ||!list(program.labels)||program.labels.length>32||program.labels.some(s=>!record(s)
    ||Reflect.ownKeys(s).some(k=>!['refs','family','weight','sizePt','role'].includes(String(k)))
    ||!list(s.refs)||!s.refs.length||s.refs.length>512||s.refs.some(r=>!label(r))
    ||s.family!==undefined&&typeof s.family!=='string'||s.weight!==undefined&&typeof s.weight!=='string'
    ||s.role!==undefined&&typeof s.role!=='string'
    ||s.sizePt!==undefined&&(typeof s.sizePt!=='number'||!Number.isFinite(s.sizePt)||s.sizePt<1||s.sizePt>4000))
   ||!plan.admission.rejections.some(r=>r.collection==='program'&&r.index===task.index&&r.reason==='program-contract'
    &&['program-member','program-inventory-incomplete'].includes(r.detailCode??'')))throw new TypeError('Scene pending program binding is invalid');
 }
 return values;
}
/** A persisted resolution is only an admission-history binding. It grants no
 * drawing, erasure, physical membership, source pixels or budget. Revalidate
 * the complete current program and every original dependency before allowing
 * the original program rejection to stop blocking compilation. Later removal,
 * ambiguous identity, source changes or label retirement invalidate it.
 * @param {Plan} plan @param {(plan:Plan)=>RegionProgram[]} validate
 * @returns {RegionProgramResolution[]} */
function resolvedSceneProgramObligations(plan,validate){
 const tasks=readProgramObligations(plan,true);if(!tasks.length)return [];
 const pending=pendingSceneProgramObligations(plan),programs=validate(plan),owners=new Set();
 for(const task of tasks){
  const expected=canonicalProgramDependencies(plan,task.program),current=programs.find(p=>p.regionId===task.program.regionId);
  if(owners.has(task.program.regionId)||pending.some(p=>p.index===task.index||p.program.regionId===task.program.regionId)||!current
   ||expected.objects.some(id=>!current.objects.includes(id))||expected.relations.some(id=>!current.relations.includes(id))
   ||JSON.stringify(task.program.labels)!==JSON.stringify(current.labels))throw new TypeError('Scene restored program binding is invalid');
  owners.add(task.program.regionId);
 }
 return /** @type {RegionProgramResolution[]} */(tasks);
}
/** @param {Plan} plan @param {(plan:Plan)=>RegionProgram[]} validate */
function currentSceneAdmissionRejections(plan,validate){
 sceneAdmissionHistory(plan);
 const resolved=new Set(resolvedSceneProgramObligations(plan,validate).map(task=>task.index));
 const admission=plan.admission;
 if(admission!==undefined&&!record(admission))throw new TypeError('Scene admission rejections are invalid');
 const rows=admission?.rejections??[];
 if(!list(rows)||rows.length>256||rows.some(r=>!record(r)||typeof r.collection!=='string'
   ||!Number.isSafeInteger(r.index)||r.index<0||r.index>=544||typeof r.reason!=='string'
   ||r.detailCode!==undefined&&typeof r.detailCode!=='string'))throw new TypeError('Scene admission rejections are invalid');
 return rows.filter(r=>r.collection!=='program'||!resolved.has(r.index));
}
/** Original identities and their existing source-proven aliases may discharge
 * a program only after full current-inventory and cross-program label checks.
 * Never guess replacements or remove original dependency snapshots/failures.
 * All conflicting pending owners/labels remain pending.
 * @param {Plan} plan @param {(plan:Plan)=>RegionProgram[]} validate @returns {Plan} */
function restoreRegionProgramObligations(plan,validate){
 const resolved=resolvedSceneProgramObligations(plan,validate),tasks=pendingSceneProgramObligations(plan);if(!tasks.length)return plan;
 const regionPrograms=[...(plan.regionPrograms??[])],pending=[];
 const resolutions=[...resolved];
 const owners=new Map(),refs=new Map();
 for(const program of [...regionPrograms,...tasks.map(t=>t.program)]){
  owners.set(program.regionId,(owners.get(program.regionId)??0)+1);
  for(const style of program.labels)for(const ref of style.refs)refs.set(ref,(refs.get(ref)??0)+1);
 }
 for(const task of tasks){
  if(owners.get(task.program.regionId)!==1||task.program.labels.some(s=>s.refs.some(ref=>refs.get(ref)!==1))){pending.push(task);continue;}
  try{
   const checked=validate({...plan,regionPrograms:[...regionPrograms,canonicalProgramDependencies(plan,task.program)]}),restored=checked.at(-1);
   if(!restored)throw new TypeError('Scene restored program is invalid');regionPrograms.push(restored);
   resolutions.push({...task,sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx});
  }catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;pending.push(task);}
 }
 return {...plan,regionPrograms,pendingRegionPrograms:pending,...(resolutions.length?{resolvedRegionPrograms:resolutions}:{})};
}
module.exports={retainRegionProgramObligation,pendingSceneProgramObligations,restoreRegionProgramObligations,resolvedSceneProgramObligations,currentSceneAdmissionRejections};
