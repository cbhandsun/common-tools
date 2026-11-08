// @ts-check
"use strict";
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {sourceLabelIdentity}=require('./source-label-identity');
const {sceneRelationBatches}=require('./source-scene-relation-batches');
const {sceneObjectLimit}=require('./source-scene-object-batches');
const {reconcileSceneLabelLayout}=require('./source-scene-label-layout');
const {parsePositionedTextFontOverride}=require('../typography/positioned-text-font-override');
const obligations=require('./source-scene-program-obligations');
/** Typography may replace a label, but serialized identity cannot do so.
 * @type {WeakMap<object,object>} */const labelOrigins=new WeakMap();
/** @param {object} label */
function sceneRegionLabelOrigin(label){return labelOrigins.get(label)??label;}
/** @typedef {{refs:string[],family?:string,weight?:'regular'|'bold',sizePt?:number,role?:string}} LabelStyle */
/** @typedef {{regionId:string,objects:string[],relations:string[],labels:LabelStyle[]}} RegionProgram */
/** @typedef {import('./source-scene-program-obligations').RegionProgramObligation} RegionProgramObligation */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{id?:string,text:string,box:Box,font?:Record<string,unknown>,source?:Record<string,unknown>,positionedRuns?:Record<string,unknown>[],runs?:Record<string,unknown>[]}} NativeLabel */
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function collection(value,maximum){if(!list(value)||value.length>maximum)throw new TypeError('Scene region program collection is invalid');return value;}
/** @param {unknown} value @returns {value is string} */
function labelRef(value){return typeof value==='string'&&/^label-[a-f0-9]{24}$/u.test(value);}
/** These are ordinary installed/native font families, never generated source
 * glyph fonts. A proposal remains subject to the actual renderer quality gate. */
const FAMILIES=new Set(require('./source-scene-program-contract').FAMILIES);
/** Bind wire indices while the ORIGINAL OCR context still exists. Store only
 * immutable source references thereafter. All unit references consume existing
 * object/relation slots; a region program cannot create a hidden inventory.
 * @param {unknown} value
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {unknown} sourceRefs @param {(value:unknown,namespace:string)=>string} scope
 * @returns {RegionProgram[]|undefined} */
