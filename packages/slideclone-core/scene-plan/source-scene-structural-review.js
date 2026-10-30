// @ts-check
"use strict";
const {types}=require("node:util");
const {containsSceneBox}=require("./source-scene-plan");
const {sourceSceneCompileFeedback}=require('./source-scene-compile-feedback');
const {rebindRegionProgramMembers}=require('./source-scene-region-program');
const {sceneLocalObjectCapacity,recordSceneLocalObjectBatch}=require('./source-scene-object-batches');
const {parseSceneNativeGeometry,sameSceneNativeGeometry}=require('./source-scene-native-geometry');
const {sceneIconReviewScope}=require('./source-scene-icon-review-scope');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{index:number,objectId:string,box:Box,contextBox?:Box|undefined,compileFailures?:string[]|undefined,ownerCandidates?:{id:string,parentId:string|null}[]}} Target */
/** @typedef {{index:number,kind:string,confidence:number,regionId:string|null,box:Box|null,rejection?:'source-window'|'geometry-contract',nativeGeometry?:import('./source-scene-native-geometry').NativeGeometry}} Observation */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
 ||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p)))
 throw new TypeError('Scene structural collection is invalid');return value;}
/** Select concrete structural contradictions before optional uncovered-unit
 * OCR discovery. Existing OCR and explicit missing-text requests retain their
 * slots. A rejected multi-face construction is an existing member obligation,
 * not speculative discovery. It must survive the same reservation as a wrong
 * owner or endpoint kind. A measured icon/text conflict also requires a kind
 * review before speculative glyph discovery can consume its slot. A source
 * component touching its crop boundary requires a geometry review as well;
 * another glyph query cannot establish the missing pictorial extent. A declared
 * pictorial enclosure with no source-proven enclosing contour also needs a
 * kind review; asking only for another child cannot repair that parent.
 * The source
 * compiler still decides whether the corrected proposal owns any pixels.
 * All categories share 32 targets and two calls.
 * @param {Plan|undefined} plan @param {number} capacity @param {unknown} [compileEvidence] */
