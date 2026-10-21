// @ts-check
"use strict";
const {types}=require("node:util");
const {measureSourceWordLayout,remeasureSourceWordLayout,proposeIntactSourceWordLayout}=require("./source-word-layout-evidence");
const {projectSourceWordRuns}=require("./source-word-layout-projection");
const {preserveSourceWordFonts}=require("./source-word-font-identity");
const {prepareRotatedSourceWordFrame,prepareAxisAlignedSourceWordFrame}=require("./source-word-rotated-frame");
const {observeJointSourceWordRows}=require('./source-word-joint-observation');
const {createSourceWordLayoutSession,validateSourceWordLayoutSession,deferSourceWordLayout,materializeDeferredSourceWordLayouts}=require('./deferred-source-word-layout');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{text:string,box:Box}} Run */
/** @type {WeakMap<object,{text:string,box:Box,color:string,pageImage:unknown,runs:Run[]|null,request:object,lineBox:Box,original:Box,budget:{remaining:number},rotation:number,fixedFrame?:Box}>} */ const registry=new WeakMap();
/** Identity-bound alternatives are intentionally absent from serialized IR.
 * @type {WeakMap<object,{plan:NonNullable<ReturnType<typeof registry.get>>,signature:string}>} */
const intactCandidates=new WeakMap();
/** Color children retain independently measured word geometry through the
 * existing late expansion; serialized metadata alone cannot create a plan.
 * @type {WeakMap<object,Record<string,unknown>[]>} */const colorFamilies=new WeakMap();
/** Register source-measured color children under the same OCR source budget.
 * Position hints propose cuts only and are clipped to each already measured
 * color interval. Their glyph pixels still need the ordinary complete-ink proof.
 * @param {Record<string,unknown>} parent @param {Record<string,unknown>[]} children
 * @param {import('./ocr-source-deck').OcrLine} line
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {{remaining:number}} budget
 * @param {readonly Box[]} neighbors @param {unknown} [session] */
