// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {retainedOpenScenePaint}=require('./source-scene-open-paint');
const {retainedSceneLiteralPaint}=require('./source-scene-literal-paint');
const {prepareRegionProgramLabels}=require('./source-scene-region-program');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {{id?:string,box:import('./source-scene-plan').Box,source?:Record<string,unknown>,style?:Record<string,unknown>}} Item */
/** @typedef {{shapes:Item[],images:Item[],textBoxes:Parameters<typeof prepareRegionProgramLabels>[0]['textBoxes']}} Page */
/** A retained member observation is NOT an owner-source or completion receipt.
 * It must be combined with a complete source census by its future consumer.
 * @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,plan:string,
 * page:Page,snapshots:Map<object,string>,members:string[],ownerId:string,
 * sourceFailures:{id:string,reason:string}[]}>} */
const observations=new WeakMap();
/** @param {unknown} value @returns {value is string} */
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(value);
/** Snapshot source metadata as well as geometry and paint. The bounded
 * snapshotter rejects nested getters/proxies/cycles without evaluating them.
 * @param {unknown} item */
function snapshot(item){
 if(!record(item)||item.source!==undefined&&!record(item.source)||item.style!==undefined&&!record(item.style))return null;
 return sceneGroupSnapshot({...item,source:{},style:{paint:item.style,source:item.source}});
}
/** @param {unknown} plan */
function planSnapshot(plan){return sceneGroupSnapshot({source:{},style:{plan}});}
/** Copy only a genuine, ordinary compiler map. Invoking an overridden iterator
 * or trusting a provider's serialized member list cannot capture a map.
 * @param {unknown} value @returns {Map<string,string[]>} */
