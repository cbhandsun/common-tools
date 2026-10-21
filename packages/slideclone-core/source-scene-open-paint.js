// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {parseBandBackground}=require('./source-scene-band-geometry');
const {parsePrimitiveCandidate,constructPrimitiveCandidate}=require('./source-scene-primitive-candidate');
const {primitiveProgramPaths}=require('./source-scene-primitive-paths');
const {primitiveSourceRaster}=require('./source-scene-primitive-raster');
const {hasMeasuredScenePortFrame,measuredScenePortPerimeterCells,measuredScenePortBodyMask,measuredSceneOpaqueSurface}=require('./source-scene-port-evidence');
const {measuredSceneVisibleGapPaint}=require('./source-scene-visible-gap-compiler');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {[number,number,number]} Color */
/** @typedef {ReturnType<typeof constructPrimitiveCandidate>['shapes'][number]} Shape */
/** @typedef {{image:{width:number,height:number,rgba:Uint8Array},window:Box,box:Box,
 * pixel:(x:number,y:number)=>Color|null,parts:Shape[],snapshots:(string|null)[],cells:Set<number>,
 * ownerId:string,foreign:Uint8Array,relations:Set<number>,checks:number,
 * frames:{id:string,token:unknown,box:Box}[]}} Observation */
/** This receipt proves literal source paint only, never whole-owner completion,
 * a shared surface, glyph erasure, attachment, physical grouping or opacity.
 * @type {WeakMap<object,Observation>} */const observations=new WeakMap();
/** @param {number[]} values */
function median(values){values.sort((a,b)=>a-b);const v=values[Math.floor(values.length/2)];if(v===undefined)throw new TypeError('Open paint samples are empty');return v;}
/** @param {Color[]} colors @returns {Color} */
function medianColor(colors){return /** @type {Color} */([0,1,2].map(c=>median(colors.map(p=>p[/** @type {0|1|2} */(c)]))));}
/** @param {Color} a @param {Color} b */
const difference=(a,b)=>Math.max(...a.map((v,c)=>Math.abs(v-(b[c]??0))));
/** @param {unknown} value */
function snapshot(value){if(!record(value)||!record(value.source)||!record(value.style))return null;
 return sceneGroupSnapshot({...value,style:{paint:value.style,source:value.source}});}
/** Observe complete proposed OPEN paint paths on one charged owner snapshot.
 * Unlike a closed-body detector, this emits only traced observed pixel cells:
 * no centerline interpolation, missing interval, hidden closure, filled owner
 * or inferred stroke footprint. Low-contrast paint has no body/port powers.
 * The 6-channel local-background stability, 18/.82 source paint agreement,
 * .9 path support, .75 contour error and original shared budgets remain fixed.
 * @param {unknown} input */