function registerSourceWordColorSegments(parent,children,line,image,budget,neighbors,session){
 const family=[];
 for(const child of children){
  if(!record(child.source)||!record(child.source.sourceInkPixelBox)||typeof child.text!=='string')continue;
  const frame=/** @type {Box} */(child.source.sourceInkPixelBox);
  const start=child.source.segmentStartIndex,end=child.source.segmentEndIndex;
  let offset=0;
  const hints=line.wordPositionHints?.flatMap(hint=>{
   const left=offset;offset+=Array.from(hint.text).length;
   if(typeof start!=='number'||typeof end!=='number'||left<start||offset>end||!hint.text.trim())return [];
   const x=Math.max(frame.x,hint.box.x),y=Math.max(frame.y,hint.box.y),right=Math.min(frame.x+frame.w,hint.box.x+hint.box.w),bottom=Math.min(frame.y+frame.h,hint.box.y+hint.box.h);
   return right>x&&bottom>y?[{text:hint.text,box:{x,y,w:right-x,h:bottom-y}}]:[];
  });
  const aligned=hints?.map(h=>h.text).join('')===child.text?hints:undefined;
  const sourceLine={text:child.text,confidence:line.confidence,box:frame,...(aligned?{wordPositionHints:aligned}:{})};
  // Replace only this parent's identity in the source-neighbor set. Adjacent
  // color intervals and all foreign OCR rows retain their own exclusion boxes.
  const ownNeighbors=[...neighbors.filter(n=>n!==line.box),...children.flatMap(c=>record(c.source)&&record(c.source.sourceInkPixelBox)?[/** @type {Box} */(c.source.sourceInkPixelBox)]:[])];
  registerSourceWordLayout(child,sourceLine,image,budget,ownNeighbors,false,session);family.push(child);
 }
 if(family.length)colorFamilies.set(parent,family);
}
/** @param {Record<string,unknown>} text */
function candidateSignature(text){
 if(!record(text.box)||!record(text.font)||!record(text.style))return '';
 const values=[text.id,text.text,text.box.x,text.box.y,text.box.w,text.box.h,text.font.color,text.font.family,text.font.sizePt,text.font.weight,
  text.wrap,text.rotation,text.style.wrap,text.style.fit,text.style.textWarp];
 if(values.some(value=>value!==undefined&&typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value))))return '';
 return JSON.stringify(values);
}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&!types.isProxy(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 && Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value"in property);}
/** A layout measured from dark strokes cannot describe light glyphs revealed
 * later by reconstruction. Preserve ordinary text when the original mask
 * measured the opposite polarity; color-only style changes remain supported.
 * The light-ink boundary is shared with text-ink-geometry.
 * @param {string} original @param {unknown} current */
function sameInkPolarity(original,current){
 if(typeof current!=="string"||!/^#[a-f0-9]{6}$/iu.test(current))return false;
 /** @param {string} color */const light=color=>Math.min(...[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16)))>190;
 return light(original)===light(current);
}
/** Internal admitted OCR factory shares its existing 4M source-analysis allowance.
 * No copy/JSON/model metadata can acquire the private measured-layout capability.
 * @param {Record<string,unknown>} text @param {import('./ocr-source-deck').OcrLine} line
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {{remaining:number}} budget @param {readonly Box[]} [neighborBoxes] @param {boolean} [rotated] @param {unknown} [session] */
function registerSourceWordLayout(text,line,image,budget,neighborBoxes=[],rotated=false,session){
 if(line.confidence<.9||line.text.length>512
  ||Array.from(line.text).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)
  ||line.text.trim()!==text.text||!record(text.font)||!record(text.source)
  ||typeof text.font.color!=="string"||!record(text.box))return;
 // A monochrome word mask cannot replace independently measured color bands.
 // Their existing segment pipeline retains separate paint and source geometry.
 if(Array.isArray(text.source.positionedMixedColorTextSegments)&&text.source.positionedMixedColorTextSegments.length>1)return;
 if(session!==undefined){deferSourceWordLayout(session,text,line,image,budget,neighborBoxes,rotated);return;}
 const rectified=rotated?prepareRotatedSourceWordFrame({image,line,nativeBox:text.box,neighbors:neighborBoxes,maximum:budget.remaining}):null;
 if(rotated&&!rectified)return;
 if(rectified)budget.remaining-=rectified.scannedPixels;
 const measuredLine=rectified?.line??line;
 const request={image:rectified?.image??image,line:measuredLine,color:text.font.color,maxScanPixels:budget.remaining,neighborBoxes:rectified?.neighborBoxes??neighborBoxes};
 const result=measureSourceWordLayout(request);
 budget.remaining-=result.scannedPixels;
 // An unsplit, fully measured line is still useful source geometry. Dropping it
 // would silently return to the OCR font estimate precisely when the complete
 // ink mask disallows artificial gaps through antialiased strokes.
 if(!result.scannedPixels)return;
 const original=rectified?.nativeFrame??/** @type {Box} */(text.box),frame=rectified?.frame??result.sourceFrame??line.box;
 const sx=original.w/line.box.w,sy=original.h/line.box.h;
 const box=rectified?original:{x:original.x+(frame.x-line.box.x)*sx,y:original.y+(frame.y-line.box.y)*sy,w:frame.w*sx,h:frame.h*sy};
 // Typography uses the native renderer's coverage boundary. The full source
 // runs/frame above retain all antialiased ink and every ownership safeguard.
 const runs=result.runs?projectSourceWordRuns(result.typographicRuns??result.runs,frame,box):null;
 registry.set(text,{text:line.text.trim(),box:{...box},color:text.font.color,pageImage:text.source.pageImage,runs,
  request,lineBox:{...measuredLine.box},original:{...original},budget,rotation:rectified?.rotation??0,...(rectified?{fixedFrame:rectified.frame}:{})});
}
/** The deferred session calls this only after all ordinary final-paint layouts.
 * @param {Record<string,unknown>} text @param {import('./ocr-source-deck').OcrLine} line
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {{remaining:number}} budget
 * @param {readonly Box[]} neighbors @param {readonly {box:Box,color:string,confidence:number}[]} rows */
