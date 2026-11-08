// @ts-check
"use strict";
const {sourceBox2D}=require('./source-scene-coordinate-frame');
const {sourceLabelIdentity}=require('./source-label-identity');
const {boundedSceneOcrHints}=require('./source-scene-ocr-hints');
const {SURFACE_PATH_PROMPT}=require('./source-scene-surface-paths');
const {SCENE_LOGICAL_RELATION_PROMPT}=require('./source-scene-program-prompt');
/** Source OCR locations and atlas locations share the wire convention, never
 * the same physical frame. Encode them here alongside the model instructions.
 * @param {readonly {box:import('./source-scene-plan').Box,confidence:number,text?:string}[]} lines
 * @param {{width:number,height:number}} image @param {boolean} [includeHints] */
function sourceSceneOcrTargets(lines,image,includeHints=false){
 if(typeof includeHints!=='boolean')throw new TypeError('Scene OCR hint policy is invalid');
 /** @type {Map<number,string>} */const hints=includeHints?boundedSceneOcrHints(lines):new Map();
 return lines.map((line,index)=>({index,labelRef:sourceLabelIdentity(line.box,{widthPx:image.width,heightPx:image.height}),box_2d:sourceBox2D(line.box,image),confidence:line.confidence,
  ...(hints.has(index)?{ocrTextHint:hints.get(index)}:{})}));
}
/** @param {ReturnType<typeof import('./source-scene-crop-sheet').createSceneCropSheet>} sheet */
function sourceSceneSheetTargets(sheet){
 return sheet.targets.map(target=>({index:target.index,cropBox2D:sourceBox2D(target.cropBox,sheet.image),candidateBox2D:sourceBox2D(target.candidateBox,sheet.image)}));
}
/** Build the local task once. Per-image labels bind OCR targets in local pixels;
 * every returned geometry still belongs to the atlas frame. The admitted target
 * lists and source evidence, not a model's confidence, decide final acceptance.
 * @param {{rules:string,targets:number[],missing:number[],focused:number[],focusedStructures?:number[],
 * sheetTargets:{index:number,cropBox2D:number[],candidateBox2D:number[]}[],
 * structures:{index:number,objectId:string,ownerCandidates:unknown,compileFailures?:unknown,contextBox?:unknown}[],
 * inventories:{index:number,objectId:string,regionId:string}[],
 * relationPrompt:string,regionalPrompt:string,extraKeys:string[],relationObservationUnit?:'logical-relations-v1'}} input */
