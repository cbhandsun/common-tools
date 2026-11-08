// @ts-check
"use strict";
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {containsSceneBox}=require('./source-scene-plan');
const {readStructuralObservations}=require('./source-scene-structural-review');
const {sceneObjectLimit}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{index:number,regionId:string,box:Box,boundaryReview?:boolean}} Target */
/** @typedef {{confidence:number,box:Box|null,rejection?:string}} Boundary */
/** All immutable references must be visible in the actual source crop, even
 * when the proposed enclosing region is misplaced. This expands observation
 * context only; it never moves a member, owner, candidate or independent census.
 * The shared allocator charges the complete resulting context or defers it.
 * @param {import('./source-scene-regional-inventory').Target} target @returns {Box} */
function sceneRegionalReviewContext(target){
 if(!record(target)||!validBox(target.box)||target.programTask!==undefined&&!record(target.programTask))throw new TypeError('Scene regional context is invalid');
 /** @type {Box[]} */const boxes=[target.box];
 const groups=[target.endpoints??[],target.boundaryMembers??[],target.programTask?.labels??[]];
 for(const [index,group]of groups.entries()){
  if(!list(group)||group.length>(index===2?512:64))throw new TypeError('Scene regional context references are invalid');
  for(const member of group){if(!record(member)||!validBox(member.box))throw new TypeError('Scene regional context reference is invalid');boxes.push(member.box);}
 }
 if(boxes.some(b=>b.x+b.w>16384||b.y+b.h>16384))throw new TypeError('Scene regional context frame is invalid');
 // Observation crops use integral source cells. Round the envelope outward
 // before subtraction, so cancellation cannot leave its far edge one ULP
 // inside a member. This is the same window the crop allocator already reads;
 // candidate geometry and strict containment validation remain unchanged.
 const x=Math.floor(Math.min(...boxes.map(b=>b.x))),y=Math.floor(Math.min(...boxes.map(b=>b.y)));
 return {x,y,w:Math.ceil(Math.max(...boxes.map(b=>b.x+b.w)))-x,h:Math.ceil(Math.max(...boxes.map(b=>b.y+b.h)))-y};
}
/** A boundary uses its existing regional target's exact source/atlas mapping.
 * It grants no source pixels, physical perimeter, fill, type or deletion right.
 * @param {unknown} raw @param {Target} target
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame
 * @returns {Boundary} */
function readSceneRegionBoundary(raw,target,frame){
 if(!record(raw)||Object.keys(raw).length!==2||!Object.hasOwn(raw,'confidence')||!Object.hasOwn(raw,'box_2d'))
  throw new TypeError('Scene regional boundary observation is invalid');
 const row=readStructuralObservations({structures:[{index:target.index,kind:'container',regionId:target.regionId,
  confidence:raw.confidence,box_2d:raw.box_2d}]},[{...target,objectId:target.regionId}],frame)[0];
 if(!row)throw new TypeError('Scene regional boundary observation is invalid');
 return {confidence:row.confidence,box:row.box,...(row.rejection?{rejection:row.rejection}:{})};
}
/** @param {Box} a @param {Box} b */
function iou(a,b){const shared=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))
 *Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return shared/(a.w*a.h+b.w*b.h-shared);}
/** Apply after all local object/topology proposals: those receipts still bind
 * their original regional envelopes. A corrected envelope preserves EVERY
 * descendant, object, relation control, program, label ref and census. Final
 * source compilation and completion remain mandatory under the same budgets.
 * @param {Plan} plan @param {Target[]} targets
 * @param {{index:number,boundary?:Boundary}[][]} observations */
