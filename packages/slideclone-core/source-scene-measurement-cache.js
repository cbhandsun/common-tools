// @ts-check
"use strict";
const {types}=require("node:util");
const {measureSceneContainer}=require("./source-scene-container");
const {measureOutlinedSceneContainerDetailed,measureOutlinedSceneContainerSpatial,sceneOutlineWindow}=require("./source-scene-outline");
const {withSceneFillRasterCache}=require("./source-scene-fill-raster-cache");
const {measureLayeredSceneBackground}=require("./source-scene-layered-background");
const {createMeasuredScenePortFrame}=require("./source-scene-port-evidence");
const {sameSceneFillComponent,sceneFillEnclosedByRing,sceneFillHasConnectedBody,sceneFillWithinParametricBody}=require("./source-scene-fill-window");
const {traceNativeMaskContours}=require("./native-mask-contours");
const {sceneGlyphOcclusionScanReserve,sceneGlyphOcclusionRejections,stageSceneGlyphOwnership,commitSceneGlyphOwnership}=require("./source-scene-glyph-occlusion");
const {measureSceneParametricSurface,measureSceneIconBackdrop}=require('./source-scene-parametric-surface');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {sceneIconBackdropHint}=require('./source-scene-icon-context');
const {measurePatternedSceneFrame,patternedSceneFrameGeometry}=require('./source-scene-patterned-frame');
const {nativePatternedSceneOutput}=require('./source-scene-patterned-output');
const {compileScenePrimitiveProgram,compileSceneCageProgram}=require('./source-scene-primitive-program');
/** @typedef {import("./source-scene-plan").Box} Box */
/** @typedef {{path:'outline'|'fill',code:string,attempts?:number,requestedGlyphs?:number,remainingGlyphs?:number}} MeasurementFailure */
/** @typedef {NonNullable<ReturnType<typeof measureSceneContainer>> & Partial<NonNullable<ReturnType<typeof measureSceneParametricSurface>>>} Surface */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==="number"&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** Each synchronous compile owns one admitted immutable source raster, one
 * text-mask snapshot and one unchanged pixel budget. Repeated semantic aliases
 * of exactly the same physical hint reuse its source measurement. A cache miss
 * still runs the original scanner and charges its entire original window.
 * @param {import("./png").PngImage} image
 * @param {import("./source-scene-plan").Box[]} textMasks @param {{used:number}} budget @param {unknown} [glyphOcclusion] @param {boolean} [spatialExterior] */