function observeOpenScenePaint(input){
 if(!record(input)||Reflect.ownKeys(input).some(k=>typeof k!=='string'||!['image','recipe','slideSize','budget','textMasks','foreignFrames','relationParts'].includes(k))
  ||!record(input.slideSize))throw new TypeError('Open source paint controls are invalid');
 const recipe=parsePrimitiveCandidate(input.recipe);
 if(recipe.kind!=='openPaths')throw new TypeError('Open source paint representation is invalid');
 const parsed=parseBandBackground({image:input.image,hint:recipe.box,budget:input.budget,textMasks:input.textMasks,owners:[]});
 if(!Buffer.isBuffer(parsed.image.rgba))throw new TypeError('Open source paint pixels are invalid');
 const image={...parsed.image,rgba:parsed.image.rgba},{budget,textMasks}=parsed;
 const frame={widthPx:image.width,heightPx:image.height,widthPt:input.slideSize.widthPt,heightPt:input.slideSize.heightPt};
 constructPrimitiveCandidate(recipe,frame);
 const foreignFrames=input.foreignFrames??[],relationParts=input.relationParts??[];
 if(!list(foreignFrames)||foreignFrames.length>88||!list(relationParts)||relationParts.length>48)
  throw new TypeError('Open source paint dependencies are invalid');
 /** @type {{id:string,token:unknown,box:Box}[]} */const frames=[];const frameIds=new Set();
 for(const entry of foreignFrames){
  if(!record(entry)||Reflect.ownKeys(entry).some(k=>typeof k!=='string'||!['id','token','box'].includes(k))
   ||typeof entry.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(entry.id)||frameIds.has(entry.id)||!validBox(entry.box))
   throw new TypeError('Open source paint dependency identity is invalid');
  if(!hasMeasuredScenePortFrame(image,entry.token,entry.box))
   return {failure:'open-foreign-source',constructed:recipe.paths?.length??0};
  frameIds.add(entry.id);frames.push({id:entry.id,token:entry.token,box:{...entry.box}});
 }
 const relations=new Set();for(const part of relationParts){
  const cells=measuredSceneVisibleGapPaint(image,part);
  if(!cells)return {failure:'open-relation-source',constructed:recipe.paths?.length??0};
  for(const cell of cells)relations.add(cell);
 }
 const x=Math.max(0,Math.floor(recipe.box.x-12)),y=Math.max(0,Math.floor(recipe.box.y-12));
 const window={x,y,w:Math.min(image.width,Math.ceil(recipe.box.x+recipe.box.w+12))-x,h:Math.min(image.height,Math.ceil(recipe.box.y+recipe.box.h+12))-y};
 const raster=primitiveSourceRaster(image,window,budget);
 if(!raster)return {failure:'open-source-budget',constructed:recipe.paths?.length??0};
 const work={checks:0,exhausted:false};
 /** @param {number} amount */const spend=amount=>{work.checks+=amount;work.exhausted=work.checks>4000000;return !work.exhausted;};
 /** @param {number} px @param {number} py */const read=(px,py)=>spend(1)?raster.pixel(px,py):null;
 // Unknown alpha anywhere in the complete source observation stays unknown.
 for(let yy=y;yy<y+window.h;yy++)for(let xx=x;xx<x+window.w;xx++)if(!read(xx,yy))
  return {failure:work.exhausted?'open-geometry-budget':'open-source-alpha',constructed:recipe.paths?.length??0};
 const foreign=new Uint8Array(window.w*window.h);
 for(const entry of frames){
  const perimeter=measuredScenePortPerimeterCells(image,entry.token,entry.box,window);
  for(const cell of perimeter){if(!spend(1))return {failure:'open-geometry-budget',constructed:recipe.paths?.length??0};foreign[cell]=1;}
  if(!measuredSceneOpaqueSurface(image,entry.token))continue;
  const stripHeight=Math.max(1,Math.floor(262144/window.w));
  for(let sy=y;sy<y+window.h;sy+=stripHeight){
   const strip={...window,y:sy,h:Math.min(stripHeight,y+window.h-sy)};
   const mask=measuredScenePortBodyMask(image,entry.token,entry.box,strip,work);
   if(!mask)return {failure:'open-geometry-budget',constructed:recipe.paths?.length??0};
   for(let i=0;i<mask.length;i++)if(mask[i])foreign[(sy-y)*window.w+i]=1;
  }
 }
 /** @param {number} px @param {number} py */const blocked=(px,py)=>{
  const at=(py-y)*window.w+px-x;
  return px>=x&&px<x+window.w&&py>=y&&py<y+window.h&&(foreign[at]===1||relations.has(py*image.width+px));
 };
 /** @param {number} px @param {number} py */const textPoint=(px,py)=>textMasks.some(b=>px>=b.x&&px<b.x+b.w&&py>=b.y&&py<b.y+b.h);
 const program=primitiveProgramPaths(recipe,image);
 const cells=new Set();/** @type {Shape[]} */const parts=[];
 const pathEvidence=[];
 for(const [index,stroke]of program.strokes.entries()){
  const endpoint=program.faces[index]?.vertices.at(-1),points=endpoint?[...stroke,endpoint]:stroke;
  const shape=program.faces[index]?.shape;
  if(!shape||points.length<8)return {failure:'open-path-capacity',constructed:program.faces.length};
  let supported=0,dependencies=0;const selected=new Set(),offsets=[];
  /** @type {Point[]} */const positions=[];
  /** @type {Point[]} */const sites=[];
  /** @type {{paint:{x:number,y:number,color:Color}[],offset:number}[]} */const observed=[];
  /** @type {(()=>{paint:{x:number,y:number,color:Color}[],offset:number}|null)[]} */const initial=[];
  /** @type {((color:Color)=>{paint:{x:number,y:number,color:Color}[],offset:number}|null)[]} */const refined=[];
  for(const [i,p]of points.entries()){
   if(!spend(1))return {failure:'open-geometry-budget',constructed:program.faces.length};
   // Keep the last sample's normal oriented along the path too. Reversing
   // p -> previous flips a constant source offset at the endpoint and falsely
   // rejects a straight measured ridge as a bent path.
   const next=points[i+1],previous=points[i-1];if(!next&&!previous)continue;
   const dx=next?next.x-p.x:p.x-/** @type {Point} */(previous).x;
   const dy=next?next.y-p.y:p.y-/** @type {Point} */(previous).y;
   const length=Math.hypot(dx,dy);if(!length)continue;
   const nx=-dy/length,ny=dx/length;
   const px=Math.floor(p.x),py=Math.floor(p.y);
   if(textPoint(px,py))return {failure:'open-path-text',constructed:program.faces.length};
   if(blocked(px,py)){dependencies++;continue;}
   /** @type {{x:number,y:number,color:Color}[]} */const core=[];const seen=new Set();
   for(let d=-4;d<=4;d++){
    const sx=Math.floor(p.x+nx*d),sy=Math.floor(p.y+ny*d),key=sy*image.width+sx;
    if(seen.has(key)||blocked(sx,sy)||textPoint(sx,sy))continue;seen.add(key);
    const color=read(sx,sy);if(color)core.push({x:sx,y:sy,color});
   }
   /** Fit the observed path palette before allowing a darker neighboring
    * ridge to attract this path. Every refined sample still needs the SAME
    * bilateral source/background, support, pose and contour proofs.
    * @param {Color} [expected] */const probe=expected=>{
   const eligible=expected?core.filter(c=>difference(c.color,expected)<=18):core;
   // Match geometry within the measured palette, rather than following a
   // slightly darker crossing of the same color. Invalid candidates still
   // fail their complete bilateral proof; no source gap is interpolated.
   eligible.sort((a,b)=>expected?Math.hypot(a.x+.5-p.x,a.y+.5-p.y)-Math.hypot(b.x+.5-p.x,b.y+.5-p.y):
    a.color.reduce((s,v)=>s+v,0)-b.color.reduce((s,v)=>s+v,0));
   for(const peak of eligible){
   /** @param {number} sign @returns {Color|null} */const background=sign=>{
    for(let offset=2;offset<=6;offset++){
     /** @type {Color[]} */const samples=[];
     for(let distance=offset;distance<offset+3;distance++){
      const sx=Math.round(peak.x+nx*distance*sign),sy=Math.round(peak.y+ny*distance*sign);
      if(blocked(sx,sy)||textPoint(sx,sy))break;const color=read(sx,sy);if(!color)break;samples.push(color);
     }
     if(samples.length!==3)continue;const center=medianColor(samples);
     if(samples.every(c=>difference(c,center)<=6))return center;
    }return null;
   };
   const a=background(-1),b=background(1);if(!a||!b)continue;
   // A paint cell is an actual local minimum against BOTH observed sides.
   // A color step or blank/noisy patch cannot nominate an entire interior.
   const paint=eligible.filter(c=>Math.hypot(c.x-peak.x,c.y-peak.y)<=2
    &&[a,b].every(bg=>c.color.every((v,channel)=>v+6<=(bg[channel]??0))));
   if(!paint.some(c=>c===peak))continue;
   return {paint,offset:(peak.x+.5-p.x)*nx+(peak.y+.5-p.y)*ny};
   }return null;
   };
   initial.push(()=>probe());refined.push(color=>probe(color));positions.push(p);
  }
  const seeds=initial.flatMap(probe=>probe()?.paint.map(c=>c.color)??[]);
  if(work.exhausted)return {failure:'open-geometry-budget',constructed:program.faces.length};
  if(seeds.length<8)return {failure:'open-path-source',constructed:program.faces.length,path:index,support:0,dependencies};
  const palette=medianColor(seeds);
  if(seeds.filter(c=>difference(c,palette)<=18).length/seeds.length<.82)
   return {failure:'open-path-paint',constructed:program.faces.length};
  for(const [sampleIndex,probe]of refined.entries()){const sample=probe(palette);if(!sample)continue;
   const position=positions[sampleIndex];if(!position)throw new TypeError('Open source paint sample is invalid');sites.push(position);
   supported++;offsets.push(sample.offset);observed.push(sample);
  }
  if(work.exhausted)return {failure:'open-geometry-budget',constructed:program.faces.length};
  if(observed.reduce((sum,s)=>sum+s.paint.length,0)<8||supported/points.length<.82||(supported+dependencies)/points.length<.9)
   return {failure:'open-path-source',constructed:program.faces.length,path:index,support:supported/points.length,dependencies};
  const offset=median(offsets.slice()),inliers=observed.filter(s=>Math.abs(s.offset-offset)<=1.5);
  const rejectedPoseSamples=observed.length-inliers.length;
  // An off-path sample is unknown, not owner paint. The complete original
  // support gates must STILL hold after rejecting it. We emit no interpolation
  // across the resulting gap, which remains an independent census obligation.
  if(inliers.length/points.length<.82||(inliers.length+dependencies)/points.length<.9)
   return {failure:'open-path-pose',constructed:program.faces.length,path:index,maxCenterlineErrorPx:Math.max(...offsets.map(v=>Math.abs(v-offset))),
   minOffsetPx:Math.min(...offsets),maxOffsetPx:Math.max(...offsets),
   outliers:offsets.flatMap((value,i)=>Math.abs(value-offset)>1.5?[{point:sites[i],offsetPx:value}]:[]).slice(0,8)};
  supported=inliers.length;const maxCenterlineErrorPx=Math.max(...inliers.map(s=>Math.abs(s.offset-offset)));
  for(const sample of inliers)for(const c of sample.paint)selected.add(c.y*image.width+c.x);
  if(selected.size<8)return {failure:'open-path-source',constructed:program.faces.length,path:index,support:supported/points.length,dependencies};
  const samples=[...selected].map(cell=>read(cell%image.width,Math.floor(cell/image.width)));
  if(samples.some(c=>c===null))return {failure:'open-geometry-budget',constructed:program.faces.length};
  const colors=/** @type {Color[]} */(samples),color=medianColor(colors);
  if(colors.filter(c=>difference(c,color)<=18).length/colors.length<.82)
   return {failure:'open-path-paint',constructed:program.faces.length};
  const vertices=[...selected].map(cell=>({x:cell%image.width,y:Math.floor(cell/image.width)}));
  const bx=Math.min(...vertices.map(p=>p.x)),by=Math.min(...vertices.map(p=>p.y));
  const box={x:bx,y:by,w:Math.max(...vertices.map(p=>p.x))+1-bx,h:Math.max(...vertices.map(p=>p.y))+1-by};
  const segments=traceNativeMaskContours(vertices,box,{tolerancePx:.75,fastFail:true,workState:work});
  if(!segments)return {failure:work.exhausted?'open-geometry-budget':'open-native-capacity',constructed:program.faces.length};
  const sx=Number(frame.widthPt)/image.width,sy=Number(frame.heightPt)/image.height;
  parts.push({id:recipe.id+'-open-'+index,type:'freeform',box:{x:box.x*sx,y:box.y*sy,w:box.w*sx,h:box.h*sy},
   style:{fill:'#'+color.map(c=>c.toString(16).padStart(2,'0')).join(''),stroke:'none',strokeWidthPt:0,freeformSegments:segments},
   source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'section-panel-outline',
    detector:'source-scene-open-paint',sceneRegionId:recipe.id,preserveResidualInterior:true}});
  for(const cell of selected)cells.add(cell);
  pathEvidence.push({path:index,support:supported/points.length,dependencies,pixels:selected.size,maxCenterlineErrorPx,rejectedPoseSamples});
 }
 const snapshots=parts.map(snapshot);if(snapshots.some(s=>s===null))return {failure:'open-native-snapshot',constructed:parts.length};
 const receipt=Object.freeze({});observations.set(receipt,{image,window,box:{...recipe.box},pixel:raster.pixel,parts,snapshots,cells,ownerId:recipe.id,foreign,relations,checks:work.checks,frames});
 return {failure:/** @type {null} */(null),constructed:parts.length,parts,receipt,evidence:{paths:pathEvidence,sourcePixels:budget.used,geometryChecks:work.checks},
  ownerCompleted:false,portsAuthorized:false,opaqueBodyAuthorized:false};
}
/** This is source-paint observation, NOT a completion receipt. The complete
 * owner transaction must independently cover the full source and dependencies.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token
 * @param {unknown[]} parts */
function retainedOpenScenePaint(image,token,parts){
 const proof=token!==null&&typeof token==='object'?observations.get(token):undefined;
 if(!proof||!record(image)||image.rgba!==proof.image.rgba||image.width!==proof.image.width||image.height!==proof.image.height
  ||!list(parts)||parts.length!==proof.parts.length||parts.some((p,i)=>p!==proof.parts[i]||snapshot(p)!==proof.snapshots[i]))return null;
 return {ownerId:proof.ownerId,window:{...proof.window},box:{...proof.box},cells:new Set(proof.cells),checks:proof.checks,foreignFrameIds:proof.frames.map(f=>f.id)};
}
module.exports={observeOpenScenePaint,retainedOpenScenePaint};