function parseRegionPrograms(value,plan,sourceRefs,scope){
 if(value===undefined)return undefined;
 if(!record(plan)||!list(plan.regions)||plan.regions.length>24||plan.regions.some(r=>!record(r)||typeof r.id!=='string')
  ||!list(plan.objects)||plan.objects.length>sceneObjectLimit(plan)||plan.objects.some(r=>!record(r)||typeof r.id!=='string'||typeof r.regionId!=='string')
  ||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)||typeof r.id!=='string'||typeof r.regionId!=='string')
  ||new Set(plan.regions.map(r=>r.id)).size!==plan.regions.length||new Set(plan.objects.map(r=>r.id)).size!==plan.objects.length
  ||new Set(plan.relations.map(r=>r.id)).size!==plan.relations.length)throw new TypeError('Scene region program inventory is invalid');
 sceneRelationBatches(plan);
 const context=collection(sourceRefs,512);if(context.some(r=>!labelRef(r)))throw new TypeError('Scene region program label context is invalid');
 const regions=new Set(plan.regions.map(r=>r.id)),objects=new Map(plan.objects.map(o=>[o.id,o])),relations=new Map(plan.relations.map(r=>[r.id,r]));
 const regionSeen=new Set(),labelsSeen=new Set();
 return collection(value,24).map(raw=>{
  if(!record(raw)||Object.keys(raw).some(k=>!['regionId','objects','relations','labels'].includes(k)))throw new TypeError('Scene region program is invalid');
  const regionId=scope(raw.regionId,'region');if(!regions.has(regionId)||regionSeen.has(regionId))throw new TypeError('Scene region program owner is invalid');regionSeen.add(regionId);
  /** @param {unknown} refs @param {'object'|'relation'} namespace @param {Map<string,{id:string,regionId:string}>} units */
  const members=(refs,namespace,units)=>{
   const seen=new Set();const result=collection(refs,namespace==='object'?sceneObjectLimit(plan):plan.relationBatches?48:24).map(ref=>{
    const id=scope(ref,namespace);if(seen.has(id)||units.get(id)?.regionId!==regionId)throw new TypeError('Scene region program member is invalid');seen.add(id);return id;});
   // Omitting a declared member cannot make an incomplete region look complete.
   if([...units.values()].some(unit=>unit.regionId===regionId&&!seen.has(unit.id)))throw new TypeError('Scene region program inventory is incomplete');return result;
  };
  const objectRefs=members(raw.objects,'object',objects),relationRefs=members(raw.relations,'relation',relations);
  const labels=collection(raw.labels,32).map(style=>{
   if(!record(style)||Object.keys(style).some(k=>!['refs','family','weight','sizePt','role'].includes(k)))throw new TypeError('Scene region program label style is invalid');
   const refs=collection(style.refs,512).map(index=>{
    if(typeof index!=='number'||!Number.isSafeInteger(index)||index<0||index>=context.length)throw new TypeError('Scene region program label reference is invalid');
    const ref=context[index];if(!labelRef(ref)||context.filter(r=>r===ref).length!==1||labelsSeen.has(ref))throw new TypeError('Scene region program label reference is ambiguous');
    labelsSeen.add(ref);return ref;
   });
   if(!refs.length)throw new TypeError('Scene region program label style is empty');
   if(style.family!==undefined&&(typeof style.family!=='string'||!FAMILIES.has(style.family)))throw new TypeError('Scene region program native family is invalid');
   if(style.weight!==undefined&&style.weight!=='regular'&&style.weight!=='bold')throw new TypeError('Scene region program native weight is invalid');
   if(style.sizePt!==undefined&&(typeof style.sizePt!=='number'||!Number.isFinite(style.sizePt)||style.sizePt<1||style.sizePt>4000))throw new TypeError('Scene region program native size is invalid');
   if(style.role!==undefined&&(typeof style.role!=='string'||!['title','heading','sectionHeading','body','caption','label','list','footnote'].includes(style.role)))throw new TypeError('Scene region program typography role is invalid');
   return {refs,...(typeof style.family==='string'?{family:style.family}:{}),...(style.weight==='regular'||style.weight==='bold'?{weight:/** @type {'regular'|'bold'} */(style.weight)}:{}),...(typeof style.sizePt==='number'?{sizePt:style.sizePt}:{}),...(typeof style.role==='string'?{role:style.role}:{})};
  });
  return {regionId,objects:objectRefs,relations:relationRefs,labels};
 });
}
/** Source-reference binding alone cannot grant source paint or erase rights.
 * Reject missing/ambiguous labels and wrong owners before applying one region.
 * Existing explicit per-run colors and glyph content remain unchanged.
 * @template {{textBoxes:NativeLabel[]}} P
 * @param {P} page
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {{widthPt:number,heightPt:number}} slideSize */
function prepareRegionProgramLabels(page,plan,slideSize){
 if(!record(page)||!record(plan)||!record(slideSize)||![slideSize.widthPt,slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||!list(page.textBoxes)||page.textBoxes.length>10000||page.textBoxes.some(t=>!record(t)||t.source!==undefined&&!record(t.source)
   ||t.font!==undefined&&!record(t.font)||[t.positionedRuns,t.runs].some(runs=>runs!==undefined&&(!list(runs)||runs.length>512||runs.some(r=>!record(r)||r.font!==undefined&&!record(r.font))))))
  throw new TypeError('Scene region program input is invalid');
 for(const text of page.textBoxes)for(const run of text.positionedRuns??[])parsePositionedTextFontOverride(run.fontOverride);
 const proposed=plan.regionPrograms;if(!proposed)return {page,evidence:{prepared:0,rejected:/** @type {{regionId:string,reason:string}[]} */([])}};
 if(![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||!list(plan.regions)||plan.regions.length>24||plan.regions.some(r=>!record(r)||!validBox(r.box))
  ||!list(plan.objects)||plan.objects.length>sceneObjectLimit(plan)||plan.objects.some(r=>!record(r))
  ||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)))throw new TypeError('Scene region program frame is invalid');
 sceneRelationBatches(plan);
 const programs=validateCompiledRegionPrograms(plan);
 return prepareLabels(page,plan,slideSize,programs);
}
/** @param {import('./source-scene-plan').ScenePlan} plan */
function validateCompiledRegionPrograms(plan){
 // Wire indices are already gone; the round trip preserves source references.
 const proposed=plan.regionPrograms;
 const refs=/** @type {string[]} */([]);
 const wire=collection(proposed,24).map(p=>{
  if(!record(p))throw new TypeError('Scene region program is invalid');
  const labels=collection(p.labels,32).map(style=>{
   if(!record(style))throw new TypeError('Scene region program label style is invalid');
   return {...style,refs:collection(style.refs,512).map(ref=>{
    if(!labelRef(ref))throw new TypeError('Scene region program label reference is invalid');
    let index=refs.indexOf(ref);if(index<0){refs.push(ref);index=refs.length-1;}return index;
   })};
  });
  return {...p,labels};
 });
 const programs=parseRegionPrograms(wire,plan,refs,(value)=>{
  if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value))throw new TypeError('Scene region program member is invalid');return value;
 });
 if(!programs)throw new TypeError('Scene region program is invalid');
 return programs;
}
/** Local consensus changes inventories after global programs were admitted.
 * Rebind only proposed membership, preserving labels, census, rejections and
 * relation slots. Source compilation and complete-region receipts still decide
 * whether any program can commit. An incomplete input cannot be repaired here.
 * @param {import('./source-scene-plan').ScenePlan} previous
 * @param {import('./source-scene-plan').ScenePlan} next */