function createSceneMeasurementCache(image,textMasks,budget,glyphOcclusion,spatialExterior=false){
 if(typeof spatialExterior!=='boolean')throw new TypeError('Scene exterior selection is invalid');
 if(!record(image)||!record(budget)||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||image.width*image.height>40000000||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||!Number.isSafeInteger(budget.used)||budget.used<0||!Array.isArray(textMasks)||types.isProxy(textMasks)||textMasks.length>10000
  ||Reflect.ownKeys(textMasks).length!==textMasks.length+1||Object.values(Object.getOwnPropertyDescriptors(textMasks)).some(p=>!("value" in p))
  ||textMasks.some(m=>!box(m)||m.x+m.w>image.width||m.y+m.h>image.height))throw new TypeError("Scene measurement source is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",image.rgba),length=Reflect.get(proto,"length",image.rgba);
 if(!types.isArrayBuffer(buffer)||length!==image.width*image.height*4)throw new TypeError("Scene measurement pixels are invalid");
 // The compiler owns the pixel buffer for this synchronous operation. Snapshot
 // mutable control arrays; never copy or re-hash the entire source raster.
 const source={width:image.width,height:image.height,rgba:image.rgba},masks=textMasks.map(m=>({...m}));
 /** @type {Map<string,ReturnType<typeof measureSceneContainer>>} */const fills=new Map();
 /** @type {Map<string,ReturnType<typeof measureSceneParametricSurface>>} */const parametric=new Map();
 /** Complete layered silhouettes retain the same private source binding as
  * ordinary measured fills. A caller's detached drawing is never a receipt.
  * @type {Map<string,NonNullable<ReturnType<typeof measureLayeredSceneBackground>>>} */const layered=new Map();
 /** @type {Map<string,ReturnType<typeof measurePatternedSceneFrame>>} */const patterns=new Map();
 /** One optional retry after independently measured foreground bodies exist. */const patternRetries=new Set();
 /** @type {Map<string,ReturnType<typeof import('./source-scene-outline').measureOutlinedSceneContainer>>} */const outlines=new Map();
 /** @type {Map<string,string>} */const outlineFailures=new Map();
 /** Per-query stages remain separate from whole-page counters. Returned
  * diagnostics cannot authorize paint or mutate the private measurement.
  * @type {Map<string,MeasurementFailure[]>} */const outlineFailureDetails=new Map();
 /** @type {Map<string,MeasurementFailure[]>} */const fillFailures=new Map();
 /** A secondary source ring belongs to the same physical query, even though
  * its independent scan uses the measured fill as the search hint.
  * @type {Map<string,NonNullable<ReturnType<typeof import('./source-scene-outline').measureOutlinedSceneContainer>>>} */const surfaceOutlines=new Map();
 const evidence={fillReuses:0,outlineReuses:0,measuredBoundaryOutlines:0,measuredBoundarySkippedBudget:0,independentFillSkippedBudget:0,
  outlineRejections:/** @type {Record<string,number>} */({})};
 /** @param {import("./source-scene-plan").Box} hint */
 const key=hint=>{
  if(!box(hint)||hint.x+hint.w>source.width||hint.y+hint.h>source.height)throw new TypeError("Scene measurement hint is invalid");
  return `${hint.x},${hint.y},${hint.w},${hint.h}`;
 };
 /** A recovery may not borrow a crossing hollow frame's source ink to mint
  * an unrelated opaque body. Contained children and independent boundaries
  * remain valid. Recheck cached candidates after new frames become known;
  * this reads only private measured geometry and spends no source pixels.
  * @param {string} id */
 const independentParametric=id=>{
  const body=parametric.get(id);if(!body)return body;
  const a=body.box;
  /** @param {Box} outer @param {Box} inner */
  const contains=(outer,inner)=>outer.x<=inner.x&&outer.y<=inner.y&&outer.x+outer.w>=inner.x+inner.w&&outer.y+outer.h>=inner.y+inner.h;
  for(const frame of patterns.values()){
   const measured=patternedSceneFrameGeometry(frame,source);if(!measured)continue;
   const b=measured.box;
   if(contains(a,b)||contains(b,a)||Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)
    ||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y))continue;
   const cells=new Set(measured.perimeterPixels);
   if(!body.perimeterPixels.some(cell=>cells.has(cell)))continue;
   const failures=fillFailures.get(id)??[];
   if(!failures.some(f=>f.code==='parametric-boundary-owned-by-frame'))
    fillFailures.set(id,[...failures,{path:'fill',code:'parametric-boundary-owned-by-frame'}]);
   return null;
  }
  return body;
 };
 return {
  evidence,
  /** Complete program construction shares this measurement cache's source,
   * masks and scan ledger; no source claim is inherited from a legacy detector.
   * @param {import('./source-scene-plan').SceneObject} object
   * @param {{widthPt:number,heightPt:number}} slideSize */
  primitiveProgram(object,slideSize){return compileScenePrimitiveProgram({image,object,textMasks:masks,budget,slideSize});},
  /** @param {import('./source-scene-plan').SceneObject} object @param {{widthPt:number,heightPt:number}} slideSize */
  cageProgram(object,slideSize){return compileSceneCageProgram({image,object,textMasks:masks,budget,slideSize});},
  /** A fragmented source boundary uses its own representation proof. Only
   * after the continuous outline has failed may it consume the same snapshot.
   * @param {Box} hint @param {object[]} [occlusionFrames] */
  pattern(hint,occlusionFrames=[]){const id=key(hint);if(!outlines.has(id)||outlines.get(id))return null;
   if(!Array.isArray(occlusionFrames)||types.isProxy(occlusionFrames)||Object.getPrototypeOf(occlusionFrames)!==Array.prototype||occlusionFrames.length>88
    ||Reflect.ownKeys(occlusionFrames).length!==occlusionFrames.length+1||Object.values(Object.getOwnPropertyDescriptors(occlusionFrames)).some(p=>!('value' in p)))
    throw new TypeError('Scene frame occlusion controls are invalid');
   const retry=patterns.has(id)&&!patterns.get(id)&&occlusionFrames.length>0&&!patternRetries.has(id);
   if(!patterns.has(id)||retry){
    if(retry)patternRetries.add(id);
    const candidate=stageSceneGlyphOwnership(glyphOcclusion,()=>withSceneFillRasterCache(source,budget,()=>measurePatternedSceneFrame({image:source,hint,textMasks:masks,budget,owners:[],glyphOcclusion,occlusionFrames})));
    patterns.set(id,candidate.value&&commitSceneGlyphOwnership(glyphOcclusion,candidate.receipt)?candidate.value:null);
   }
   return patterns.get(id)??null;
  },
  /** @param {Box} hint */
  patternFrame(hint){const fit=patterns.get(key(hint)),geometry=patternedSceneFrameGeometry(fit,image);
   return geometry?createMeasuredScenePortFrame(image,{...geometry,fill:'none'},fit):null;
  },
  /** Keep the private fill handle, rather than the surface caller's clone,
   * when composing already measured background and fragmented boundary paint.
   * @param {Box} hint @param {{id:string,regionId:string,inventory:boolean,slideSize:{widthPt:number,heightPt:number}}} output */
  patternOutput(hint,output){const id=key(hint),measurement=patterns.get(id),background=fills.get(id);
   return measurement?nativePatternedSceneOutput({image:source,measurement,...output,...(background?.parts?{background}:{})}):null;
  },
  /** Only a failed icon asks for this optional source context. Measurement
   * retains the original four-edge, color, scan and per-unit gates. No glyph
   * population is acquired by the parametric body scanner.
   * @param {Box} seed @param {Box} scope @param {Box[]} containers */
  iconRecovery(seed,scope,containers){
   const hint=sceneIconBackdropHint(seed,scope,masks,containers);
   if(!hint)return {glyphOcclusion};
   key(hint);
   return {glyphOcclusion,backdrop:measureSceneIconBackdrop(source,hint,masks,budget,glyphOcclusion)??undefined};
  },
  /** A cached failure reports observation stages, never provider content.
    * It performs no measurement and grants no source authority. @param {Box} hint */
  failure(hint){return outlineFailures.get(key(hint))??'container-source-evidence';},
  /** Report each measured alternative independently. A primary outline
   * failure cannot conceal an earlier fill budget rejection. Cached failures
   * do not re-read the source or inherit another query's rejection counters.
   * @param {Box} hint @returns {MeasurementFailure[]} */
  failureDetails(hint){
   const id=key(hint),outline=outlineFailures.get(id);
   return structuredClone([...(outlineFailureDetails.get(id)??(outline?[{path:/** @type {'outline'} */('outline'),code:outline}]:[])),
    ...(fillFailures.get(id)??[])]);
  },
  /** Compare only private admitted measurements, never provider bounds or
    * serialized controls. No source pixels are read and no ownership is added.
    * @param {Box} firstHint @param {Box} secondHint */
  sameSurface(firstHint,secondHint){
   const firstId=key(firstHint),secondId=key(secondHint),firstFill=fills.get(firstId),secondFill=fills.get(secondId);
   const firstOutline=outlines.get(firstId)||(firstFill?outlines.get(key(firstFill.box)):null);
   const secondOutline=outlines.get(secondId)||(secondFill?outlines.get(key(secondFill.box)):null);
   if(firstOutline&&secondOutline){
    const a=new Set(firstOutline.sourcePixels),b=new Set(secondOutline.sourcePixels);let shared=0;
    for(const cell of a)if(b.has(cell))shared++;
    // A coincident body cannot merge two independently observed perimeters.
    if(!a.size||!b.size||shared/a.size<.9||shared/b.size<.9)return false;
    return !firstFill||!secondFill||sameSceneFillComponent(firstFill,secondFill);
   }
   return !firstOutline&&!secondOutline&&sameSceneFillComponent(firstFill,secondFill);
  },
  /** A proposal cannot supply this token: its frame must already have passed
    * an independent cached source measurement. @param {Box} hint */
  portFrame(hint){
   const id=key(hint),outline=surfaceOutlines.get(id)||outlines.get(id),fill=fills.get(id);
   if(outline?.bodySegments&&outline.fill!=="none")return createMeasuredScenePortFrame(source,{box:outline.box,fill:outline.fill,segments:outline.bodySegments,perimeterPixels:outline.sourcePixels});
   if(outline?.portSegments&&outline.fill==='none')return createMeasuredScenePortFrame(source,{box:outline.box,fill:'none',segments:outline.portSegments,perimeterPixels:outline.sourcePixels});
   const body=independentParametric(id)??layered.get(id);
   // A drawing partition or disconnected union cannot mint a rectangular
   // proxy surface simply because its serialized fit lacks one path.
   return fill&&!fill.parts?createMeasuredScenePortFrame(source,fill):body?createMeasuredScenePortFrame(source,body):null;
  },
  /** @param {import("./source-scene-plan").Box} hint
   * @returns {{outline:ReturnType<typeof import('./source-scene-outline').measureOutlinedSceneContainer>,measured:Surface|null}} */
  surface(hint){return withSceneFillRasterCache(source,budget,()=>{
   const outline=this.outline(hint);
   if(outline){
    if(outline.fill!=="none")return {outline,measured:null};
    // An optional fill must not turn an accepted perimeter into a budget
    // exception. Reserve both original bounded scan windows, local samples,
    // tolerance probes and all overlapping unmeasured glyph windows first.
    const x=Math.max(0,Math.floor(hint.x-64)),y=Math.max(0,Math.floor(hint.y-64));
    const window={x,y,w:Math.min(source.width,Math.ceil(hint.x+hint.w+64))-x,h:Math.min(source.height,Math.ceil(hint.y+hint.h+64))-y};
    const reserve=2*Math.min(262144,window.w*window.h)+2324+sceneGlyphOcclusionScanReserve(glyphOcclusion,window);
    if(!fills.has(key(hint))&&budget.used+reserve>4000000){evidence.independentFillSkippedBudget++;return {outline,measured:null};}
    const measured=this.fill(hint);
    if(measured&&sceneFillEnclosedByRing(fills.get(key(hint)),source,outline)){
     const points=outline.sourcePixels.map(n=>({x:n%source.width,y:Math.floor(n/source.width)}));
     // The same 1.5px source-outline error and 120-segment limit remain intact.
     // Reuse the measured outer ring rather than storing a second paint contour.
     const segments=traceNativeMaskContours(points,outline.box,{tolerancePx:1.5,outerOnly:true,minimizeSegments:true});
     if(segments&&segments.filter(s=>s.type==="moveTo").length===1){
      outline.bodySegments=segments;outline.fill=measured.fill;outlines.set(key(hint),structuredClone(outline));
     }
    }
    return {outline,measured:null};
   }
   const measured=this.fill(hint);
    if(!measured||measured.parts&&sceneFillHasConnectedBody(fills.get(key(hint)),source)){
     // Drawing partitions describe source paint, not the complete physical
     // body. They must not short-circuit its independent boundary predicate.
     // Disconnected fragments retain their exact paint and rejection. Keep
     // the original fill proof; only a separately admitted, charged body
     // can supply the visible native surface and its matching port token.
     const id=key(hint);
     if(!parametric.has(id))parametric.set(id,measureSceneParametricSurface(source,hint,masks,budget));
     const body=independentParametric(id);
     if(body&&(!measured||sceneFillWithinParametricBody(fills.get(id),source,body.box)))return {outline:null,measured:structuredClone(body)};
     if(!measured)return {outline:null,measured};
   }
   if(measured.box.w<12||measured.box.h<12||key(measured.box)===key(hint))return {outline:null,measured};
   const area=sceneOutlineWindow(source,measured.box).area;
   if(!outlines.has(key(measured.box))&&(area>262144||budget.used+area>4000000)){evidence.measuredBoundarySkippedBudget++;return {outline:null,measured};}
   // A source color component measures the body, not its enclosing stroke.
   // Rebind the unchanged closed-ring proof to that physical body. Keep both
   // geometries; never inflate the fill or move either node to fit a relation.
   const boundary=this.outline(measured.box),a=boundary?.box,b=measured.box;
   if(!boundary||!a||boundary.fill==="none"||a.x>b.x||a.y>b.y||a.x+a.w<b.x+b.w||a.y+a.h<b.y+b.h
    ||[1,3,5].some(i=>Math.abs(Number.parseInt(boundary.fill.slice(i,i+2),16)-Number.parseInt(measured.fill.slice(i,i+2),16))>18))return {outline:null,measured};
   // Retain the independently admitted outer geometry under the original
   // query. The node uses that ring; its port token must use the same ring.
   // Keep the first outline failure and fill measurement intact. This adds
   // no scan, geometry adjustment, ownership or successful source predicate.
   surfaceOutlines.set(key(hint),structuredClone(boundary));
   evidence.measuredBoundaryOutlines++;return {outline:boundary,measured};
  });},
  /** @param {import("./source-scene-plan").Box} hint */
  fill(hint){const id=key(hint);if(fills.has(id)){evidence.fillReuses++;return structuredClone(fills.get(id)??null);}
   const before=sceneGlyphOcclusionRejections(glyphOcclusion);
   const fit=measureSceneContainer(source,hint,masks,budget,glyphOcclusion);
   const after=sceneGlyphOcclusionRejections(glyphOcclusion);
   /** @type {MeasurementFailure[]} */const failures=[];
   if(!fit){
    const glyphAttempts=after.glyphBudgetRejections-before.glyphBudgetRejections,scanAttempts=after.scanBudgetRejections-before.scanBudgetRejections;
    if(glyphAttempts)failures.push({path:'fill',code:'glyph-owned-budget',attempts:glyphAttempts,
     requestedGlyphs:after.lastRequestedGlyphs,remainingGlyphs:after.lastRemainingGlyphs});
    if(scanAttempts)failures.push({path:'fill',code:'glyph-source-scan-budget',attempts:scanAttempts});
    if(!failures.length)failures.push({path:'fill',code:'fill-source-evidence'});
   }
   fillFailures.set(id,failures);fills.set(id,fit);return structuredClone(fit);},
  /** @param {import("./source-scene-plan").Box} hint */
  outline(hint){const id=key(hint);if(outlines.has(id)){evidence.outlineReuses++;return structuredClone(outlines.get(id)??null);}
   // Scene proposals may be smaller than the outline scanner's 12px domain.
   // Keep strict hint validation above; reject only this optional measurement,
   // leaving independent fill evidence and later review authoritative.
   if(hint.w<12||hint.h<12){
    const code='outline-hint-below-minimum';outlines.set(id,null);outlineFailures.set(id,code);
    outlineFailureDetails.set(id,[{path:'outline',code,attempts:1}]);
    evidence.outlineRejections[code]=(evidence.outlineRejections[code]??0)+1;return null;
   }
   const measure=spatialExterior?measureOutlinedSceneContainerSpatial:measureOutlinedSceneContainerDetailed;
   const candidate=stageSceneGlyphOwnership(glyphOcclusion,()=>measure(source,hint,masks,budget,glyphOcclusion)),result=candidate.value;
   const fit=result.outline&&commitSceneGlyphOwnership(glyphOcclusion,candidate.receipt)?result.outline:null;
   if(!fit){outlineFailures.set(id,result.detailCode??'outline-ownership-commit');
    const stages=Object.entries(result.rejections).map(([code,attempts])=>({path:/** @type {'outline'} */('outline'),code,attempts}));
    outlineFailureDetails.set(id,stages.length?stages:[{path:'outline',code:result.detailCode??'outline-ownership-commit'}]);
    for(const [code,count]of Object.entries(result.rejections))evidence.outlineRejections[code]=(evidence.outlineRejections[code]??0)+count;}
   outlines.set(id,fit);return structuredClone(fit);},
  /** Only source measurements in this cache can authorize foreground owners.
    * Unknown hints do not turn provider rectangles into occlusion masks.
    * @param {Box} hint @param {Box[]} ownerHints */
  layeredBackground(hint,ownerHints){
   key(hint);if(!Array.isArray(ownerHints)||types.isProxy(ownerHints)||ownerHints.length>88
    ||Reflect.ownKeys(ownerHints).length!==ownerHints.length+1
    ||Object.values(Object.getOwnPropertyDescriptors(ownerHints)).some(p=>!("value" in p)))throw new TypeError("Scene background owners are invalid");
   /** @type {import('./source-scene-band-geometry').Owner[]} */const owners=[];
   for(const ownerHint of ownerHints){
    const id=key(ownerHint),outline=outlines.get(id),fill=fills.get(id);
    if(outline?.bodySegments&&outline.fill!=="none")owners.push({box:outline.box,segments:outline.bodySegments});
    else if(fill)owners.push({box:fill.box,...(fill.segments?{segments:fill.segments}:{})});
   }
   const fit=measureLayeredSceneBackground({image:source,hint,textMasks:masks,owners,budget});
   if(fit)layered.set(key(hint),structuredClone(fit));
   return fit;
  }
 };
}
/** Prepare all source-exclusion controls in one frame before constructing
 * measurements. Rendered typography remains owned by the output page.
 * @template {{text:string,box:Box,source?:Record<string,unknown>}} T
 * @param {import('./png').PngImage} image @param {T[]} texts
 * @param {{widthPt:number,heightPt:number}} size @param {{used:number}} budget
 * @param {unknown} [glyphOcclusion] @param {boolean} [spatialExterior] */
function createSceneTextMeasurementCache(image,texts,size,budget,glyphOcclusion,spatialExterior=false){
 const sourceTexts=sourceSceneTextBoxes(texts,image,size);
 const textMasks=sourceTexts.map(t=>({x:t.box.x*image.width/size.widthPt,y:t.box.y*image.height/size.heightPt,
  w:t.box.w*image.width/size.widthPt,h:t.box.h*image.height/size.heightPt}));
 return {textMasks,measurements:createSceneMeasurementCache(image,textMasks,budget,glyphOcclusion,spatialExterior)};
}
module.exports={createSceneMeasurementCache,createSceneTextMeasurementCache};