function registerJointSourceWordLayout(text,line,image,budget,neighbors,rows){
 const plan=registry.get(text);
 if(!plan||plan.runs||!record(text.font)||typeof text.font.color!=='string'||!record(text.box))return;
 const jointEvidence=observeJointSourceWordRows({image,anchor:line.box,rows,budget});
 const prepareFrame=plan.rotation?prepareRotatedSourceWordFrame:prepareAxisAlignedSourceWordFrame;
 const frame=jointEvidence?prepareFrame({image,line,nativeBox:text.box,neighbors,maximum:budget.remaining,jointEvidence}):null;
 if(!frame)return;budget.remaining-=frame.scannedPixels;
 const request={image:frame.image,line:frame.line,color:text.font.color,maxScanPixels:budget.remaining,neighborBoxes:frame.neighborBoxes};
 const result=measureSourceWordLayout(request);budget.remaining-=result.scannedPixels;if(!result.runs)return;
 registry.set(text,{...plan,request,box:{...frame.nativeFrame},original:{...frame.nativeFrame},fixedFrame:frame.frame,
  lineBox:{...frame.line.box},runs:projectSourceWordRuns(result.typographicRuns??result.runs,frame.frame,frame.nativeFrame)});
}
/** Apply only after ordinary reconstruction has finished moving/fitting text.
 * Existing split/changed/unrelated content remains under its own source evidence.
 * @param {{textBoxes:Record<string,unknown>[]}} page @param {readonly Record<string,unknown>[]} originals */
function applySourceWordLayouts(page,originals){
 /** @type {Map<string,unknown>} */const segmentParents=new Map();
 for(const original of originals)for(const child of colorFamilies.get(original)??[])
  if(typeof child.id==='string'&&record(child.source))segmentParents.set(child.id,child.source.segmentedOcrLineId);
 originals=originals.flatMap(original=>colorFamilies.get(original)??[original]);
 originals=materializeDeferredSourceWordLayouts(page,originals,registerSourceWordLayout,registerJointSourceWordLayout,registerFinalInkCandidate);
 const plans=new Map(originals.flatMap(original=>{const plan=registry.get(original);return plan&&typeof original.id==="string"?[[original.id,plan]]:[];}));
 let layouts=0,runs=0;
 const textBoxes=page.textBoxes.map(text=>{
  if(!record(text)||!record(text.source)||typeof text.id!=="string")return text;
  if(text.source.segmentedOcrLineId!==undefined&&segmentParents.get(text.id)!==text.source.segmentedOcrLineId)return text;
  const plan=plans.get(text.id);
  if(!plan||Math.abs((text.rotation===undefined?0:Number(text.rotation))-plan.rotation)>1e-9||text.text!==plan.text||text.source.pageImage!==plan.pageImage
   ||!record(text.font)||!sameInkPolarity(plan.color,text.font.color))return text;
  let measuredRuns=plan.runs,measuredBox=plan.box;
  if(plan.color!==text.font.color){
   const fresh=remeasureSourceWordLayout(plan.request,text.font.color,plan.budget.remaining);
   if(!fresh)return text;plan.budget.remaining-=fresh.scannedPixels;
   if(!fresh.runs)return text;
   const frame=plan.fixedFrame??fresh.sourceFrame??plan.lineBox,sx=plan.original.w/plan.lineBox.w,sy=plan.original.h/plan.lineBox.h;
   measuredBox=plan.fixedFrame?plan.original:{x:plan.original.x+(frame.x-plan.lineBox.x)*sx,y:plan.original.y+(frame.y-plan.lineBox.y)*sy,w:frame.w*sx,h:frame.h*sy};
   measuredRuns=projectSourceWordRuns(fresh.typographicRuns??fresh.runs,frame,measuredBox);
  }
  if(!measuredRuns){
   // Keep the failed split as ordinary text. Only the later render/quality
   // transaction may consider an intact alternative, without changing masks.
   const signature=candidateSignature(text);
   if(signature&&plan.color===text.font.color&&!plan.rotation&&!text.positionedRuns&&record(text.style)&&text.style.wrap===false)
    intactCandidates.set(text,{plan,signature});
   return text;
  }
  const positionedRuns=preserveSourceWordFonts(measuredRuns,text.positionedRuns,plan.text);
  if(!positionedRuns)return text;layouts++;runs+=positionedRuns.length;
  const source={...text.source};delete source.positionedMixedColorTextSegments;delete source.mixedColorTextRuns;delete source.mixedColorTextSegments;
  const next={...text,box:{...measuredBox},wrap:false,
   style:{...(record(text.style)?text.style:{}),wrap:false,fit:"none",textWarp:"textPlain"},source,
   positionedRuns};
  if("runs"in next)delete next.runs;
  return next;
 });
 return {page:{...page,textBoxes},layouts,runs};
}
/** A fresh observation uses final paint and the original admitted source seed.
 * Opposite-polarity evidence never becomes an ordinary automatic layout.
 * @param {Record<string,unknown>} text @param {import('./ocr-source-deck').OcrLine} line
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {{remaining:number}} budget
 * @param {readonly Box[]} neighbors @param {Box} original */