function selectStructuralReviewTargets(plan,capacity,compileEvidence){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError('Scene structural capacity is invalid');
 if(!plan||!capacity)return [];
 /** @type {Map<string,string[]>} */const failures=compileEvidence===undefined?new Map():sourceSceneCompileFeedback(plan,compileEvidence);
 const regions=new Map(plan.regions.map(r=>[r.id,r])),endpoints=new Set(plan.relations.flatMap(r=>[r.fromId,r.toId]));
 return plan.objects.map((object,order)=>({object,order,iconScope:sceneIconReviewScope(plan,object),
  boundaryFailure:(failures.get(object.id)??[]).some(code=>['icon-isolation:icon-source-clipped-component','icon-isolation:icon-source-fringe-boundary'].includes(code)),classificationFailure:object.kind==='icon'
  &&(failures.get(object.id)??[]).some(code=>['icon-isolation:icon-source-text',
   'icon-isolation:icon-source-clipped-component','icon-isolation:icon-source-fringe-boundary'].includes(code))
  ||object.kind==='container'&&object.pictorialContent==='present'&&(failures.get(object.id)??[]).some(code=>[
   'container-perimeter:outline-no-closed-component','container-perimeter:outline-exterior-unstable','container-perimeter:outline-open-topology'
  ].includes(code)),constructionFailure:!!object.nativeGeometry
  &&(failures.get(object.id)??[]).some(code=>code==='native-program-source-evidence'||code.startsWith('native-program-source-evidence:')),
  endpointKindConflict:endpoints.has(object.id)&&object.kind!=='container'
   &&(object.kind!=='icon'||object.parentObjectId!==undefined||compileEvidence===undefined),
  wrongOwner:!regions.has(object.regionId)
  ||!containsSceneBox(/** @type {import('./source-scene-plan').Region} */(regions.get(object.regionId)).box,object.box),endpoint:endpoints.has(object.id)}))
  .filter(r=>r.wrongOwner||r.endpointKindConflict||failures.has(r.object.id))
  // Existing explicit contradictions retain priority over new failure probes.
  .sort((a,b)=>Number(b.wrongOwner||b.endpointKindConflict)-Number(a.wrongOwner||a.endpointKindConflict)
    ||Number(b.constructionFailure||b.classificationFailure)-Number(a.constructionFailure||a.classificationFailure)||Number(b.endpoint)-Number(a.endpoint)||Number(b.wrongOwner)-Number(a.wrongOwner)||a.order-b.order)
  .slice(0,plan.objectBatches?Math.min(capacity,sceneLocalObjectCapacity(plan)):capacity).map(r=>({objectId:r.object.id,box:{...r.object.box},compileProbe:!r.wrongOwner&&!r.endpointKindConflict&&!r.constructionFailure&&!r.classificationFailure,
   // A unique independently counted icon may have a misplaced caption seed,
   // including a seed crossing its declared owner. Exact search scope grants
   // no source ownership; clipped/fringe failures cannot relocate identity.
   ...(!r.boundaryFailure&&r.iconScope&&(r.wrongOwner
    ||r.classificationFailure&&(failures.get(r.object.id)??[]).includes('icon-isolation:icon-source-text'))?{contextBox:r.iconScope}:{}),
   ...(failures.has(r.object.id)?{compileFailures:failures.get(r.object.id)}:{}),ownerCandidates:plan.regions
   .filter(region=>containsSceneBox(region.box,r.object.box)
    ||!r.boundaryFailure&&r.iconScope&&r.wrongOwner&&region.id===r.object.regionId)
   .map(region=>({id:region.id,parentId:region.parentId}))}));
}
/** Provider geometry is mapped only through its exact source/sheet crop pair.
 * Outward normalized rounding is intersected with the physical crop; it cannot
 * acquire pixels outside that crop or invoke provider properties.
 * @param {unknown} response @param {Target[]} targets
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame
 * @returns {Observation[]} */
