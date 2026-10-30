// @ts-check
'use strict';
const crypto=require('node:crypto');
const {record,list,box}=require('./source-scene-group-containment');
const {parseSceneNativeGeometry}=require('./source-scene-native-geometry');
const {captureSceneRelationScopeReview}=require('./source-scene-relation-scope-review');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {Pick<import('./source-scene-plan').Relation,'id'|'regionId'|'fromId'|'toId'|'direction'>} Core */
/** @typedef {{version:1,index:number,sourceHash:string,widthPx:number,heightPx:number,core:Core,revision:string,reviewRegionId?:string}} Localization */
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** @param {unknown} value @param {string[]} keys */
const exact=(value,keys)=>record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
/** @param {import('./source-scene-plan').Box} a @param {import('./source-scene-plan').Box} b */
const contains=(a,b)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;
/** Read only bounded plain descriptors before snapshotting them. Neither the
 * snapshot nor this control is a source-pixel, drawing or erasure receipt.
 * @param {Plan} plan */
function frame(plan){
 if(!record(plan)||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||!list(plan.regions)||plan.regions.length>24||!list(plan.objects)||plan.objects.length>96
  ||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)||!identity(r.id)))
  throw new TypeError('Scene relation localization frame is invalid');
 const rows=[...plan.regions,...plan.objects];
 if(rows.some(r=>!record(r)||!identity(r.id)||typeof r.kind!=='string'||!box(r.box)||!exact(r.box,['x','y','w','h'])
  ||r.box.x+r.box.w>plan.widthPx||r.box.y+r.box.h>plan.heightPx)
  ||new Set(rows.map(r=>r.id)).size!==rows.length
  ||plan.regions.some(r=>r.parentId!==null&&!identity(r.parentId))
  ||plan.objects.some(o=>!identity(o.regionId)||o.parentObjectId!==undefined&&!identity(o.parentObjectId)))
  throw new TypeError('Scene relation localization entities are invalid');
 const regions=plan.regions.map(r=>({id:r.id,parentId:r.parentId,kind:r.kind,box:{...r.box},nativeGeometry:parseSceneNativeGeometry(r.nativeGeometry)}));
 for(const r of regions){const seen=new Set([r.id]);let at=r.parentId;
  while(at!==null){const parent=regions.find(p=>p.id===at);if(!parent||seen.has(at))throw new TypeError('Scene relation localization ancestry is invalid');
   seen.add(at);at=parent.parentId;}
 }
 const entities=[...regions.map(r=>({...r,regionId:r.id,parentObjectId:/** @type {string|undefined} */(undefined)})),
  ...plan.objects.map(o=>({id:o.id,regionId:o.regionId,kind:o.kind,box:{...o.box},parentObjectId:o.parentObjectId,nativeGeometry:parseSceneNativeGeometry(o.nativeGeometry)}))];
 return {regions,entities};
}
/** @param {Plan} plan @param {Core} core */
function coreRevision(plan,core){
 const {regions,entities}=frame(plan);
 if(!exact(core,['id','regionId','fromId','toId','direction'])||![core.id,core.regionId,core.fromId,core.toId].every(identity)
  ||!/^relation-/u.test(core.id)||core.fromId===core.toId||!['forward','backward','both','undirected'].includes(core.direction))
  throw new TypeError('Scene relation localization core is invalid');
 const scopeReview=captureSceneRelationScopeReview(plan,core),owner=regions.find(r=>r.id===(scopeReview?.reviewOwner.id??core.regionId));
 if(!owner)throw new TypeError('Scene relation localization owner is invalid');
 const endpoints=[core.fromId,core.toId].map(id=>{
  const endpoint=entities.find(e=>e.id===id);
  if(!endpoint||!['container','card','icon'].includes(endpoint.kind)||endpoint.parentObjectId!==undefined||!contains(owner.box,endpoint.box))
   throw new TypeError('Scene relation localization endpoint is invalid');
  let at=regions.find(r=>r.id===endpoint.regionId);
  while(at){if(!contains(at.box,endpoint.box))break;if(at.id===owner.id)return endpoint;at=regions.find(r=>r.id===at?.parentId);}
  throw new TypeError('Scene relation localization owner is invalid');
 });
 return crypto.createHash('sha256').update(JSON.stringify({sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,regions,core,endpoints})).digest('hex');
}
/** Preserve only independently valid headers of the known seven-field
 * transport after admission rejected its THREE-coordinate shaft. Never guess
 * a fourth coordinate, retain a partial anchor, discard an unsupported path,
 * or pass a repaired tuple back through drawable admission.
 * @param {Plan} plan @param {{index:number,tuple:unknown}[]} rows
 * @param {(value:unknown,namespace:string)=>string} scoped @returns {Localization[]} */
