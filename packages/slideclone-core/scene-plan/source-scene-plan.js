// @ts-check
"use strict";
const { types } = require("node:util");
const crypto=require("node:crypto");
const {resolveSceneObjectOwners}=require("./source-scene-object-owners");
const {parseObservedInventory}=require('./source-scene-observed-inventory');
const {parseScenePathProgram}=require('./source-scene-path-program');
const {parseRegionPrograms,reconcileSceneLabelLayout,retainRegionProgramObligation}=require('./source-scene-region-program');
const {expandCompactProgramScene}=require('./source-scene-compact-program');
const {expandPackedProgramScene}=require('./source-scene-packed-program');
const {SCENE_PROGRAM_PROMPT}=require('./source-scene-program-prompt');
const {retainSceneRejectedRelation,retainSceneRejectedRelationPath,retainSceneRelationLocalizations}=require('./source-scene-rejected-relations');
const {initializeSceneObjectBatches,sceneObjectBatches}=require('./source-scene-object-batches');
const {parseSceneNativeGeometry}=require('./source-scene-native-geometry');
const {proposeSourceCylinderTopology,parseInitialSourceTopologyControls}=require('./source-scene-source-topology');
const {withSceneCompilationSession}=require('./source-scene-compilation-session');
const {containsSceneBox:contains}=require('./source-scene-endpoint-scope');
const {parseSceneTextEndpoint,sourceSceneTextEndpointCatalog}=require('./source-scene-text-endpoints');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{id:string,parentId:string|null,kind:string,box:Box,nativeGeometry?:import('./source-scene-native-geometry').NativeGeometry}} Region */
/** @typedef {{id:string,regionId:string,kind:string,box:Box,parentObjectId?:string,nativePictorial?:true,pictorialContent?:'present'|'absent'|'unknown',nativeGeometry?:import('./source-scene-native-geometry').NativeGeometry}} SceneObject */
/** @typedef {{id:string,regionId:string,fromId:string,toId:string,direction:string,shaftBox?:Box,visiblePath?:import('./source-scene-path-program').PathProgram,sourcePathChoice?:import('../routing/source-shared-route-choice').Choice}} Relation */
/** @typedef {{complete:boolean,rejections:{collection:string,index:number,reason:string,detailCode?:string}[],relationCandidates?:import('./source-scene-rejected-relations').Candidate[],relationLocalizations?:import('./source-scene-relation-localization').Localization[],history?:import('./source-scene-admission-history').History}} Admission */
/** @typedef {{version:1,sourceHash:string,widthPx:number,heightPx:number,regions:Region[],objects:SceneObject[],relations:Relation[],relationObservationUnit?:'logical-relations-v1',textEndpoints?:import('./source-scene-text-endpoints').TextEndpoint[],objectBatches?:import('./source-scene-object-batches').ObjectBatches,relationBatches?:import('./source-scene-relation-batches').RelationBatch[],admission?:Admission,regionLabelLayout?:{reassigned:number,ambiguous:number,uncontained:number},observedInventory?:import('./source-scene-observed-inventory').Observation[],regionPrograms?:import('./source-scene-region-program').RegionProgram[],pendingRegionPrograms?:import('./source-scene-region-program').RegionProgramObligation[],resolvedRegionPrograms?:import('./source-scene-program-obligations').RegionProgramResolution[]}} ScenePlan */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
    &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
    &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);
}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum) {
  if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
    ||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1
    ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))throw new TypeError("Scene plan collection is invalid");
  return value;
}
/** @param {unknown} value @returns {string} */
function identity(value) {
  if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=999999)return `n${value}`;
  if(typeof value==="string"&&/^[0-9]{1,6}$/u.test(value))return `n${Number(value)}`;
  if(typeof value!=="string"||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value))throw new TypeError("Scene plan identity is invalid");
  return value;
}
/** @param {unknown} value @returns {'present'|'absent'|'unknown'|undefined} */
function parsePictorialContent(value){
 if(value===undefined)return undefined;
 if(value==='present')return 'present';
 if(value==='absent')return 'absent';
 if(value==='unknown')return 'unknown';
 throw new TypeError('Scene object pictorial content is invalid');
}
/** @param {unknown} raw @param {string} namespace */
function scopedIdentity(raw,namespace){const key=identity(raw),value=`${namespace}-${key}`;
 return value.length<=64?value:`${namespace}-${crypto.createHash("sha256").update(key).digest("hex").slice(0,32)}`;}