function rebindRegionProgramMembers(previous,next){
 if(!record(previous)||!record(next))throw new TypeError('Scene region program transition is invalid');
 if(previous.regionPrograms===undefined&&previous.pendingRegionPrograms===undefined&&previous.resolvedRegionPrograms===undefined){
  if(next.regionPrograms!==undefined)throw new TypeError('Scene region program transition is invalid');
  if(next.pendingRegionPrograms!==undefined)throw new TypeError('Scene region program transition is invalid');
  if(next.resolvedRegionPrograms!==undefined)throw new TypeError('Scene region program transition is invalid');
  return next;
 }
 if(!list(previous.regions)||!list(next.regions)||previous.regions.some(r=>!record(r))||next.regions.some(r=>!record(r))
  ||previous.sourceHash!==next.sourceHash||previous.widthPx!==next.widthPx||previous.heightPx!==next.heightPx
  ||previous.regionPrograms!==next.regionPrograms
  ||previous.pendingRegionPrograms!==next.pendingRegionPrograms
  ||previous.resolvedRegionPrograms!==next.resolvedRegionPrograms
  ||JSON.stringify(previous.regions)!==JSON.stringify(next.regions))throw new TypeError('Scene region program transition frame is invalid');
 const programs=validateCompiledRegionPrograms({...previous,regionPrograms:previous.regionPrograms??[]});
 if(!list(next.objects)||next.objects.some(o=>!record(o))||!list(next.relations)||next.relations.some(r=>!record(r)))
  throw new TypeError('Scene region program transition inventory is invalid');
 const owners=new Set(next.regions.map(r=>r.id));
 if([...next.objects,...next.relations].some(unit=>!owners.has(unit.regionId)))throw new TypeError('Scene region program transition owner is invalid');
 const rebound={...next,regionPrograms:programs.map(program=>({...program,
  objects:next.objects.filter(o=>o.regionId===program.regionId).map(o=>o.id),
  relations:next.relations.filter(r=>r.regionId===program.regionId).map(r=>r.id)}))};
 validateCompiledRegionPrograms(rebound);
 return obligations.restoreRegionProgramObligations(rebound,validateCompiledRegionPrograms);
}
/** Merge a complete generated candidate with ALL retained programs. Reuse the
 * original admission for owner/member completeness and cross-program labels;
 * this function cannot clear historical failures or grant completion receipts.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {RegionProgram[]} candidates */