function applySceneRegionBoundaryReview(plan,targets,observations){
 if(!record(plan)||!list(plan.regions)||plan.regions.length>24||!list(plan.objects)||plan.objects.length>sceneObjectLimit(plan)||!list(plan.relations)||plan.relations.length>48
  ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||[...plan.regions,...plan.objects,...plan.relations].some(r=>!record(r))
  ||[...plan.regions,...plan.objects].some(r=>!validBox(r.box))
  ||plan.relations.some(r=>r.shaftBox!==undefined&&!validBox(r.shaftBox)||r.visiblePath!==undefined&&(!record(r.visiblePath)
   ||!list(r.visiblePath.vertices)||r.visiblePath.vertices.length>16||r.visiblePath.vertices.some(p=>!record(p)||![p.x,p.y].every(Number.isFinite))))
  ||!list(targets)||targets.length>32||targets.some(t=>!record(t)||!validBox(t.box))
  ||!list(observations)||observations.length!==2||observations.some(rows=>!list(rows)||rows.length!==targets.length
   ||rows.some(r=>!record(r)||!Number.isSafeInteger(r.index)||r.boundary!==undefined&&(!record(r.boundary)
    ||typeof r.boundary.confidence!=='number'||!Number.isFinite(r.boundary.confidence)||r.boundary.confidence<0||r.boundary.confidence>1
    ||r.boundary.box!==null&&!validBox(r.boundary.box)))))throw new TypeError('Scene regional boundary consensus is invalid');
 const ids=new Set();for(const target of targets){
  if(!Number.isSafeInteger(target.index)||target.index<0||target.index>=512||ids.has(target.index)||typeof target.regionId!=='string'
   ||target.boundaryReview!==undefined&&typeof target.boundaryReview!=='boolean')throw new TypeError('Scene regional boundary binding is invalid');
  ids.add(target.index);
 }
 if(observations.some(rows=>new Set(rows.map(r=>r.index)).size!==targets.length||rows.some(r=>!ids.has(r.index))))
  throw new TypeError('Scene regional boundary binding is invalid');
 const regions=plan.regions.map(r=>({...r,box:{...r.box}})),byId=new Map(regions.map(r=>[r.id,r]));
 if(byId.size!==regions.length)throw new TypeError('Scene regional boundary tree is invalid');
 for(const region of regions){
  let current=region;const visited=new Set([current.id]);
  while(current.parentId!==null){const parent=byId.get(current.parentId);
   if(!parent||visited.has(parent.id)||!containsSceneBox(parent.box,current.box))throw new TypeError('Scene regional boundary tree is invalid');
   visited.add(parent.id);current=parent;
  }
 }
 const evidence={proposed:targets.filter(t=>t.boundaryReview).length,corrected:/** @type {{id:string,previousBox:Box,box:Box}[]} */([]),
  rejected:/** @type {{id:string,reason:string}[]} */([])};
 for(const target of targets){
  if(!target.boundaryReview)continue;
  const region=byId.get(target.regionId),a=observations[0]?.find(r=>r.index===target.index)?.boundary,
   b=observations[1]?.find(r=>r.index===target.index)?.boundary;
  if(!region||!['card','container'].includes(region.kind)||region.parentId===null
   ||['x','y','w','h'].some(k=>region.box[/** @type {keyof Box} */(k)]!==target.box[/** @type {keyof Box} */(k)]))
   throw new TypeError('Scene regional boundary binding is invalid');
  const decline=(/** @type {string} */reason)=>evidence.rejected.push({id:region.id,reason});
  if(!a||!b||a.rejection||b.rejection||!a.box||!b.box){decline('source-observation');continue;}
  if(a.confidence<.9||b.confidence<.9){decline('confidence');continue;}
  if(iou(a.box,b.box)<.85){decline('geometry-consensus');continue;}
  const first=a.box,second=b.box,parent=byId.get(region.parentId);
  if(!parent||!containsSceneBox(parent.box,first)||!containsSceneBox(parent.box,second)
   ||first.x+first.w>plan.widthPx||first.y+first.h>plan.heightPx||second.x+second.w>plan.widthPx||second.y+second.h>plan.heightPx){decline('source-owner');continue;}
  const members=[...regions.filter(r=>r.parentId===region.id).map(r=>r.box),...plan.objects.filter(o=>o.regionId===region.id).map(o=>o.box),
   ...plan.relations.filter(r=>r.regionId===region.id&&r.shaftBox).map(r=>/** @type {Box} */(r.shaftBox))];
  const turns=plan.relations.filter(r=>r.regionId===region.id).flatMap(r=>r.visiblePath?.vertices??[]);
  const inside=(/** @type {Box} */box)=>members.every(m=>containsSceneBox(box,m))
   &&turns.every(p=>p.x>=box.x&&p.y>=box.y&&p.x<=box.x+box.w&&p.y<=box.y+box.h);
  if(!inside(first)||!inside(second)){decline('region-members');continue;}
  // Without declared member anchors a shifted hypothesis must retain the
  // original seed. No content can be removed to make a correction acceptable.
  if(!members.length&&!containsSceneBox(first,{x:region.box.x+region.box.w/2,y:region.box.y+region.box.h/2,w:1e-6,h:1e-6})){
   decline('source-seed');continue;
  }
  if(['x','y','w','h'].every(k=>region.box[/** @type {keyof Box} */(k)]===first[/** @type {keyof Box} */(k)]))continue;
  evidence.corrected.push({id:region.id,previousBox:{...region.box},box:{...first}});region.box={...first};
 }
 return {plan:evidence.corrected.length?{...plan,regions}:plan,evidence};
}
module.exports={readSceneRegionBoundary,applySceneRegionBoundaryReview,sceneRegionalReviewContext};
