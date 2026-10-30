// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {stageSceneSurfaceOwnership,sceneSurfaceOwnershipCost}=require('./source-scene-glyph-occlusion');
const {selectMeasuredSceneSurfaceChoices}=require('./source-scene-surface-selection');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {import('./source-scene-plan').SceneObject|{id:string,regionId:string,kind:string,box:Box}} Proposal */
/** @typedef {ReturnType<typeof import('./source-scene-measurement-cache').createSceneMeasurementCache>} Measurements */
/** @param {unknown} value */
function rgb(value){return typeof value==='string'&&/^#[a-f0-9]{6}$/iu.test(value)?[1,3,5].map(i=>Number.parseInt(value.slice(i,i+2),16)):null;}
/** Opt-in until real-page comparison and full Worker gates establish quality.
 * Read data properties only; a provider getter or proxy cannot execute here.
 * @param {unknown} input */
function readSceneSurfaceSelection(input){
 if(!record(input)||input.surfaceSelection!==undefined&&typeof input.surfaceSelection!=='boolean')
  throw new TypeError('Scene surface selection input is invalid');
 return input.surfaceSelection===true;
}
/** Independent source color determines how much a paint layer changes the
 * canvas. Pale fill cannot outrank a visible title solely by bounding area.
 * This is a selection estimate, never a new source-admission predicate.
 * @param {number} pixels @param {unknown} color @param {number[]|null} background */
function coverage(pixels,color,background){
 const fill=rgb(color),contrast=fill&&background?fill.reduce((sum,v,i)=>sum+Math.abs(v-(background[i]??0)),0)/765:1;
 return Math.max(1,Math.round(pixels*contrast));
}
/** Independently measure whole surface alternatives before selecting glyph
 * rights. Keep aliases on one private receipt and respect multi-face native
 * construction obligations. Only selected alternatives are later drawable.
 * Region labels, pictorial members and relations still need their original
 * separate completion checks; surface selection cannot declare a region done.
 * @param {{proposals:Proposal[],measurements:Measurements,glyphOcclusion:unknown,
 * slideSize:{widthPt:number,heightPt:number},relations:{fromId:string,toId:string}[],background:unknown}} input */
function prepareSceneSurfacePortfolio({proposals,measurements,glyphOcclusion,slideSize,relations,background}){
 const canvas=record(background)?rgb(background.fill):null,aliases=new Map(),
  candidates=/** @type {import('./source-scene-surface-selection').Candidate[]} */([]),
  rows=/** @type {{id:string,aliases:string[],coveragePixels:number,glyphCost:number,attachment:boolean,parts:number}[]} */([]);
 for(const proposal of proposals){
  if(proposal.kind!=='container')continue;
  if('nativeGeometry' in proposal&&proposal.nativeGeometry){
   const program=measurements.primitiveProgram(/** @type {import('./source-scene-plan').SceneObject} */(proposal),slideSize);
   if(program&&(program.failure===null&&'shapes' in program||program.constructed!==1))continue;
  }
  const key=`${proposal.box.x},${proposal.box.y},${proposal.box.w},${proposal.box.h}`,prior=aliases.get(key);
  const required=relations.some(r=>r.fromId===proposal.id||r.toId===proposal.id)
   ||proposals.some(p=>'parentObjectId' in p&&p.parentObjectId===proposal.id);
  if(prior){prior.row.aliases.push(proposal.id);if(required&&prior.hasFrame){prior.row.attachment=true;prior.candidate.attachment=true;}continue;}
  const staged=stageSceneSurfaceOwnership(glyphOcclusion,()=>{
   const surface=measurements.surface(proposal.box);
   const pattern=!surface.outline&&(!surface.measured||surface.measured.parts)?measurements.pattern(proposal.box):null;
   return {surface,pattern,hasFrame:!!(pattern?measurements.patternFrame(proposal.box):measurements.portFrame(proposal.box))};
  });
  const {surface,pattern,hasFrame}=staged.value,fit=surface.measured,outline=surface.outline;
  if(!fit&&!outline&&!pattern)continue;
  const pixels=fit?fit.box.w*fit.box.h*fit.support:outline?
   outline.fill==='none'?outline.sourcePixels.length:outline.box.w*outline.box.h:pattern?.sourcePixels.length??0;
  const color=fit?.fill??(outline?.fill==='none'?outline.color:outline?.fill)??pattern?.color;
  const candidate={id:proposal.id,coveragePixels:coverage(pixels,color,canvas),attachment:required&&hasFrame,receipt:staged.receipt};
  const row={id:proposal.id,aliases:/** @type {string[]} */([]),coveragePixels:candidate.coveragePixels,
   glyphCost:sceneSurfaceOwnershipCost(glyphOcclusion,staged.receipt),attachment:candidate.attachment,parts:fit?.parts?.length??1};
  candidates.push(candidate);rows.push(row);aliases.set(key,{row,candidate,hasFrame});
 }
 const choice=selectMeasuredSceneSurfaceChoices(glyphOcclusion,candidates),selected=new Set(choice.selected),denied=new Set();
 for(const row of rows)if(!selected.has(row.id))for(const id of [row.id,...row.aliases])denied.add(id);
 return {denied,evidence:{basis:'measured-source-paint-contrast',completeRegionSelection:false,
  measured:rows.length,selected:choice.selected,rejected:choice.rejected,rows}};
}
module.exports={prepareSceneSurfacePortfolio,readSceneSurfaceSelection};