function admitGeneratedRegionPrograms(plan,candidates){
 if(!record(plan)||!list(candidates)||candidates.length>24)throw new TypeError('Scene generated programs are invalid');
 const combined={...plan,regionPrograms:[...(plan.regionPrograms??[]),...candidates]};
 return {...plan,regionPrograms:validateCompiledRegionPrograms(combined)};
}
/** Preserve a rejected program's validated labels and explicit dependencies.
 * These are pending tasks, never drawing, ownership or completion receipts.
 * Strip dependencies only while validating the label/owner contract; keep the
 * complete original lists in the returned obligation, including missing IDs.
 * @param {unknown} raw @param {import('./source-scene-plan').ScenePlan} plan
 * @param {unknown} sourceRefs @param {(value:unknown,namespace:string)=>string} scope
 * @returns {RegionProgram|undefined} */
function retainRegionProgramObligation(raw,plan,sourceRefs,scope){
 return obligations.retainRegionProgramObligation(raw,plan,sourceRefs,scope,parseRegionPrograms);
}
/** @param {import('./source-scene-plan').ScenePlan} plan */
function currentSceneAdmissionRejections(plan){return obligations.currentSceneAdmissionRejections(plan,validateCompiledRegionPrograms);}
/** @template {{textBoxes:NativeLabel[]}} P
 * @param {P} page @param {import('./source-scene-plan').ScenePlan} plan
 * @param {{widthPt:number,heightPt:number}} slideSize @param {RegionProgram[]} programs */
function prepareLabels(page,plan,slideSize,programs){
 const width=plan.widthPx,height=plan.heightPx,regions=new Map(plan.regions.map(r=>[r.id,r]));
 /** @type {Map<string,{text:NativeLabel,pixels:Box}[]>} */const byRef=new Map();
 for(const text of page.textBoxes){
  const source=text.source;if(!record(source))continue;
  const box=source.ocrLabelBox??source.evidenceBox;if(!validBox(box)||!validBox(source.evidenceBox)||!labelRef(source.ocrLabelRef))continue;
  const actual=source.evidenceBox;
  if(actual.x<box.x-1e-6||actual.y<box.y-1e-6||actual.x+actual.w>box.x+box.w+1e-6||actual.y+actual.h>box.y+box.h+1e-6)continue;
  if(source.segmentedOcrLineId===undefined&&['x','y','w','h'].some(k=>actual[/** @type {keyof Box} */(k)]!==box[/** @type {keyof Box} */(k)]))continue;
  const pixels={x:box.x*width/slideSize.widthPt,y:box.y*height/slideSize.heightPt,w:box.w*width/slideSize.widthPt,h:box.h*height/slideSize.heightPt};
  if(pixels.x+pixels.w>width+1e-6||pixels.y+pixels.h>height+1e-6)continue;
  if(sourceLabelIdentity(pixels,{widthPx:width,heightPx:height})!==source.ocrLabelRef)continue;
  const bucket=byRef.get(source.ocrLabelRef)??[];bucket.push({text,pixels});byRef.set(source.ocrLabelRef,bucket);
 }
 /** @type {Map<NativeLabel,NativeLabel>} */const overrides=new Map();
 const evidence={prepared:0,rejected:/** @type {{regionId:string,reason:string}[]} */([])};
 for(const program of programs){
  const region=regions.get(program.regionId);if(!region)throw new TypeError('Scene region program owner is invalid');
  const resolved=program.labels.flatMap(style=>style.refs.map(ref=>({style,ref,rows:byRef.get(ref)})));
  const contains=(/** @type {{x:number,y:number,w:number,h:number}} */b)=>b.x>=region.box.x&&b.y>=region.box.y&&b.x+b.w<=region.box.x+region.box.w+1e-6&&b.y+b.h<=region.box.y+region.box.h+1e-6;
  // A segmented line may have several legitimate native labels. A repeated
  // unrelated OCR rectangle remains ambiguous and grants no style application.
  if(resolved.some(r=>!r.rows?.length||r.rows.some((/** @type {{text:{source?:Record<string,unknown>},pixels:{x:number,y:number,w:number,h:number}}} */row)=>!contains(row.pixels))
   ||(r.rows.length>1||r.rows.some(row=>row.text.source?.segmentedOcrLineId!==undefined))&&!completeSegments(r.rows))){
   evidence.rejected.push({regionId:program.regionId,reason:'source-label-binding'});continue;
  }
  for(const {style,rows}of resolved){
   if(!rows)throw new TypeError('Scene region program label binding is invalid');
   for(const {text}of rows){
   const scriptFonts=style.family?{family:style.family,latinFamily:style.family,eastAsianFamily:style.family,complexScriptFamily:style.family}:{};
   const font={...text.font,...scriptFonts,...(style.weight?{weight:style.weight}:{}),...(style.sizePt!==undefined?{sizePt:style.sizePt}:{})};
   /** @param {Record<string,unknown>[]} [input] */
   const styledRuns=input=>input?.map(run=>({...run,font:{...(record(run.font)?run.font:{}),...scriptFonts,...(style.weight?{weight:style.weight}:{}),...(style.sizePt!==undefined?{sizePt:style.sizePt}:{})}}));
   // Positioned runs inherit size/paint from their parent; their wire contract
   // accepts only fontOverride, unlike ordinary rich-text runs' font field.
   const positionedRuns=text.positionedRuns?.map(run=>({...run,fontOverride:{...parsePositionedTextFontOverride(run.fontOverride),
    ...scriptFonts,...(style.weight?{weight:style.weight}:{})}})),runs=styledRuns(text.runs);
   const replacement={...text,font,...(positionedRuns?{positionedRuns}:{}),...(runs?{runs}:{}),source:{...text.source,sceneRegionProgramId:program.regionId,
    typographyContainerBox:{x:region.box.x*slideSize.widthPt/width,y:region.box.y*slideSize.heightPt/height,w:region.box.w*slideSize.widthPt/width,h:region.box.h*slideSize.heightPt/height},
    ...(style.role?{typographyRole:style.role,typographyRoleEvidence:'scene-proposal'}:{})}};
   labelOrigins.set(replacement,sceneRegionLabelOrigin(text));overrides.set(text,replacement);
   }
  }
  evidence.prepared++;
 }
 return {page:{...page,textBoxes:page.textBoxes.map(t=>overrides.get(t)??t)},evidence};
}
/** A caller flag alone cannot legitimize duplicate label ownership. Require
 * the factory's complete, unique, nonoverlapping color-segment partition.
 * @param {{text:NativeLabel,pixels:Box}[]} rows */
