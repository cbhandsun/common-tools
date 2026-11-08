// @ts-check
"use strict";
const {sourceGroupTextPolygon,record}=require('./source-scene-group-containment');
const {measuredSceneContainsGroup,measuredSceneGroupBounds}=require('./source-scene-port-evidence');
const {nativeGroupPaintBounds,nativeLinePaintDisjoint}=require('./native-group-paint-bounds');
const {applySourceOutlinePaint}=require('./source-outline-paint-shapes');
const {nativeFilledPathDisjoint}=require('./native-filled-path-overlap');
const {sceneCropPaintDisjoint}=require('./source-crop-paint-overlap');
const {measuredSceneBackgroundMembers,rebindSceneBackgroundMember}=require('./source-scene-background-members');
const {measuredSceneParentMembers:patternedSceneParentMembers,rebindMeasuredSceneParentMembers:rebindPatternedSceneParentMembers}=require('./source-scene-parent-members');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id?:string,type?:string,box:Box,source?:Record<string,unknown>,rotation?:number,style?:Record<string,unknown>}} Item */
/** @param {Box} a @param {Box} b */
function overlaps(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
/** A bbox overlap is only a possible paint conflict. Hollow native fills can
 * prove separation without changing any geometry, source ownership or order.
 * @param {Item} a @param {Item} b @param {{used:number,exhausted:boolean}} work @param {unknown} [cropPaintToken] */
function paintConflict(a,b,work,cropPaintToken){const ab=nativeGroupPaintBounds(a),bb=nativeGroupPaintBounds(b);
 if(!ab||!bb)return true;
 return overlaps(ab,bb)&&!nativeLinePaintDisjoint(a,bb,work)&&!nativeLinePaintDisjoint(b,ab,work)
  &&!nativeFilledPathDisjoint(a,bb,work)&&!nativeFilledPathDisjoint(b,ab,work)
  &&!sceneCropPaintDisjoint(cropPaintToken,a,bb,work)&&!sceneCropPaintDisjoint(cropPaintToken,b,ab,work);}
/** The builder emits an atomic group at its first shape. Reject any grouping
 * which reverses overlapping drawable order. Source identity and paint order
 * are separate predicates; a bounding box never grants graphic ownership.
 * @template {Item} T
 * @param {{image:import('../png').PngImage,slideSize:{widthPt:number,heightPt:number},shapes:Item[],images:Item[],textBoxes:T[],physicalNodes:{proposalId:string,node:{box:Box,portFrame:object|null,parentPaint?:unknown}}[],outlinePaints?:Map<string,import('./source-outline-paint').Paint>,cropPaintToken?:unknown,initialGeometryChecks?:number}} input */
function bindSourceScenePhysicalGroups({image,slideSize,shapes,images,textBoxes,physicalNodes,outlinePaints,cropPaintToken,initialGeometryChecks=0}){
 if(!Number.isSafeInteger(initialGeometryChecks)||initialGeometryChecks<0||initialGeometryChecks>4000000)throw new TypeError('Scene physical geometry budget is invalid');
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 const evidence={physicallyMatchedText:0,physicallyGroupedText:0,physicalGroups:0,physicalGroupPaintConflicts:0,
  physicalGroupGeometryChecks:0,physicalGroupSkippedGeometry:0};
 const work={used:initialGeometryChecks,exhausted:false};
 // The writer paints these disjoint pieces, while the temporary measurement
 // anchor may still have a solid fill until final emission. Decide ordering
 // from that same emitted paint without changing membership or source claims.
 const projected=outlinePaints?applySourceOutlinePaint(shapes,outlinePaints):null;
 /** @param {Item} a @param {Item} b @param {unknown} [cropToken] */
 const conflict=(a,b,cropToken)=>
  (projected?.members.get(a)??[a]).some(p=>(projected?.members.get(b)??[b]).some(q=>paintConflict(p,q,work,cropToken)));
 /** @type {Map<string,number[]>} */const labels=new Map();
 // A measured multi-face parent is an atomic drawable even without a label.
 // The private source receipt below still validates every surviving member
 // and the same paint-order check; the public group id grants no membership.
 for(const owner of physicalNodes)if(owner.node.parentPaint!==undefined)labels.set(owner.proposalId,[]);
 const bodies=physicalNodes.flatMap(p=>{const bounds=measuredSceneGroupBounds(image,p.node.portFrame);
  return bounds?[{proposalId:p.proposalId,node:{...p.node,box:bounds}}]:[];});
 for(const [index,text]of textBoxes.entries()){
  if(!record(text.source)||text.source.nativeComponentGroupId!==undefined)continue;
  const polygon=sourceGroupTextPolygon(text.source,sx,sy);if(!polygon)continue;
  const matches=bodies.filter(p=>measuredSceneContainsGroup(image,p.node.portFrame,p.node.box,polygon,work))
   .sort((a,b)=>a.node.box.w*a.node.box.h-b.node.box.w*b.node.box.h);
  if(work.exhausted){evidence.physicalGroupSkippedGeometry=textBoxes.length-index;break;}
  const owner=matches[0];if(!owner)continue;
  // Only nested enclosing bodies are unambiguous. Equal/intersecting source
  // bodies must not be selected by provider enumeration order.
  if(matches.slice(1).some(other=>other.node.box.w*other.node.box.h<=owner.node.box.w*owner.node.box.h
   ||!measuredSceneContainsGroup(image,other.node.portFrame,other.node.box,[{x:owner.node.box.x,y:owner.node.box.y},
    {x:owner.node.box.x+owner.node.box.w,y:owner.node.box.y},{x:owner.node.box.x+owner.node.box.w,y:owner.node.box.y+owner.node.box.h},
    {x:owner.node.box.x,y:owner.node.box.y+owner.node.box.h}],work)))continue;
  if(work.exhausted){evidence.physicalGroupSkippedGeometry=textBoxes.length-index;break;}
  const group=labels.get(owner.proposalId)||[];group.push(index);labels.set(owner.proposalId,group);evidence.physicallyMatchedText++;
 }
 const backgrounds=measuredSceneBackgroundMembers({image,slideSize,shapes,physicalNodes,work});
 const groupedShapes=shapes.slice(),groupedTexts=textBoxes.slice();
 /** @type {{id:string,shapeIndices:number[],textIndices:number[]}[]} */const accepted=[];
 for(const [proposalId,indices]of labels){
  if(!/^[A-Za-z0-9_-]{1,96}$/u.test(proposalId))continue;
  const owners=physicalNodes.filter(p=>p.proposalId===proposalId),parentPaint=owners.length===1?owners[0]?.node.parentPaint:undefined;
  const admitted=parentPaint===undefined?null:patternedSceneParentMembers(image,parentPaint,proposalId,shapes);
  if(parentPaint!==undefined&&!admitted)continue;
  const members=shapes.map((s,i)=>(admitted?admitted.includes(s):s.id===`scene-container-${proposalId}`||s.id===`scene-outline-${proposalId}`)
   ||backgrounds.get(proposalId)?.includes(s)?i:-1).filter(i=>i>=0);
  const first=members[0];if(first===undefined||!admitted&&members.some(i=>shapes[i]?.source?.nativeComponentGroupId!==undefined))continue;
  const memberSet=new Set(members);
  if(admitted){const groups=/** @type {Set<unknown>} */(new Set(admitted.map(s=>s.source?.nativeComponentGroupId).filter(g=>g!==undefined)));
   if([...shapes,...images].some(s=>groups.has(s.source?.nativeComponentGroupId)&&!admitted.includes(s))
    ||textBoxes.some(t=>groups.has(t.source?.nativeComponentGroupId)))continue;
  }
  const conflictFound=members.some(i=>{
   const moved=shapes[i];return moved&&shapes.slice(first+1,i).some((other,j)=>!memberSet.has(first+1+j)&&conflict(moved,other));
  })||indices.some(i=>{const moved=textBoxes[i];return !moved||shapes.slice(first+1).some((s,j)=>!memberSet.has(first+1+j)&&conflict(moved,s))
   ||images.some(other=>conflict(moved,other,cropPaintToken))||textBoxes.some((other,j)=>!indices.includes(j)&&conflict(moved,other));});
  if(conflictFound){evidence.physicalGroupPaintConflicts++;continue;}
  const nativeComponentGroupId=`scene-unit-${proposalId}`;
  for(const i of members){const item=shapes[i];if(item){const grouped={...item,source:{...item.source,nativeComponentGroupId}};
   groupedShapes[i]=grouped;rebindSceneBackgroundMember(image,item,grouped,proposalId);}}
  for(const i of indices){const item=textBoxes[i];if(item)groupedTexts[i]={...item,source:{...item.source,nativeComponentGroupId}};}
  accepted.push({id:nativeComponentGroupId,shapeIndices:members,textIndices:indices});
  evidence.physicalGroups++;evidence.physicallyGroupedText+=indices.length;
 }
 for(const p of physicalNodes)if(p.node.parentPaint!==undefined)
  rebindPatternedSceneParentMembers(image,p.node.parentPaint,p.proposalId,shapes,groupedShapes);
 evidence.physicalGroupGeometryChecks=work.used;
 const painted=outlinePaints?applySourceOutlinePaint(groupedShapes,outlinePaints):null;
 const groups=accepted.map(group=>({id:group.id,members:[...group.shapeIndices.flatMap(i=>{
  const item=groupedShapes[i];return item?painted?.members.get(item)??[item]:[];
 }),...group.textIndices.flatMap(i=>groupedTexts[i]?[groupedTexts[i]]:[])]}));
 // These exact members passed private source containment and paint ordering.
 // A text-only unit needs the same final retention as a pictorial unit.
 return {shapes:painted?.shapes??groupedShapes,textBoxes:groupedTexts,evidence:{...evidence,...painted?.evidence},
  sealGroups:(/** @type {{shapes:Item[],images:Item[],textBoxes:Item[]}} */page)=>
   require('./source-scene-group-retention').sealMeasuredSceneGroups(page,groups,work.used,cropPaintToken)};
}
module.exports={bindSourceScenePhysicalGroups,paintConflict};