function memberMap(value){
 if(!types.isMap(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Map.prototype||Reflect.ownKeys(value).length)
  throw new TypeError('Open owner member map is invalid');
 const result=new Map();
 for(const [key,members]of Map.prototype.entries.call(value)){
  if(result.size>=176||!id(key)||!list(members)||members.length<1||members.length>10000||members.some(m=>!id(m))
   ||new Set(members).size!==members.length)throw new TypeError('Open owner member map is invalid');
  result.set(key,members.slice());
 }
 return result;
}
/** @param {unknown} value @returns {Page} */
function pageInput(value){
 /** @param {unknown} item */const drawable=item=>{
  if(!record(item)||!record(item.box))return false;const bounds=item.box;
  return ['x','y','w','h'].every(k=>typeof bounds[k]==='number'&&Number.isFinite(bounds[k]));
 };
 if(!record(value)||![value.shapes,value.images,value.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(drawable))
  ||Number(/** @type {unknown[]} */(value.shapes).length)+Number(/** @type {unknown[]} */(value.images).length)+Number(/** @type {unknown[]} */(value.textBoxes).length)>10000)
  throw new TypeError('Open owner native page is invalid');
 if(/** @type {unknown[]} */(value.textBoxes).some(item=>!record(item)||typeof item.text!=='string'))throw new TypeError('Open owner native labels are invalid');
 return /** @type {Page} */(value);
}
/** Inspect the entire semantic owner subtree against the actual outputs and
 * THIS invocation's compiler maps. Counts and public source flags are never
 * substituted for any declared child, descendant object, endpoint or relation.
 * No grouping, drawing, mutation, opacity, ports or owner completion is granted.
 * @param {unknown} request */
function observeOpenSceneOwnerMembers(request){
 if(!record(request)||Reflect.ownKeys(request).some(k=>typeof k!=='string'||!['image','paintReceipt','paintParts','literalPaint','plan','ownerId','page','objects','relations','unresolved','slideSize'].includes(k))
  ||!record(request.image)||!record(request.plan)||!id(request.ownerId)||!list(request.paintParts)||!record(request.slideSize)
  ||!list(request.unresolved)||request.unresolved.length>10000||request.unresolved.some(f=>!record(f)||!id(f.id)||typeof f.reason!=='string'))
  throw new TypeError('Open owner member controls are invalid');
 const image=/** @type {import('../png').PngImage} */(request.image),raw=request.plan;
 if(!list(raw.regions)||raw.regions.length>24||!list(raw.objects)||raw.objects.length>128||!list(raw.relations)||raw.relations.length>48
  ||!list(raw.regionPrograms)||raw.regionPrograms.length>24||typeof raw.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(raw.sourceHash)
  ||raw.widthPx!==image.width||raw.heightPx!==image.height)
  throw new TypeError('Open owner member plan is invalid');
 for(const rows of [raw.regions,raw.objects,raw.relations])if(rows.some(r=>!record(r)||!id(r.id)))throw new TypeError('Open owner member identity is invalid');
 const regions=/** @type {Plan['regions']} */(raw.regions),objects=/** @type {Plan['objects']} */(raw.objects),relations=/** @type {Plan['relations']} */(raw.relations);
 const regionIds=new Set(regions.map(r=>r.id)),objectIds=new Set(objects.map(o=>o.id));
 if(regionIds.size!==regions.length||objectIds.size!==objects.length||new Set(relations.map(r=>r.id)).size!==relations.length
  ||new Set([...regionIds,...objectIds,...relations.map(r=>r.id)]).size!==regions.length+objects.length+relations.length
  ||regions.some(r=>typeof r.kind!=='string'||!validBox(r.box)||r.parentId!==null&&!regionIds.has(r.parentId))
  ||objects.some(o=>typeof o.kind!=='string'||!validBox(o.box)||!regionIds.has(o.regionId)||o.parentObjectId!==undefined&&!objectIds.has(o.parentObjectId))
  ||relations.some(r=>!regionIds.has(r.regionId)||![r.fromId,r.toId].every(endpoint=>regionIds.has(endpoint)||objectIds.has(endpoint))))
  throw new TypeError('Open owner member topology is invalid');
 // Check every ancestry, including unrelated rows, before traversing a subtree.
 for(const region of regions){const seen=new Set();let current=region;
  while(current.parentId!==null){if(seen.has(current.id))throw new TypeError('Open owner member topology is cyclic');seen.add(current.id);
   const parent=regions.find(r=>r.id===current.parentId);if(!parent)throw new TypeError('Open owner member parent is invalid');current=parent;}
 }
 for(const object of objects){const seen=new Set();let current=object;
  while(current.parentObjectId!==undefined){if(seen.has(current.id))throw new TypeError('Open owner object topology is cyclic');seen.add(current.id);
   const parent=objects.find(o=>o.id===current.parentObjectId);if(!parent||parent.regionId!==object.regionId)throw new TypeError('Open owner object parent is invalid');current=parent;}
 }
 const plan=/** @type {Plan} */(raw),page=pageInput(request.page),size=/** @type {{widthPt:number,heightPt:number}} */(request.slideSize);
 const labels=prepareRegionProgramLabels(page,plan,size);
 const owner=regions.find(r=>r.id===request.ownerId);
 if(!owner||owner.kind!=='container')throw new TypeError('Open owner member owner is invalid');
 const paint=retainedOpenScenePaint(image,request.paintReceipt,request.paintParts);
 if(!paint||paint.ownerId!==owner.id)return {failure:'open-owner-paint-binding'};
 let literalParts=/** @type {unknown[]} */([]);
 if(request.literalPaint!==undefined){
  const literal=request.literalPaint;
  if(!record(literal)||Reflect.ownKeys(literal).some(k=>k!=='receipt'&&k!=='parts')||!list(literal.parts))throw new TypeError('Open owner literal paint controls are invalid');
  if(!retainedSceneLiteralPaint(image,literal.receipt,literal.parts))return {failure:'open-owner-literal-binding'};
  literalParts=literal.parts;
 }
 if(request.paintParts.length+literalParts.length>32)throw new TypeError('Open owner paint capacity is invalid');
 const objectMembers=memberMap(request.objects),relationMembers=memberMap(request.relations);
 const subtree=new Set([owner.id]);let changed=true;
 while(changed){changed=false;for(const r of regions)if(r.parentId!==null&&subtree.has(r.parentId)&&!subtree.has(r.id)){subtree.add(r.id);changed=true;}}
 const requiredObjects=[...regions.filter(r=>r.id!==owner.id&&subtree.has(r.id)&&['card','container'].includes(r.kind)).map(r=>r.id),
  ...objects.filter(o=>subtree.has(o.regionId)).map(o=>o.id)];
 const requiredRelations=relations.filter(r=>subtree.has(r.regionId));
 const requiredUnitIds=new Set([...subtree,...requiredObjects,...requiredRelations.map(r=>r.id)]);
 const missing=new Set();
 /** Keep the owner's unresolved SOURCE obligations separate from missing
  * descendants. They still fail the result and never authorize completion.
  * In particular, literal open paint must not masquerade as a passed closed
  * perimeter, nor must that perimeter failure imply missing native children.
  * @type {{id:string,reason:string}[]} */
 const sourceFailures=[];
 for(const regionId of subtree)if(!plan.regionPrograms?.some(p=>p.regionId===regionId))missing.add(regionId+':region-program');
 for(const f of request.unresolved)if(record(f)&&typeof f.id==='string'&&typeof f.reason==='string'&&requiredUnitIds.has(f.id)){
  if(f.id===owner.id)sourceFailures.push({id:f.id,reason:f.reason});else missing.add(f.id);
 }
 for(const f of labels.evidence.rejected)if(subtree.has(f.regionId))missing.add(f.regionId+':source-label-binding');
 const outputs=[...page.shapes,...page.images,...page.textBoxes],byId=new Map();
 for(const item of outputs)if(item.id){const rows=byId.get(item.id)??[];rows.push(item);byId.set(item.id,rows);}
 const members=new Set();const claimed=new Map();
 /** @param {string} unit @param {Map<string,string[]>} map */
 const requireUnit=(unit,map)=>{
  const names=map.get(unit);if(!names?.length){missing.add(unit);return;}
  for(const name of names){const rows=byId.get(name);
   if(rows?.length!==1||!page.shapes.includes(rows[0])){missing.add(unit);continue;}
   const other=claimed.get(name);if(other!==undefined&&other!==unit){missing.add(unit);missing.add(other);}
   claimed.set(name,unit);members.add(rows[0]);
  }
 };
 for(const unit of requiredObjects)requireUnit(unit,objectMembers);
 for(const relation of requiredRelations){requireUnit(relation.id,relationMembers);
  requireUnit(relation.fromId,objectMembers);requireUnit(relation.toId,objectMembers);
 }
 for(const part of [...request.paintParts,...literalParts]){
  if(!record(part)||typeof part.id!=='string'||byId.get(part.id)?.length!==1||!page.shapes.some(item=>item===part))missing.add(owner.id+':paint-member');
  else if(claimed.has(part.id))missing.add(owner.id+':borrowed-paint-member');
  else members.add(part);
 }
 const labelRefs=new Set((plan.regionPrograms??[]).filter(p=>subtree.has(p.regionId)).flatMap(p=>p.labels.flatMap(l=>l.refs)));
 for(const text of page.textBoxes)if(typeof text.source?.ocrLabelRef==='string'&&labelRefs.has(text.source.ocrLabelRef))members.add(text);
 if(missing.size)return {failure:'open-owner-members-incomplete',missing:[...missing]};
 // Recovered interior parts need not have separate proposed object slots.
 // Preserve every final drawable too, so their geometry/metadata cannot be
 // changed after this check merely because they were absent from the map.
 const snapshots=new Map();for(const item of outputs){const value=snapshot(item);if(value===null)return {failure:'open-owner-member-snapshot'};snapshots.set(item,value);}
 const planState=planSnapshot(plan);if(planState===null)return {failure:'open-owner-plan-snapshot'};
 const memberIds=[...members].map(item=>/** @type {Item} */(item).id).filter(id);
 const receipt=Object.freeze({});observations.set(receipt,{pixels:image.rgba,width:image.width,height:image.height,plan:planState,
  page:{shapes:page.shapes.slice(),images:page.images.slice(),textBoxes:page.textBoxes.slice()},snapshots,members:memberIds,ownerId:owner.id,sourceFailures});
 return {failure:sourceFailures.length?'open-owner-source-unresolved':null,receipt,ownerId:owner.id,members:memberIds.slice(),
  membershipComplete:true,sourceFailures:sourceFailures.map(f=>({...f})),ownerCompleted:false,portsAuthorized:false,opaqueBodyAuthorized:false};
}
/** Retain final membership, source snapshots and complete output order, not
 * merely IDs or object counts. A copied/replaced/mutated member or reordering
 * against even an unrelated drawable invalidates this observation.
 * @param {unknown} image @param {unknown} receipt @param {unknown} plan @param {unknown} output */
function retainedOpenSceneOwnerMembers(image,receipt,plan,output){
 const proof=receipt!==null&&typeof receipt==='object'?observations.get(receipt):undefined;
 if(!proof||!record(image)||image.rgba!==proof.pixels||image.width!==proof.width||image.height!==proof.height||planSnapshot(plan)!==proof.plan||!record(output))return null;
 for(const key of /** @type {const} */(['shapes','images','textBoxes'])){
  const rows=output[key],before=proof.page[key];if(!list(rows)||rows.length!==before.length||rows.some((item,i)=>item!==before[i]))return null;
 }
 for(const [item,before]of proof.snapshots)if(snapshot(item)!==before)return null;
 return {ownerId:proof.ownerId,members:proof.members.slice(),membershipComplete:true,
  sourceFailures:proof.sourceFailures.map(f=>({...f})),ownerCompleted:false};
}
module.exports={observeOpenSceneOwnerMembers,retainedOpenSceneOwnerMembers};