function retainSceneRelationLocalizations(plan,rows,scoped){
 /** @type {Localization[]} */const controls=[];
 const mentionedIds=new Map();
 for(const {tuple}of rows){if(!list(tuple)||!tuple.length)continue;
  try{const id=scoped(tuple[0],'relation');mentionedIds.set(id,(mentionedIds.get(id)??0)+1);}
  catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;}
 }
 for(const {index,tuple}of rows){
  if(!list(tuple)||tuple.length!==7||!list(tuple[5])||tuple[5].length!==3||tuple[6]!==null
   ||!tuple[5].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1000))continue;
  try{
   const endpoint=(/** @type {unknown} */raw)=>{const object=scoped(raw,'object');return plan.objects.some(o=>o.id===object)?object:scoped(raw,'region');};
   if(typeof tuple[4]!=='string')continue;
   const core={id:scoped(tuple[0],'relation'),regionId:scoped(tuple[1],'region'),fromId:endpoint(tuple[2]),toId:endpoint(tuple[3]),direction:tuple[4]};
   const revision=coreRevision(plan,core);
   if(plan.relations.some(r=>r.id===core.id)||plan.admission?.relationCandidates?.some(c=>c.relation.id===core.id))continue;
   const scopeReview=captureSceneRelationScopeReview(plan,core);
   controls.push({version:1,index,sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,core,revision,...(scopeReview?{reviewRegionId:scopeReview.reviewOwner.id}:{})});
  }catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;}
 }
 // Repeated rejected IDs cannot select a winner through enumeration order.
 return controls.filter(c=>mentionedIds.get(c.core.id)===1);
}
/** These quarantined controls reserve original rejected slots. They do not
 * become Relations or trusted anchors until a separate source observation and
 * ordinary admission succeed. Legacy plans without the extension stay legacy.
 * @param {Plan} plan @returns {Localization[]} */
function sceneRelationLocalizations(plan){
 if(!record(plan)||plan.admission!==undefined&&!record(plan.admission))throw new TypeError('Scene relation localization admission is invalid');
 const values=plan.admission?.relationLocalizations;if(values===undefined)return [];
 if(!list(values)||values.length>24||!list(plan.admission?.rejections)||plan.admission.rejections.length>256
  ||plan.admission.rejections.some(r=>!record(r)))throw new TypeError('Scene relation localization controls are invalid');
 frame(plan);
 const candidates=plan.admission?.relationCandidates??[];
 if(!list(candidates)||candidates.length>24||candidates.some(c=>!record(c)||!record(c.relation)||!Number.isSafeInteger(c.index)||c.index<0||c.index>=24))throw new TypeError('Scene relation localization candidates are invalid');
 const seen=new Set(candidates.map(c=>c.index)),ids=new Set([...plan.relations.map(r=>r.id),...candidates.map(c=>c.relation.id)]);
 if(values.length+candidates.length+plan.relations.length>(plan.relationBatches===undefined?24:48))throw new TypeError('Scene relation localization capacity is invalid');
 return values.map(raw=>{
  if(!exact(raw,['version','index','sourceHash','widthPx','heightPx','core','revision',...(record(raw)&&Object.hasOwn(raw,'reviewRegionId')?['reviewRegionId']:[])])||!record(raw)||raw.version!==1
   ||!Number.isSafeInteger(raw.index)||raw.index<0||raw.index>=24||seen.has(raw.index)||raw.sourceHash!==plan.sourceHash
   ||raw.widthPx!==plan.widthPx||raw.heightPx!==plan.heightPx||!record(raw.core)||!identity(raw.core.id)||ids.has(raw.core.id)
   ||typeof raw.revision!=='string'||!/^[a-f0-9]{64}$/u.test(raw.revision)
   ||!plan.admission?.rejections.some(r=>r.collection==='relation'&&r.index===raw.index&&r.reason==='relation-contract'&&r.detailCode==='tuple'))
   throw new TypeError('Scene relation localization binding is invalid');
  const core=/** @type {Core} */(raw.core);
  if(raw.revision!==coreRevision(plan,core))throw new TypeError('Scene relation localization revision is invalid');
  const scopeReview=captureSceneRelationScopeReview(plan,core);
  // The original core stays quarantined. An ancestor nomination is a bound
  // review control, never permission to silently change the rejected owner.
  if(raw.reviewRegionId!==scopeReview?.reviewOwner.id)throw new TypeError('Scene relation localization scope is invalid');
  seen.add(raw.index);ids.add(core.id);
  return {version:/** @type {const} */(1),index:raw.index,sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,core:{...core},revision:raw.revision,...(scopeReview?{reviewRegionId:scopeReview.reviewOwner.id}:{})};
 });
}
module.exports={retainSceneRelationLocalizations,sceneRelationLocalizations};