function registerFinalInkCandidate(text,line,image,budget,neighbors,original){
 if(!record(text)||!record(text.source)||!record(text.font)||!record(text.style)||text.style.wrap!==false
  ||text.positionedRuns!==undefined||text.runs!==undefined||text.source.segmentedOcrLineId!==undefined)return;
 const signature=candidateSignature(text);if(!signature)return;
 const measured={...text,box:{...original},font:{...text.font},source:{...text.source}};
 registerSourceWordLayout(measured,line,image,budget,neighbors);
 const plan=registry.get(measured);
 // Successful final-paint layouts are still handled by their existing ordinary
 // path. This branch is specifically an independent failed-split alternative.
 if(plan&&!plan.runs)intactCandidates.set(text,{plan,signature});
}
/** Produce an independent candidate for the existing render-and-compare selector.
 * No serialized hints, arbitrary OCR or new source reads can enter this path.
 * @param {{textBoxes:Record<string,unknown>[]}} page */
function planIntactSourceWordLayouts(page){
 /** @type {{id:string}[]} */const changes=[];
 const textBoxes=page.textBoxes.map(text=>{
  const candidate=intactCandidates.get(text);if(!candidate)return text;
  intactCandidates.delete(text);
  if(!record(text)||!record(text.box)||!record(text.font)||!record(text.style)
   ||text.positionedRuns!==undefined||candidateSignature(text)!==candidate.signature||typeof text.id!=='string')return text;
  const plan=candidate.plan,result=proposeIntactSourceWordLayout(plan.request,plan.budget.remaining);
  if(!result)return text;plan.budget.remaining-=result.scannedPixels;
  if(!result.runs||!result.sourceFrame)return text;
  const frame=result.sourceFrame,sx=plan.original.w/plan.lineBox.w,sy=plan.original.h/plan.lineBox.h;
  const measuredBox={x:plan.original.x+(frame.x-plan.lineBox.x)*sx,y:plan.original.y+(frame.y-plan.lineBox.y)*sy,w:frame.w*sx,h:frame.h*sy};
  const positionedRuns=preserveSourceWordFonts(projectSourceWordRuns(result.typographicRuns??result.runs,frame,measuredBox),text.positionedRuns,plan.text);
  if(!positionedRuns)return text;
  changes.push({id:text.id});
  return {...text,box:measuredBox,wrap:false,style:{...text.style,wrap:false,fit:'none',textWarp:'textPlain'},positionedRuns};
 });
 return {textBoxes,changes};
}
/** Internal asset-copy boundary only. The Worker has copied these exact assets;
 * serialization alone cannot acquire the original identity-bound observation.
 * Rebind only unchanged native text after the approved path substitution.
 * @param {{textBoxes?:Record<string,unknown>[]}} original @param {{textBoxes?:Record<string,unknown>[]}} rewritten
 * @param {Map<string,string>} replacements */
function rebindIntactSourceWordLayouts(original,rewritten,replacements){
 if(!Array.isArray(original.textBoxes)||!Array.isArray(rewritten.textBoxes)||original.textBoxes.length!==rewritten.textBoxes.length)return;
 for(let index=0;index<original.textBoxes.length;index++){
  const before=original.textBoxes[index],after=rewritten.textBoxes[index];
  if(!before||!after)continue;const candidate=intactCandidates.get(before);if(!candidate)continue;
  if(!record(before)||!record(after)||!record(before.source)||!record(after.source)||typeof before.source.pageImage!=='string'
   ||before.positionedRuns!==undefined||after.positionedRuns!==undefined||candidateSignature(before)!==candidate.signature
   ||candidateSignature(after)!==candidate.signature||after.source.pageImage!==(replacements.get(before.source.pageImage)??before.source.pageImage))continue;
  intactCandidates.delete(before);intactCandidates.set(after,candidate);
 }
}
module.exports={registerSourceWordLayout,registerSourceWordColorSegments,applySourceWordLayouts,createSourceWordLayoutSession,validateSourceWordLayoutSession,planIntactSourceWordLayouts,rebindIntactSourceWordLayouts};