function sourceSceneLocalPrompt(input){
 const {rules,targets,missing,focused,focusedStructures=[],sheetTargets,structures,inventories,relationPrompt,regionalPrompt,extraKeys,relationObservationUnit}=input;
 if(relationObservationUnit!==undefined&&relationObservationUnit!=='logical-relations-v1')throw new TypeError('Scene local observation unit is invalid');
 const relationContract=relationObservationUnit==='logical-relations-v1'?SCENE_LOGICAL_RELATION_PROMPT+' Preserve this admitted observation unit; return only the requested local maps, never a new scene or a replacement census. ':'';
 const keys=['reviewsByIndex','recoveredByIndex',...(structures.length?['structuresByIndex']:[]),...(inventories.length?['inventoriesByIndex']:[]),...extraKeys];
 const frames='All returned boxes use normalized 0-1000 [ymin,xmin,ymax,xmax] in the FIRST image (the atlas) only. Each target has its own cropBox2D and candidateBox2D, even when tiles overlap. Gutter numbers are annotations, never source glyphs. ';
 const review='Use cropBox2D to understand the complete physical object and neighboring endpoints, but classify ONLY the strokes inside candidateBox2D. Neighboring labels do not make the target mixed. '
  +(focused.length?'Additional images are independent original contexts for the OCR indices '+JSON.stringify(focused)+'. Each image label gives its ONE index and candidate rectangle in LOCAL PIXELS. Use these focused images for classification, never for returned geometry. ':'');
 const structuralViews=focusedStructures.length?' Additional images are independent original contexts for structural indices '+JSON.stringify(focusedStructures)
  +'. Each label binds its ONE index and candidate rectangle in LOCAL PIXELS. Inspect these views before classifying a unit, its owner, pictorial children or relationships. Use these focused images for evidence, never for returned geometry; boxes still use the FIRST atlas frame. ':'';
 const structure=structures.length?' structuresByIndex maps exactly '+JSON.stringify(structures.map(p=>p.index))
  +' to {kind:container/icon/unknown,confidence:number,regionId:string|null,box_2d:array|null,nativeGeometry:object|null}. For a clearly visible container surface, nativeGeometry has kind ellipse/roundRect/quad/cylinder/handFrame, capRatio:number|null,radiusRatio:number|null,seams:sorted relative positions|null,corners:four convex {x,y} points in 0-1 relative to this object|null. Use null for unknown geometry and all icons. The complete native constructor must still prove every face on the source; never invent hidden parts or replace glyphs/illustrations with a surface. Independently inspect each physical unit in the atlas. Labeled enclosing nodes, number badges and heading backgrounds are container; independent pictograms are icon. Keep the same identity and box_2d:null if the current box already bounds it; otherwise return its complete physical envelope inside cropBox2D. Choose the innermost unambiguous owner containing the whole unit from these exact canonical IDs (parent links identify nesting): '
  +JSON.stringify(structures.map(({index,objectId,ownerCandidates,compileFailures,contextBox})=>({index,objectId,ownerCandidates,...(compileFailures?{compileFailures}:{}),...(contextBox?{singleIconOwnerContext:true}:{})})))
  +'. For compileFailures containing icon-source-clipped-component or icon-source-fringe-boundary, the current envelope has FAILED source isolation: containing the icon is insufficient. Inspect the complete pictogram, including detached details, separately from nearby connector shafts, arrowheads, captions and other units. Return an explicit tight box_2d for that WHOLE pictogram, even when the old envelope contains it; never use null to reconfirm the failed envelope. Do not trim an icon arm or detail to avoid a connector. If the complete independent unit cannot be bounded in cropBox2D, return unknown,0,null,null,null. All corrections remain proposals and must pass unchanged source-component and boundary checks. For singleIconOwnerContext targets, the crop includes the independently counted single-icon owner: the candidate may fall on its caption. Inspect the whole owner and return the COMPLETE icon envelope, keeping its original owner and identity. Do not classify the caption as the icon. Compile failures describe unproven source evidence, not permission to invent corrections. For unclear/clipped units use unknown,0,null,null. Region IDs are metadata, not coordinate frames. Do not copy a proposed owner without checking it. Structural observations grant no pixel ownership. ':'';
 const inventory=inventories.length?' inventoriesByIndex maps exactly '+JSON.stringify(inventories.map(t=>t.index))
  +' to {kind:icon/unknown,confidence:number,regionId:string|null,box_2d:array|null}. Find one COMPLETE independent pictorial icon INSIDE this node (candidateBox2D), including detached details. Never return labels, number badges, parent surfaces/borders or neighboring units. Box uses the atlas frame and stays inside candidateBox2D. For none/unclear use unknown,0,null,null. Parent identities: '
  +JSON.stringify(inventories.map(t=>({index:t.index,parentObjectId:t.objectId,regionId:t.regionId})))+'. Proposals grant no pixel ownership. ':'';
 return `${rules} ${frames}${review}Classify OCR and generate complete missing regional units TOGETHER in this response. There is no later generation wave. If a reviewed OCR candidate is graphic, include its complete physical unit in the requested region inventory when missing; keep real glyphs as labels. Preserve existing members, count every proposal against the shared capacity, and never return only a census for an actionable missing unit. Return ONLY JSON with ${keys.map(k=>`"${k}"`).join(', ').replace(/, ([^,]+)$/u,' and $1')}. `
  +`reviewsByIndex maps EXACT existing OCR indices ${JSON.stringify(targets)} to text/graphic/mixed/uncertain. Do not transcribe or rewrite existing OCR. `
  +`recoveredByIndex maps EXACT missing indices ${JSON.stringify(missing)} to {"text":"exact visible glyphs","confidence":number,"box_2d":[ymin,xmin,ymax,xmax],"color":"#RRGGBB"}. Include light glyphs on colored backgrounds; transcribe only inside candidateBox2D. Return tight glyph envelopes, not backgrounds or holes, and actual glyph ink color. For no readable glyphs use text:null,confidence:0,box_2d:null,color:null. Never infer a sequence or neighboring text. Return {} for empty lists. `
  +relationContract+structuralViews+structure+inventory+relationPrompt+regionalPrompt+((structures.length||regionalPrompt)?SURFACE_PATH_PROMPT:'')+` Every requested index must occur exactly once; no extra keys. Targets: ${JSON.stringify(sheetTargets)}`;
}
module.exports={sourceSceneLocalPrompt,sourceSceneOcrTargets,sourceSceneSheetTargets};