/** @param {unknown} value @param {number} width @param {number} height @returns {Box} */
function sceneBox(value,width,height,coordinateSpace="normalized-1000") {
  if(!record(value))throw new TypeError("Scene plan box is invalid");
  const {x,y,w,h}=value;
  if(typeof x!=="number"||typeof y!=="number"||typeof w!=="number"||typeof h!=="number"
    ||![x,y,w,h].every(Number.isSafeInteger)||x<0||y<0||w<=0||h<=0
    ||x+w>(coordinateSpace==="source-pixels"?width:1000)||y+h>(coordinateSpace==="source-pixels"?height:1000))
    throw new TypeError("Scene plan coordinates are invalid");
  return coordinateSpace==="source-pixels"?{x,y,w,h}:{x:x*width/1000,y:y*height/1000,w:w*width/1000,h:h*height/1000};
}
/** Compact transport saves output tokens; it changes no internal geometry,
 * identity, count or ownership rule. Never execute tuple accessors.
 * @param {Record<string,unknown>} value */
function expandCompactScene(value) {
  const programmed=value.format==='compact-v6'||value.format==='compact-v7',anchored=value.format==='compact-v4'||value.format==='compact-v5'||programmed,corners=value.format==="compact-v2"||value.format==="compact-v3"||anchored,content=value.format==="compact-v3"||anchored;
  if(corners&&(value.coordinateSpace!=="normalized-1000"||value.boxFormat!=="ymin-xmin-ymax-xmax"))throw new TypeError("Scene box format is invalid");
  /** @param {unknown} value @param {number} size */
  const tuple=(value,size)=>{const row=list(value,size);if(row.length!==size)throw new TypeError("Scene tuple is invalid");return row;};
  /** @param {unknown} value */
  const box=value=>{const b=tuple(value,4);
    if(!corners)return {x:b[0],y:b[1],w:b[2],h:b[3]};
    if(!b.every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1000)
      ||Number(b[0])>=Number(b[2])||Number(b[1])>=Number(b[3]))throw new TypeError("Scene corner coordinates are invalid");
    return {x:b[1],y:b[0],w:Number(b[3])-Number(b[1]),h:Number(b[2])-Number(b[0])};};
  return {coordinateSpace:value.coordinateSpace,...(value.inventory!==undefined?{inventory:value.inventory}:{}),...(value.programs!==undefined?{programs:value.programs}:{}),
    ...(value.relationObservationUnit!==undefined?{relationObservationUnit:value.relationObservationUnit}:{}),
    regions:list(value.regions,24).map(value=>{const r=programmed&&Array.isArray(value)&&!types.isProxy(value)&&value.length===5?tuple(value,5):tuple(value,4);return {id:r[0],parentId:r[1],kind:r[2],box:box(r[3]),...(r.length===5?{nativeGeometry:r[4]}:{})};}),
    objects:list(value.objects,64).map(value=>{const r=content&&Array.isArray(value)&&!types.isProxy(value)&&value.length===6?tuple(value,6):tuple(value,content?5:4);return {id:r[0],regionId:r[1],kind:r[2],box:box(r[3]),...(content?{pictorialContent:r[4]}:{}),...(r.length===6?{nativeGeometry:r[5]}:{})};}),
    relations:list(value.relations,24).map(value=>{const r=tuple(value,programmed?7:anchored?6:5);
      const path=programmed&&r[6]!==null?{kind:'polyline',dash:'solid',vertices:list(r[6],16).map(p=>{const point=tuple(p,2);return {x:point[0],y:point[1]};})}:undefined;
      return {id:r[0],regionId:r[1],fromId:r[2],toId:r[3],direction:r[4],...(anchored?{shaftBox:box(r[5])}:{}),...(path?{visiblePath:path}:{})};})};
}
/** Explicit coordinates prevent pixel/normalized guessing. Geometry is a
 * proposal only: the compiler must measure source evidence before emission.
 * @param {unknown} value @param {{sourceHash:string,widthPx:number,heightPx:number,labelRefs?:readonly string[],labelBoxes?:readonly Box[]}} source
 * @returns {ScenePlan|undefined} */