function readStructuralObservations(response,targets,frame){
 if(!record(response))throw new TypeError('Scene structural response is invalid');
 const rows=list(response.structures===undefined?[]:response.structures,32),seen=new Set();
 const observations=rows.map(raw=>{
  if(!record(raw)||Object.keys(raw).length!==(Object.hasOwn(raw,'nativeGeometry')?6:5)||!['index','kind','confidence','regionId','box_2d'].every(k=>Object.hasOwn(raw,k))
   ||typeof raw.index!=='number'||!Number.isSafeInteger(raw.index)||!targets.some(t=>t.index===raw.index)||seen.has(raw.index)
   ||typeof raw.kind!=='string'||!['container','icon','unknown'].includes(raw.kind)
   ||typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1
   ||!(raw.regionId===null||typeof raw.regionId==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(raw.regionId)))
   throw new TypeError('Scene structural observation is invalid');
  seen.add(raw.index);
  const nativeGeometry=parseSceneNativeGeometry(raw.nativeGeometry===null?undefined:raw.nativeGeometry);
  if(nativeGeometry&&raw.kind!=='container')throw new TypeError('Scene structural native geometry owner is invalid');
  /** @type {Box|null} */let box=null;
  if(raw.box_2d!==null){
   const b=list(raw.box_2d,4),source=frame?.sourceTargets.find(t=>t.index===raw.index),sheet=frame?.sheetTargets.find(t=>t.index===raw.index);
   if(!frame||!source||!sheet||b.length!==4||!b.every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000))throw new TypeError('Scene structural coordinates are invalid');
   // A reversed/empty provider rectangle is a rejected observation, never a
   // request to swap edges or reuse the original seed. Preserve other units
   // in this paid pair while retaining the failed target as unresolved.
   if(Number(b[0])>=Number(b[2])||Number(b[1])>=Number(b[3]))return {index:raw.index,kind:raw.kind,confidence:raw.confidence,regionId:/** @type {string|null} */(raw.regionId),box:/** @type {Box|null} */(null),rejection:/** @type {const} */('geometry-contract')};
   const left=Number(b[1])*frame.width/1000,top=Number(b[0])*frame.height/1000;
   const right=Number(b[3])*frame.width/1000,bottom=Number(b[2])*frame.height/1000;
   // Only the original transmitted rounding cell may cross the crop edge.
   const normalized=[Math.floor(sheet.cropBox.y*1000/frame.height),Math.floor(sheet.cropBox.x*1000/frame.width),
    Math.ceil((sheet.cropBox.y+sheet.cropBox.h)*1000/frame.height),Math.ceil((sheet.cropBox.x+sheet.cropBox.w)*1000/frame.width)];
   if(b.some((n,i)=>{const edge=normalized[i];if(edge===undefined)throw new TypeError('Scene structural coordinates are invalid');return i<2?Number(n)<edge:Number(n)>edge;}))return {index:raw.index,kind:raw.kind,confidence:raw.confidence,regionId:/** @type {string|null} */(raw.regionId),box:/** @type {Box|null} */(null),rejection:/** @type {const} */('source-window')};
   const x=Math.max(left,sheet.cropBox.x),y=Math.max(top,sheet.cropBox.y),r=Math.min(right,sheet.cropBox.x+sheet.cropBox.w),d=Math.min(bottom,sheet.cropBox.y+sheet.cropBox.h);
   if(r<=x||d<=y)throw new TypeError('Scene structural coordinates are invalid');
   box={x:x-sheet.cropBox.x+source.cropBox.x,y:y-sheet.cropBox.y+source.cropBox.y,w:r-x,h:d-y};
  }
  return {index:raw.index,kind:raw.kind,confidence:raw.confidence,regionId:/** @type {string|null} */(raw.regionId),box,...(nativeGeometry?{nativeGeometry}:{})};
 });
 if(observations.length!==targets.length)throw new TypeError('Scene structural target binding is invalid');
 return observations;
}
/** @param {Box} a @param {Box} b */
function intersection(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** Two independent observations propose controls, never source masks. Keep
 * identities, counts, OCR and relation direction unchanged; the compiler must
 * still remeasure every surface and actual shaft under its original gates.
 * @param {Plan} plan @param {Target[]} targets @param {Observation[][]} observations */
function applyStructuralReview(plan,targets,observations){
 const [local,context]=observations;
 if(observations.length!==2||!local||!context||observations.some(rows=>rows.length!==targets.length))throw new TypeError('Scene structural consensus is invalid');
 const regions=new Map(plan.regions.map(r=>[r.id,r]));
 /** @type {{id:string,previousRegionId:string,regionId:string,previousKind:string,kind:string}[]} */const corrected=[];
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 const objects=plan.objects.map(object=>{
  const target=targets.find(t=>t.objectId===object.id);if(!target)return object;
  const a=local.find(r=>r.index===target.index),b=context.find(r=>r.index===target.index);
  const decline=(/** @type {string} */reason)=>{rejected.push({id:object.id,reason});return object;};
  if(!a||!b)return decline('missing-observation');
  if(a.rejection||b.rejection)return decline(a.rejection==='geometry-contract'||b.rejection==='geometry-contract'?'geometry-contract':'source-window');
  if(a.confidence<.9||b.confidence<.9)return decline('confidence');
  if(a.kind==='unknown'||a.kind!==b.kind)return decline('kind-consensus');
  if(!sameSceneNativeGeometry(a.nativeGeometry,b.nativeGeometry))return decline('native-geometry-consensus');
  if(a.regionId!==b.regionId||a.regionId===null||!regions.has(a.regionId))return decline('owner-consensus');
  if((a.box===null)!==(b.box===null))return decline('geometry-presence');
  const first=a.box??object.box,second=b.box??object.box,overlap=intersection(first,second);
  if(overlap/(first.w*first.h+second.w*second.h-overlap)<.85)return decline('geometry-consensus');
  // The tight observation selects geometry; the context independently checks it.
  const region=regions.get(a.regionId),center={x:object.box.x+object.box.w/2,y:object.box.y+object.box.h/2,w:1e-6,h:1e-6};
  if(!region||!containsSceneBox(region.box,first))return decline('source-owner');
  if(!containsSceneBox(first,center)){
   const scope=sceneIconReviewScope(plan,object);
   // Relocation needs the exact original owner/seed union in BOTH source
   // views. A generic larger crop, new owner or ambiguous census cannot move
   // identity to another component. Source ownership is remeasured later.
   if(!scope||!target.contextBox||a.kind!=='icon'||a.regionId!==object.regionId
    ||target.compileFailures?.some(code=>['icon-isolation:icon-source-clipped-component','icon-isolation:icon-source-fringe-boundary'].includes(code))
    ||!['x','y','w','h'].every(k=>scope[/** @type {keyof Box} */(k)]===target.contextBox?.[/** @type {keyof Box} */(k)])
    ||!containsSceneBox(region.box,second)||!containsSceneBox(scope,first)||!containsSceneBox(scope,second))return decline('source-seed');
  }
  let current=region;const seen=new Set([current.id]);
  while(current.parentId){const parent=regions.get(current.parentId);if(!parent||seen.has(parent.id)||!containsSceneBox(parent.box,current.box))return decline('region-tree');seen.add(parent.id);current=parent;}
  if(first.x<0||first.y<0||first.x+first.w>plan.widthPx||first.y+first.h>plan.heightPx)return decline('source-frame');
  // Agreement on a broad ancestor cannot erase an already legal concrete
  // owner. Only explicit ancestry supplies this contradiction; overlapping
  // regions or a smaller area alone never authorize choosing another owner.
  const previous=regions.get(object.regionId);
  if(previous&&previous.id!==region.id&&containsSceneBox(previous.box,object.box)
    &&containsSceneBox(previous.box,first)&&containsSceneBox(previous.box,second)){
   let descendant=previous;const visited=new Set([descendant.id]);
   while(descendant.parentId){const parent=regions.get(descendant.parentId);
    if(!parent||visited.has(parent.id)||!containsSceneBox(parent.box,descendant.box))break;
    if(parent.id===region.id)return decline('owner-ancestor-regression');
    visited.add(parent.id);descendant=parent;}
  }
  if(object.kind===a.kind&&object.regionId===region.id&&['x','y','w','h'].every(k=>object.box[/** @type {keyof Box} */(k)]===first[/** @type {keyof Box} */(k)])
   &&(a.nativeGeometry===undefined||sameSceneNativeGeometry(object.nativeGeometry,a.nativeGeometry)))return object;
  corrected.push({id:object.id,previousRegionId:object.regionId,regionId:region.id,previousKind:object.kind,kind:a.kind});
  const {parentObjectId:previousParent,nativeGeometry:previousGeometry,...original}=object;
  // An old explicit nesting link cannot survive an independently revised owner.
  return {...original,kind:a.kind,regionId:region.id,box:{...first},...(a.kind==='container'&&(a.nativeGeometry??previousGeometry)?{nativeGeometry:a.nativeGeometry??previousGeometry}:{}),
   ...(previousParent&&object.regionId===region.id?{parentObjectId:previousParent}:{})};
 });
 const result=recordSceneLocalObjectBatch(plan,{...plan,objects},[],targets.map(t=>t.objectId));
 return {plan:rebindRegionProgramMembers(plan,result),evidence:{proposed:targets.length,corrected,rejected}};
}
module.exports={selectStructuralReviewTargets,readStructuralObservations,applyStructuralReview};