function completeSegments(rows){
 if(rows.length<2||rows.length>4)return false;
 const first=rows[0]?.text.source;if(!first||typeof first.segmentedOcrLineId!=='string'||!first.segmentedOcrLineId)return false;
 const indices=new Set();
 /** @type {number[][]} */
 const ranges=[];
 for(const {text}of rows){const source=text.source;
  if(!source||source.segmentedOcrLineId!==first.segmentedOcrLineId||source.mixedColorTextSegments!==rows.length
   ||typeof source.mixedColorTextSegment!=='number'||!Number.isSafeInteger(source.mixedColorTextSegment)
   ||source.mixedColorTextSegment<1||source.mixedColorTextSegment>rows.length||indices.has(source.mixedColorTextSegment)
   ||typeof source.segmentStartIndex!=='number'||typeof source.segmentEndIndex!=='number'
   ||!Number.isSafeInteger(source.segmentStartIndex)||!Number.isSafeInteger(source.segmentEndIndex)
   ||source.segmentStartIndex<0||source.segmentEndIndex<=source.segmentStartIndex||source.segmentEndIndex>16000)return false;
  indices.add(source.mixedColorTextSegment);ranges.push([source.segmentStartIndex,source.segmentEndIndex]);
 }
 ranges.sort((a,b)=>(a[0]??0)-(b[0]??0));return ranges.every((r,i)=>i===0||(ranges[i-1]?.[1]??Infinity)<=(r[0]??-1));
}
module.exports={parseRegionPrograms,prepareRegionProgramLabels,rebindRegionProgramMembers,admitGeneratedRegionPrograms,reconcileSceneLabelLayout,sceneRegionLabelOrigin,retainRegionProgramObligation,currentSceneAdmissionRejections,validateCompiledRegionPrograms};