function parseSourceScenePlan(value,source) {
  if(value===undefined)return undefined;
  if(record(value)&&value.format==='packed-v1')value=expandPackedProgramScene(value);
  if(record(value)&&value.format==='compact-v8')value=expandCompactProgramScene(value);
  if(!record(value)||typeof value.coordinateSpace!=="string"||!["normalized-1000","source-pixels"].includes(value.coordinateSpace)
    ||!/^[a-f0-9]{64}$/u.test(source.sourceHash)||![source.widthPx,source.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
    ||source.widthPx*source.heightPx>40000000)throw new TypeError("Scene plan source is invalid");
  const coordinateSpace=value.coordinateSpace;
  const inventoryRequired=value.format==='compact-v5'||value.format==='compact-v6'||value.format==='compact-v7';
  if(value.format!==undefined){if(typeof value.format!=='string'||!["compact-v1","compact-v2","compact-v3","compact-v4","compact-v5","compact-v6","compact-v7"].includes(value.format))throw new TypeError("Scene plan format is invalid");value=expandCompactScene(value);}
  if(!record(value))throw new TypeError("Scene plan is invalid");
  const ids=new Set();
  /** @param {unknown} raw @param {string} namespace */
  const scoped=scopedIdentity;
  /** @param {unknown} raw @param {string} namespace */
  const id=(raw,namespace)=>{const result=scoped(raw,namespace);if(ids.has(result))throw new TypeError("Scene plan identity conflicts");ids.add(result);return result;};
  const regions=list(value.regions,24).map(item=>{
    if(!record(item)||typeof item.kind!=="string"||!["section","card","container","diagram","table","unknown"].includes(item.kind))throw new TypeError("Scene region is invalid");
    const nativeGeometry=parseSceneNativeGeometry(item.nativeGeometry);
    if(nativeGeometry&&!["card","container"].includes(item.kind))throw new TypeError('Scene native geometry owner is invalid');
    return {id:id(item.id,"region"),parentId:item.parentId===null?null:scoped(item.parentId,"region"),kind:item.kind,
      box:sceneBox(item.box,source.widthPx,source.heightPx,coordinateSpace),...(nativeGeometry?{nativeGeometry}:{})};
  });
  const byId=new Map(regions.map(item=>[item.id,item]));
  for(const region of regions){
    const seen=new Set([region.id]);let parent=region.parentId;
    while(parent!==null){const ancestor=byId.get(parent);if(!ancestor||seen.has(parent))throw new TypeError("Scene region tree is invalid");seen.add(parent);parent=ancestor.parentId;}
  }
  const objects=list(value.objects,64).map(item=>{
    if(!record(item)||typeof item.kind!=="string"||!["container","card","icon","unknown"].includes(item.kind))throw new TypeError("Scene object is invalid");
    const pictorialContent=parsePictorialContent(item.pictorialContent);
    const nativeGeometry=parseSceneNativeGeometry(item.nativeGeometry);
    if(nativeGeometry&&!["container","card"].includes(item.kind))throw new TypeError('Scene native geometry owner is invalid');
    const regionId=scoped(item.regionId,"region");if(!byId.has(regionId))throw new TypeError("Scene object region is invalid");
    return {id:id(item.id,"object"),regionId,kind:item.kind==="card"?"container":item.kind,box:sceneBox(item.box,source.widthPx,source.heightPx,coordinateSpace),...(pictorialContent!==undefined?{pictorialContent}:{}),...(nativeGeometry?{nativeGeometry}:{})};
  });
  const entityIds=new Set(ids);
  const textEndpoints=new Map(sourceSceneTextEndpointCatalog(source,regions).map(t=>[t.id,t]));
  /** @param {unknown} value */
  const endpointId=value=>{
   const label=parseSceneTextEndpoint(value,source,regions);
   if(label){textEndpoints.set(label.id,label);entityIds.add(label.id);return label.id;}
   const object=scoped(value,'object');return entityIds.has(object)?object:scoped(value,'region');
  };
  const relations=list(value.relations,24).map(item=>{
    if(!record(item)||typeof item.direction!=="string"||!["forward","backward","both","unknown","undirected"].includes(item.direction))throw new TypeError("Scene relation is invalid");
    const regionId=scoped(item.regionId,"region");
    const fromId=endpointId(item.fromId),toId=endpointId(item.toId);
    if(!byId.has(regionId)||!entityIds.has(fromId)||!entityIds.has(toId)||fromId===toId)throw new TypeError("Scene relation reference is invalid");
    const shaftBox=item.shaftBox===undefined?undefined:sceneBox(item.shaftBox,source.widthPx,source.heightPx,coordinateSpace);
    const owner=byId.get(regionId);
    if(shaftBox&&(!owner||!contains(owner.box,shaftBox)))throw new TypeError('Scene relation anchor scope is invalid');
    if(!owner)throw new TypeError('Scene relation reference is invalid');
    const visiblePath=parseScenePathProgram(item.visiblePath,{widthPx:source.widthPx,heightPx:source.heightPx,coordinateSpace,owner:owner.box,...(shaftBox?{shaftBox}:{})});
    const sourcePathChoice=item.sourcePathChoice===undefined?undefined:require('../routing/source-shared-route-choice').parseSourceRouteChoice(item.sourcePathChoice);
    if(sourcePathChoice&&(visiblePath||sourcePathChoice.sourceHash!==source.sourceHash))throw new TypeError('Scene source edge choice binding is invalid');
    return {id:id(item.id,"relation"),regionId,fromId,toId,direction:item.direction,...(shaftBox?{shaftBox}:{}),...(visiblePath?{visiblePath}:{}),...(sourcePathChoice?{sourcePathChoice}:{})};
  });
  const observedInventory=parseObservedInventory(value.inventory,regions.map(r=>r.id),raw=>scoped(raw,'region'),inventoryRequired);
  if(value.relationObservationUnit!==undefined&&(value.relationObservationUnit!=='logical-relations-v1'||!observedInventory))
    throw new TypeError('Scene relation observation unit is invalid');
  const plan={version:/** @type {const} */(1),sourceHash:source.sourceHash,widthPx:source.widthPx,heightPx:source.heightPx,regions,objects,relations,
    ...(value.relationObservationUnit!==undefined?{relationObservationUnit:/** @type {const} */('logical-relations-v1')}:{}),
    ...(textEndpoints.size?{textEndpoints:[...textEndpoints.values()]}:{}),...(observedInventory?{observedInventory}:{})};
  const regionPrograms=parseRegionPrograms(value.programs,plan,source.labelRefs,scoped);
  const result={...plan,...(regionPrograms?{regionPrograms}:{})};
  return regionPrograms&&source.labelBoxes!==undefined?reconcileSceneLabelLayout(result,source.labelRefs,source.labelBoxes):result;
}
/** A bad local proposal must remain explicitly incomplete rather than destroy
 * independently valid source units. Collection/security and region-tree errors
 * still fail the entire stage. Every retained unit passes the strict parser.
 * @param {unknown} value @param {{sourceHash:string,widthPx:number,heightPx:number,labelRefs?:readonly string[],labelBoxes?:readonly Box[]}} source
 * @param {{image:import('../png').PngImage,budget:{used:number},textMasks:Box[],evidence:TopologyEvidence[]}|undefined} [measurements]
 * @returns {ScenePlan|undefined} */
function admitSourceScenePlan(value,source,measurements){
 if(value===undefined)return undefined;
 if(!record(value))throw new TypeError("Scene plan source is invalid");
 if(value.format==='packed-v1')value=expandPackedProgramScene(value);
 if(record(value)&&value.format==='compact-v8')value=expandCompactProgramScene(value);
 if(!record(value))throw new TypeError("Scene plan source is invalid");
 // Preserve compact tuples until their individual strict admission. Eager
 // expansion would make one malformed object destroy all independent units.
 if(value.format!==undefined&&value.format!=="compact-v1"&&value.format!=="compact-v2"&&value.format!=="compact-v3"&&value.format!=="compact-v4"&&value.format!=="compact-v5"&&value.format!=="compact-v6"&&value.format!=="compact-v7")throw new TypeError("Scene plan format is invalid");
 if(!record(value))throw new TypeError("Scene plan is invalid");
 const proposal=value,originalObjects=list(proposal.objects,64),relations=list(proposal.relations,24);
 const regionPlan=parseSourceScenePlan({...proposal,programs:undefined,objects:[],relations:[]},source);
 if(!regionPlan)throw new TypeError("Scene plan admission is invalid");
 // Providers sometimes encode an explicit containing object as the owner.
 // Coerce only a complete, unique, source-contained container chain. The
 // strict parser below must still admit every converted unit independently.
 const regionOnly=proposal.format===undefined?proposal:expandCompactScene({...proposal,objects:[],relations:[]});
 const rawRegions=list(regionOnly.regions,24);
 const rawRegionIds=new Map(regionPlan.regions.map((r,index)=>[r.id,record(rawRegions[index])?rawRegions[index].id:undefined]));
 /** @type {{id:string,ownerRegionId:string,ownerObjectId:string,kind:string,box:Box}[]} */const ownerCandidates=[];
 /** @type {Map<number,string>} */const objectKeys=new Map();
 for(const [index,raw] of originalObjects.entries()){
  try{
   const expanded=proposal.format===undefined?raw:expandCompactScene({...proposal,objects:[raw],relations:[]}).objects[0];
   if(!record(expanded)||typeof expanded.kind!=="string"||!["container","card","icon","unknown"].includes(expanded.kind))throw new TypeError("Scene object is invalid");
   const id=scopedIdentity(expanded.id,"object");
   ownerCandidates.push({id,ownerRegionId:scopedIdentity(expanded.regionId,"region"),ownerObjectId:scopedIdentity(expanded.regionId,"object"),
    kind:expanded.kind==="card"?"container":expanded.kind,box:sceneBox(expanded.box,source.widthPx,source.heightPx,String(proposal.coordinateSpace))});objectKeys.set(index,id);
  }catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;}
 }
 const bindings=new Map(resolveSceneObjectOwners(regionPlan.regions,ownerCandidates).map(binding=>[binding.objectId,binding]));
 const objects=originalObjects.map((raw,index)=>{
  const binding=bindings.get(objectKeys.get(index)||"");if(!binding)return raw;
  const owner=rawRegionIds.get(binding.regionId);
  return proposal.format===undefined&&record(raw)?{...raw,regionId:owner}:Array.isArray(raw)?[raw[0],owner,raw[2],raw[3],...(['compact-v3','compact-v4','compact-v5','compact-v6','compact-v7'].includes(String(proposal.format))?[raw[4],...(raw.length===6?[raw[5]]:[])]:[])]:raw;
 });
 /** @type {unknown[]} */const retainedObjects=[],retainedRelations=[];
 /** @type {Admission["rejections"]} */const rejections=[];
 /** @type {import('./source-scene-rejected-relations').Candidate[]} */const relationCandidates=[];
 const objectIds=new Set(),relationIds=new Set();
 // Codes come only from our strict parser. Never persist provider payloads or
 // arbitrary exception messages while explaining a rejected physical unit.
 /** @param {unknown} error */
 const detailCode=error=>{const codes=new Map([
  ['Scene object is invalid','object-kind'],['Scene object region is invalid','object-region'],
  ['Scene object pictorial content is invalid','object-pictorial-content'],
  ['Scene plan coordinates are invalid','coordinates'],['Scene plan box is invalid','box'],
  ['Scene corner coordinates are invalid','corner-coordinates'],['Scene plan identity is invalid','identity'],
  ['Scene plan identity conflicts','identity-conflict'],['Scene tuple is invalid','tuple'],
  ['Scene plan collection is invalid','collection'],['Scene relation is invalid','relation-direction'],
  ['Scene relation reference is invalid','relation-reference'],['Scene relation anchor scope is invalid','relation-anchor-scope'],
  ['Scene region program collection is invalid','program-collection'],
  ['Scene region program inventory is invalid','program-inventory'],
  ['Scene region program label context is invalid','program-label-context'],
  ['Scene region program is invalid','program-shape'],
  ['Scene region program owner is invalid','program-owner'],
  ['Scene region program member is invalid','program-member'],
  ['Scene region program inventory is incomplete','program-inventory-incomplete'],
  ['Scene region program label style is invalid','program-label-style'],
  ['Scene region program label reference is invalid','program-label-reference'],
  ['Scene region program label reference is ambiguous','program-label-ambiguous'],
  ['Scene region program label style is empty','program-label-empty'],
  ['Scene region program native family is invalid','program-native-family'],
  ['Scene region program native weight is invalid','program-native-weight'],
  ['Scene region program native size is invalid','program-native-size'],
  ['Scene region program typography role is invalid','program-typography-role'],
  ['Scene label layout binding is invalid','program-layout-binding'],
  ['Scene label layout source is invalid','program-layout-source'],
  ['Scene label layout owner is invalid','program-layout-owner'],
  ['Scene label layout region cycle is invalid','program-layout-cycle'],
  ['Scene label layout reference is invalid','program-layout-reference']]);
  return error instanceof TypeError?codes.get(error.message)||'contract':'contract';
 };
 /** @param {unknown} error */
 const expected=error=>error instanceof TypeError&&/^Scene /u.test(error.message);
 for(const [index,object] of objects.entries()){
  try{
   const parsed=parseSourceScenePlan({...proposal,programs:undefined,objects:[object],relations:[]},source),id=parsed?.objects[0]?.id;
   if(!id||objectIds.has(id))throw new TypeError("Scene plan identity conflicts");
   objectIds.add(id);retainedObjects.push(object);
  }catch(error){if(!expected(error))throw error;rejections.push({collection:"object",index,reason:"object-contract",detailCode:detailCode(error)});}
 }
 for(const [index,relation] of relations.entries()){
  try{
   const parsed=parseSourceScenePlan({...proposal,programs:undefined,objects:retainedObjects,relations:[relation]},source),id=parsed?.relations[0]?.id;
   if(!id||relationIds.has(id))throw new TypeError("Scene plan identity conflicts");
   relationIds.add(id);retainedRelations.push(relation);
  }catch(error){
   if(!expected(error))throw error;
   const code=detailCode(error);rejections.push({collection:"relation",index,reason:"relation-contract",detailCode:code});
   if(code==='relation-anchor-scope'){
    const expanded=proposal.format===undefined?relation:expandCompactScene({...proposal,objects:retainedObjects,relations:[relation]}).relations[0];
    if(!record(expanded))throw error;
    const candidate=retainSceneRejectedRelation(index,scopedIdentity(expanded.regionId,'region'),regionPlan.regions,regionId=>{
     const owner=rawRegionIds.get(regionId),unit=proposal.format===undefined?{...expanded,regionId:owner}
      :Array.isArray(relation)?[relation[0],owner,...relation.slice(2)]:relation;
     return parseSourceScenePlan({...proposal,programs:undefined,objects:retainedObjects,relations:[unit]},source);
    });
    if(candidate&&!relationIds.has(candidate.relation.id)){relationIds.add(candidate.relation.id);relationCandidates.push(candidate);}
   }
   if(code==='tuple'&&(proposal.format==='compact-v6'||proposal.format==='compact-v7')){
    const candidate=retainSceneRejectedRelationPath(index,relation,unit=>parseSourceScenePlan({...proposal,programs:undefined,objects:retainedObjects,relations:[unit]},source));
    if(candidate&&!relationIds.has(candidate.relation.id)){relationIds.add(candidate.relation.id);relationCandidates.push(candidate);}
   }
  }
 }
 // Keep independent source units when one program is invalid. Its explicit
 // rejection remains part of the completion gate; no member is invented.
 const retainedPrograms=/** @type {unknown[]} */([]),pendingRegionPrograms=/** @type {import('./source-scene-region-program').RegionProgramObligation[]} */([]);
 if(proposal.programs!==undefined)for(const [index,program]of list(proposal.programs,24).entries()){
  try{
   parseSourceScenePlan({...proposal,programs:[...retainedPrograms,program],objects:retainedObjects,relations:retainedRelations},source);
   retainedPrograms.push(program);
  }catch(error){if(!expected(error))throw error;const code=detailCode(error);
   rejections.push({collection:'program',index,reason:'program-contract',detailCode:code==='contract'?'program-contract':code});
   if(code==='program-member'||code==='program-inventory-incomplete'){
    const retained=retainRegionProgramObligation(program,regionPlan,source.labelRefs,scopedIdentity);
    if(retained)pendingRegionPrograms.push({index,program:retained});
   }}
 }
 const plan=parseSourceScenePlan({...proposal,...(proposal.programs!==undefined?{programs:retainedPrograms}:{}),objects:retainedObjects,relations:retainedRelations},source);
 if(!plan)throw new TypeError("Scene plan admission is invalid");
 const initialObjects=plan.objects.map(object=>{
  const binding=bindings.get(object.id),owned=binding?{...object,parentObjectId:binding.parentObjectId}:object;
  if(!measurements||owned.kind!=='container'||owned.nativeGeometry?.kind!=='cylinder')return owned;
  const measured=proposeSourceCylinderTopology({object:owned,...measurements});
  if(measured.failure!==null||!measured.proposal){measurements.evidence.push({id:owned.id,failure:measured.failure??'topology-unavailable'});return owned;}
  const {proposal}=measured,owner=plan.regions.find(r=>r.id===owned.regionId),parent=owned.parentObjectId?plan.objects.find(o=>o.id===owned.parentObjectId):undefined;
  if(!owner||!contains(owner.box,proposal.box)||parent&&!contains(parent.box,proposal.box)){
   measurements.evidence.push({id:owned.id,failure:'topology-owner-containment'});return owned;
  }
  measurements.evidence.push({id:owned.id,failure:null,originalGeometry:owned.nativeGeometry,originalBox:owned.box,
   proposedGeometry:proposal.nativeGeometry,proposedBox:proposal.box,observedFaces:measured.observedFaces});
  return {...owned,...proposal,nativeGeometry:/** @type {NonNullable<SceneObject['nativeGeometry']>} */(parseSceneNativeGeometry(proposal.nativeGeometry))};
 });
 const admitted={...plan,objects:initialObjects,...(pendingRegionPrograms.length?{pendingRegionPrograms}:{}),admission:{complete:rejections.length===0,rejections,...(relationCandidates.length?{relationCandidates}:{})}};
 const localizationRows=['compact-v6','compact-v7'].includes(String(proposal.format))?rejections.filter(r=>r.collection==='relation'&&r.detailCode==='tuple').map(r=>({index:r.index,tuple:relations[r.index]})):[];
 const relationLocalizations=retainSceneRelationLocalizations(admitted,localizationRows,scopedIdentity);
 return initializeSceneObjectBatches({...admitted,admission:{...admitted.admission,...(relationLocalizations.length?{relationLocalizations}:{})}});
}
/** @typedef {{id:string,failure:string|null,originalGeometry?:SceneObject['nativeGeometry'],originalBox?:Box,proposedGeometry?:unknown,proposedBox?:Box,observedFaces?:number}} TopologyEvidence */
/** Source observation happens before the first object ledger is registered.
 * An existing admitted ledger is deliberately ineligible for a free rewrite.
 * @param {unknown} value @param {Parameters<typeof admitSourceScenePlan>[1]} source
 * @param {{image:import('../png').PngImage,textMasks:Box[]}} controls */
function admitSourceMeasuredScenePlan(value,source,controls){
 if(value!==undefined&&(!record(value)||value.objectBatches!==undefined||value.relationBatches!==undefined))throw new TypeError('Scene initial source proposal already admitted');
 const measuredControls=parseInitialSourceTopologyControls(controls);
 if(measuredControls.image.width!==source.widthPx||measuredControls.image.height!==source.heightPx)throw new TypeError('Scene initial source frame is invalid');
 /** @type {TopologyEvidence[]} */const observations=[];
 const opened=withSceneCompilationSession({image:measuredControls.image,sourceHash:source.sourceHash},state=>{
  const plan=admitSourceScenePlan(value,source,{image:state.image,budget:state.budget,textMasks:measuredControls.textMasks,evidence:observations});
  return {plan,sourceTopology:{sourceScanPixels:state.budget.used,authorityGranted:false,observations}};
 });
 return {...opened.result,compilationSession:opened.session};
}
const SCENE_PLAN_PROMPT=' Return "scene":{"format":"compact-v2","coordinateSpace":"normalized-1000","boxFormat":"ymin-xmin-ymax-xmax","regions":[],"objects":[],"relations":[]}. Use compact TUPLES to fit the existing output budget. Each box is [ymin,xmin,ymax,xmax] in normalized 0-1000 INTEGER coordinates: 0<=ymin<ymax<=1000 and 0<=xmin<xmax<=1000. OCR box_2d locations and scene boxes use the SAME normalized frame relative to the entire source image. Never output source pixels, [x,y,w,h] or [left,top,right,bottom]. Region tuple: [id,parentId,kind,box], kind section/card/container/diagram/table/unknown; parentId null or enclosing region ID. Inventory the entire page, including heading areas, side notes and lower sections, before allocating object slots. Create one page-level section region with box [0,0,1000,1000] and parentId null so every visible unit has a legal owner. Put major physical panel regions under this section; heading highlights, standalone notes and units outside those panels use this page-level section as regionId. The page-level section is semantic metadata and never authorizes a drawable background. Use section for semantic grouping only; use card/container for a major physical panel with a visible source boundary, including top-level panels. Such physical regions are measured by the compiler and do not need duplicate enclosing objects. Keep at most 24 regions. Object tuple: [id,regionId,kind,box], kind container/icon/unknown. Use objects for independent physical units inside regions and physical units that do not form a major region. Do not repeat a physical card/container region as a container object; reserve the same 64 object slots for node endpoints, heading highlights, badges and pictorial units across the entire page. Include visible independent panels with FULL source borders, and each independent pictorial icon INCLUDING icons INSIDE cards, panels, table cells and diagram nodes, excluding text. A containing card does not replace its icon object. Inventory containers and pictorial units separately; reserve capacity for both. Relation tuple: [id,regionId,fromId,toId,direction], direction forward/backward/both/unknown/undirected. undirected requires a complete observed connector with no arrowheads at either end; unknown means insufficient evidence and must never default to undirected. references MUST exist and MUST have actual visible connector evidence. Do not infer relations from reading order or neighboring icons. Use distinct IDs for regions and objects; parents must contain children and objects. HARD LIMIT 24 regions, 64 objects, 24 relations; return fewer uncertain objects instead of exceeding a limit. No source text, colors, explanations or generated images in scene.';
module.exports={parseSourceScenePlan,admitSourceScenePlan,admitSourceMeasuredScenePlan,containsSceneBox:contains,sceneObjectBatches,reconcileSceneLabelLayout,SCENE_PROGRAM_PROMPT,
 SCENE_PLAN_PROMPT:SCENE_PLAN_PROMPT.replace('"format":"compact-v2"','"format":"compact-v5"')
 .replace('HARD LIMIT 24 regions, 64 objects, 24 relations;',
  'HARD LIMIT 24 regions and 64 object proposals in THIS global batch; 24 relation proposals in THIS global batch. The two later local views share ONE consensus batch of at most 32 object proposals and 24 relation proposals, including repairs. The whole page is bounded by 96 explicit objects and 48 relations under validated source-bound batch ledgers. Additions, corrections and rejections consume shared slots without refunds. Count ALL source units independently even when this global batch cannot propose them all;')
 .replace('"regions":[],"objects":[],"relations":[]','"regions":[],"inventory":[],"objects":[],"relations":[]')
 .replace('Inventory the entire page, including heading areas, side notes and lower sections, before allocating object slots.',
  'Inventory the entire page, including heading areas, side notes and lower sections, before allocating object slots. inventory MUST contain exactly one tuple [regionId,visibleContainers,visibleIcons,visibleRelations] for EVERY region. Count independently from the capped objects/relations arrays, before choosing proposals. Counts cover only physical units owned DIRECTLY by that region, excluding the region panel itself and all units owned by child regions; do not count the same physical unit twice. Count embedded independent pictorial details even if their enclosing node is already counted. Count each visible physical connector once, including curves, dashed lines and return loops. Use null when the count is uncertain, 0 only when absence was observed, otherwise an integer 0-10000. Report the observed count even when it exceeds remaining proposal slots; this metadata grants no extra slots or pixel authority. Emit inventory after regions and before objects/relations.')
 .replace('Relation tuple: [id,regionId,fromId,toId,direction],',
  'Relation tuple: [id,regionId,fromId,toId,direction,shaftBox], shaftBox is a tight [ymin,xmin,ymax,xmax] box around the ONE original visible connector shaft and its arrowheads, excluding node bodies and labels; keep it inside regionId. This source-location proposal identifies which arrow this ID means in later crop review. It grants no shaft, direction, pixel ownership or attachment evidence. Never use a whole card as shaftBox, or reuse another arrow location to fill a relation slot.')
 .replace('Object tuple: [id,regionId,kind,box], kind container/icon/unknown.',
  'Object tuple: [id,regionId,kind,box,pictorialContent], kind container/icon/unknown. pictorialContent is present/absent/unknown: report whether this physical container visibly contains an independent pictorial detail distinct from its label, border and background. This is a scheduling hint, never another object or source-pixel authority. Use absent for an observed text-only start/end node or numbered badge, present for an observed embedded illustration, unknown when uncertain. Icons themselves use unknown. Keep separate icon objects in the SAME 64-object inventory; this hint cannot replace them or hide additional units.')
 .replace('Use objects for independent physical units inside regions and physical units that do not form a major region.',
  'Use objects for independent physical units inside regions and physical units without their own explicit physical region. Container regions may also describe physically enclosed labeled subpanels with multiple independent contents, using their actual enclosing parent region. Every such region must have an independently observed source surface or perimeter, is compiled and audited as a physical unit, and uses the SAME 24-region limit. Never relabel an independent icon as a region or hide independent child containers, icons or connectors inside a region label. Never duplicate a region perimeter as an object.')
 +' Count ONE coherent independent pictorial illustration with all of its detached details as ONE icon; colored patches, holes, strokes or path primitives inside that same illustration are parts, not independent icons. Independently meaningful physical diagram nodes and visible connectors remain separate nodes and relations; do not collapse their topology into an icon. First identify semantic ownership and physical nesting, then inventory the directly owned complete units at each level, then project the actual units into native regions, objects and connections. Independently observed counts remain exact requirements: never reduce counts to fit, invent a subpanel, omit a real unit or duplicate one across owners. Table-header recoveries consume remaining slots in the SAME 64-object budget. Optional internal pictorial recovery has the existing 32-target allowance shared with proposed icons; it cannot supply unlimited unlisted icons. An infeasible observation remains explicitly incomplete and must not be reported as a complete capped scene.'
 +' A connector endpoint MUST be a container or standalone icon object ID OR a card/container region ID when that physical region itself is the connected node. Keep its internal icon as a separate icon; never use that icon as the node and never duplicate a physical region as an endpoint object. Semantic section/diagram/table regions cannot be endpoints. A relation regionId MUST be the lowest common enclosing region that contains BOTH complete endpoint bodies AND its shaftBox. Count that connector only in this owner inventory, never again in endpoint regions or ancestor inventories. One bidirectional shaft with two heads is ONE physical relation; separate visible parallel shafts are separate relations even when they share endpoint IDs. Count each independent visible pictorial unit, including units at region boundaries; use null rather than a guessed zero if ownership or count is uncertain.'
 +' Labeled diagram nodes with a visible enclosing shape are containers too, even when they include a pictorial icon. Include these physical node boundaries before decorative pictorial units; keep their labels as OCR text. An icon object covers only the pictorial strokes, never an entire labeled node. Object regionId must ALWAYS reference an ID in regions; an enclosing node or panel object ID is never a regionId. For each actual connector, reference its actual physical container or standalone pictorial endpoint, not a number badge, embedded decoration or surrounding panel. Keep unenclosed pictorial endpoints as icons; native compilation must prove the complete shape before it grants any port. Preserve the whole-page 64-object and per-batch 24-relation limits; inventory counts must never be reduced to fit the proposal array. Before emitting tuples, inventory the workflow topology in EACH semantic section: physical node containers, visible connectors, then decorative pictorial units. Allocate the shared object capacity to connector endpoints before decoration; do not use a fixed container/icon split. A colored badge behind a number, or a highlight behind a heading, is a physical background container, not a pictorial icon; its glyphs belong to OCR or missingText. Missing OCR never turns visible glyphs into pictorial strokes. When visible connectors exist, output their source-evidenced relations and complete endpoint units before filling remaining capacity with decorative icons.'};


