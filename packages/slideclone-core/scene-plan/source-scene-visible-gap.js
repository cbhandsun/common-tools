// @ts-check
"use strict";
const {types}=require('node:util');
const {createHash}=require('node:crypto');
const {sourceRaster}=require('../typography/residual-text-mask');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {measuredScenePortAxis}=require('./source-scene-port-axis');
const {measuredScenePortFill}=require('./source-scene-port-evidence');
const {sourceVisibleGapProfile}=require('../routing/source-visible-gap-profile');
const {sourceVisibleDashProfile}=require('../routing/source-visible-dash-profile');
const {nativeSourceRouteGradient}=require('../routing/source-route-native-gradient');
const {sourceVisibleGapBackground}=require('../routing/source-visible-gap-background');
const {parseScenePathProgram}=require('./source-scene-path-program');
const {sourceVisibleGapProgramEvidence,sourceFilledGapProgramEvidence}=require('../routing/source-visible-gap-program');
const {measureDiagonalVisibleGap}=require('./source-scene-visible-gap-diagonal');
const {measureVisibleBentGap}=require('./source-scene-visible-bent-gap');
const {sourceVisibleGapExterior,sourceVisibleGapPort,sourceVisibleGapEndpointInk}=require('../routing/source-visible-gap-exterior');
const {stageSceneGlyphOwnership,commitSceneGlyphOwnership,sceneGlyphOcclusionMatches}=require('./source-scene-glyph-occlusion');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,portFrame?:unknown}} Node */
/** @typedef {{start:{x:number,y:number},end:{x:number,y:number},startSide:string,endSide:string,startPosition:number,endPosition:number,
 * startOffset:{x:number,y:number},endOffset:{x:number,y:number},color:string,widthPx:number,support:number,programMaxErrorPx?:number,diagonal?:boolean,
 * startInternal?:boolean,endInternal?:boolean,physical?:boolean,connectorType?:'elbow-2',strokeDashPattern?:string,
 * strokeGradient?:NonNullable<ReturnType<typeof import('../routing/source-route-native-gradient').nativeSourceRouteGradient>>,
 * sourcePath?:{box:Box,segments:NonNullable<ReturnType<typeof import('./native-mask-contours').traceNativeMaskContours>>}}} Fit */
/** @type {WeakMap<object,{fromId:string,toId:string,direction:string,width:number,height:number,pixels:Uint8Array,digest:string,cells:number[],retirement?:{horizontal:boolean,cells:number[]},program?:string,shaft?:string}>} */const proofs=new WeakMap();
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const record=v=>v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);
/** @param {unknown} v @returns {v is Box} */
const box=v=>record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isFinite(n))&&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;
/** @param {unknown} v @returns {v is Node} */
const node=v=>record(v)&&typeof v.id==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/u.test(v.id)&&box(v.box);
/** @param {unknown} v @param {number} limit @returns {Box[]} */
function boxes(v,limit){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>limit
 ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!('value'in p))||!v.every(box))throw new TypeError('Visible gap boxes are invalid');return v;}
/** Source paint and logical identity have separate contracts. This observes a
 * complete isolated arrow and both EMPTY corridors to explicit private nodes.
 * It does not claim physical attachment, close dashed gaps, guess nearest
 * nodes, move a perimeter or add objects. Keep all original scan/work caps.
 * @param {unknown} input @returns {{fit:Fit|null,reason:string}} */
function measureSourceSceneVisibleGap(input){
 if(!record(input)||!node(input.from)||!node(input.to)||input.from.id===input.to.id||!record(input.budget)
  ||typeof input.budget.used!=='number'||!Number.isSafeInteger(input.budget.used)||input.budget.used<0||input.budget.used>4000000
  ||input.sourceInk!==undefined&&typeof input.sourceInk!=='boolean'
  ||(typeof input.direction!=='string'||!['forward','backward','both','undirected'].includes(input.direction))||input.shaftBox!==undefined&&!box(input.shaftBox))throw new TypeError('Visible gap input is invalid');
 const source=sourceRaster(input.image);if(!record(input.image)||!Buffer.isBuffer(input.image.rgba))throw new TypeError('Visible gap source is invalid');
 const image={...source,rgba:input.image.rgba},from=input.from,to=input.to,budget=/** @type {{used:number}} */(input.budget),direction=String(input.direction);
 const texts=boxes(input.textMasks,10000),others=boxes(input.otherNodes??[],88);
 if([from.box,to.box,...texts,...others,...(box(input.shaftBox)?[input.shaftBox]:[])].some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Visible gap source frame is invalid');
 /** @param {string} reason @returns {{fit:null,reason:string}} */const reject=reason=>({fit:null,reason});
 const program=parseScenePathProgram(input.visiblePath,{widthPx:image.width,heightPx:image.height,coordinateSpace:'compiled-source-pixels',
  owner:{x:0,y:0,w:image.width,h:image.height},...(box(input.shaftBox)?{shaftBox:input.shaftBox}:{})});
 if(program&&program.vertices.length===3&&box(input.shaftBox)){
  const observed=measureVisibleBentGap({image,from,to,direction,texts,others,budget,shaft:input.shaftBox,program});
  if(!observed)return reject('gap-bent-source');
  const raw=observed.fit,fit=Object.freeze({...raw,start:Object.freeze(raw.start),end:Object.freeze(raw.end),
   startOffset:Object.freeze(raw.startOffset),endOffset:Object.freeze(raw.endOffset)});
  proofs.set(fit,{fromId:from.id,toId:to.id,direction,width:image.width,height:image.height,pixels:image.rgba,digest:createHash('sha256').update(image.rgba).digest('hex'),cells:observed.cells,
   program:JSON.stringify(program),shaft:JSON.stringify([input.shaftBox.x,input.shaftBox.y,input.shaftBox.w,input.shaftBox.h])});
  return {fit,reason:'source-visible-bent-gap-confirmed'};
 }
 if(program&&(program.vertices.length!==2||!box(input.shaftBox)))return reject('gap-program-representation');
 const axis=measuredScenePortAxis({image,from,to,...(box(input.shaftBox)?{shaftBox:input.shaftBox}:{})});
 if(!axis||input.sourceInk===true&&box(input.shaftBox)){
  if(program&&input.sourceInk!==true||!box(input.shaftBox))return reject('gap-private-axis');
  const shaft=input.shaftBox,glyph=input.glyphOcclusion!==undefined&&sceneGlyphOcclusionMatches(input.glyphOcclusion,image,budget)?input.glyphOcclusion:undefined;
  const staged=stageSceneGlyphOwnership(glyph,()=>measureDiagonalVisibleGap({image,from,to,direction,texts,others,budget,shaft,sourceInk:input.sourceInk===true,glyphOcclusion:glyph}));
  const observed=staged.value&&commitSceneGlyphOwnership(glyph,staged.receipt)?staged.value:null;
  if(!observed){if(!axis)return reject('gap-diagonal-source');}else{
  const raw=observed.fit;
  const evidence=program?sourceFilledGapProgramEvidence({program,shaft:input.shaftBox,fit:raw,cells:observed.cells,width:image.width,work:observed.work}):undefined;
  if(program&&!evidence)return reject('gap-program-source');
  if(raw.sourcePath){for(const s of raw.sourcePath.segments){for(const p of s.points)Object.freeze(p);Object.freeze(s.points);Object.freeze(s);}
   Object.freeze(raw.sourcePath.segments);Object.freeze(raw.sourcePath.box);Object.freeze(raw.sourcePath);}
  const fit=Object.freeze({...raw,...(evidence?{programMaxErrorPx:evidence.maxCenterlineErrorPx}:{}),start:Object.freeze(raw.start),end:Object.freeze(raw.end),
   startOffset:Object.freeze(raw.startOffset),endOffset:Object.freeze(raw.endOffset)});
  proofs.set(fit,{fromId:from.id,toId:to.id,direction,width:image.width,height:image.height,pixels:image.rgba,digest:createHash('sha256').update(image.rgba).digest('hex'),cells:observed.cells,
   ...(evidence?{program:evidence.proposal}:{}),
   ...(evidence||raw.strokeDashPattern?{shaft:JSON.stringify([input.shaftBox.x,input.shaftBox.y,input.shaftBox.w,input.shaftBox.h])}:{})});
  return {fit,reason:'source-visible-gap-confirmed'};
  }
 }
 const horizontal=axis.horizontal,a=from.box,b=to.box,increasing=horizontal?b.x>a.x:b.y>a.y;
 const first=horizontal?(increasing?a.x+a.w:a.x):(increasing?a.y+a.h:a.y),last=horizontal?(increasing?b.x:b.x+b.w):(increasing?b.y:b.y+b.h);
 const lo=Math.ceil(Math.min(first,last))+1,hi=Math.floor(Math.max(first,last))-1;
 if(hi-lo<8||hi-lo>512)return reject('gap-length');
 const across=Math.round(axis.axis),window=horizontal?{x:lo,y:across-12,w:hi-lo+1,h:25}:{x:across-12,y:lo,w:25,h:hi-lo+1};
 const intersects=(/** @type {Box} */r)=>r.x<window.x+window.w&&window.x<r.x+r.w&&r.y<window.y+window.h&&window.y<r.y+r.h;
 if(window.x<0||window.y<0||window.x+window.w>image.width||window.y+window.h>image.height||texts.some(intersects)||others.some(intersects))return reject('gap-window-ownership');
 if(window.w*window.h>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return reject('gap-source-budget');
 const raster=readSceneFillRaster(image,window,budget),area=window.w*window.h;
 const bodyColors=[measuredScenePortFill(image,from.portFrame,a),measuredScenePortFill(image,to.portFrame,b)].filter(p=>p!==null);
 const mask=new Uint8Array(area),foreign=new Uint8Array(area),border=new Uint8Array(area),work={checks:0};
 for(let i=0;i<area;i++){
  if((raster.rgba[i*4+3]??0)<240)return reject('gap-alpha');
  const x=i%window.w+window.x,y=Math.floor(i/window.w)+window.y,n=y*image.width+x,p=[raster.rgba[i*4]??0,raster.rgba[i*4+1]??0,raster.rgba[i*4+2]??0];
  border[i]=sourceVisibleGapEndpointInk(image,from,to,n)?1:0;
  foreign[i]=border[i]||bodyColors.some(c=>c.every((v,k)=>Math.abs(v-(p[k]??0))<=18))?1:0;
 }
 const background=sourceVisibleGapBackground({width:window.w,height:window.h,rgba:raster.rgba,foreign,horizontal,work});
 if(!background)return reject(work.checks>4000000?'gap-geometry-budget':'gap-background');
 for(let i=0;i<area;i++){
   const p=[raster.rgba[i*4]??0,raster.rgba[i*4+1]??0,raster.rgba[i*4+2]??0];
   const ink=background.end0&&background.end1
    ?Math.max(...background.end0.map((v,c)=>Math.abs(v-(p[c]??0))))>=42&&Math.max(...background.end1.map((v,c)=>Math.abs(v-(p[c]??0))))>=42
    :background.some((v,c)=>Math.abs(v-(p[c]??0))>=42);
   mask[i]=!foreign[i]&&ink?1:0;
  }
 const seen=new Uint8Array(area),components=[],observedComponents=[];let longComponents=0;
 for(let seed=0;seed<area;seed++)if(mask[seed]&&!seen[seed]){
  const cells=[seed];seen[seed]=1;let boundary=false;
  for(let k=0;k<cells.length;k++){
   const n=cells[k]??0,x=n%window.w,y=Math.floor(n/window.w);boundary ||=horizontal?y===0||y===window.h-1:x===0||x===window.w-1;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(++work.checks>4000000)return reject('gap-geometry-budget');const xx=x+dx,yy=y+dy,index=yy*window.w+xx;
    if(xx>=0&&xx<window.w&&yy>=0&&yy<window.h&&mask[index]&&!seen[index]){seen[index]=1;cells.push(index);}
   }
  }
  const positions=cells.map(n=>horizontal?n%window.w:Math.floor(n/window.w));
  observedComponents.push({cells,boundary});
  if(Math.max(...positions)-Math.min(...positions)>=8)longComponents++;
  const fit=boundary?null:sourceVisibleGapProfile({cells,width:window.w,horizontal,rgba:raster.rgba,direction,increasing,work,background});
  if(work.checks>4000000)return reject('gap-geometry-budget');
  if(fit)components.push({profile:fit,cells});
 }
 const dashed=!program?sourceVisibleDashProfile({components:observedComponents,width:window.w,horizontal,rgba:raster.rgba,direction,increasing,work,background}):null;
 if(!dashed&&(components.length!==1||longComponents!==1))return reject(components.length?'gap-ambiguous':'gap-visible-path');
 const component=dashed?{cells:observedComponents.flatMap(c=>c.cells),profile:dashed}:components[0],profile=component?.profile;
 if(!profile||!component)return reject('gap-visible-path');
 let programEvidence;
 if(program){
  work.checks+=24;if(work.checks>4000000)return reject('gap-geometry-budget');
  programEvidence=sourceVisibleGapProgramEvidence({program,shaftBox:input.shaftBox,widthPx:image.width,heightPx:image.height,
   window,horizontal,increasing,observed:profile});
  if(!programEvidence)return reject('gap-program-source');
 }
 const physicalAxis=profile.axis+(horizontal?window.y:window.x);
 // A disconnected stroke has no continuous center sample at the nomination.
 // Its complete observed runs supply the axis, inside the original declared
 // location scope. This grants no physical contact; the private projected
 // ports and every empty logical corridor below are still mandatory.
 if(dashed&&box(input.shaftBox)){
  const hint=input.shaftBox,low=horizontal?hint.y:hint.x,high=low+(horizontal?hint.h:hint.w);
  if(physicalAxis<low||physicalAxis>high)return reject('gap-axis');
 }else if(Math.abs(physicalAxis-across)>2)return reject('gap-axis');
 const startSide=horizontal?(increasing?'right':'left'):(increasing?'bottom':'top'),endSide=horizontal?(increasing?'left':'right'):(increasing?'top':'bottom');
 const startPort=sourceVisibleGapPort(image,from,physicalAxis,startSide),endPort=sourceVisibleGapPort(image,to,physicalAxis,endSide);
 if(!startPort||!endPort)return reject('gap-source-boundary');
 // Any unrelated source ink between the complete visible component and its
 // explicit node fails. Private border cells may be excluded; inferred fringe
 // and all other paint remain observed. A blank corridor grants no ink owner.
 const radius=Math.ceil(profile.widthPx/2);
 if(!sourceVisibleGapExterior({image,from,to,window,ports:[startPort,endPort],horizontal,axis:physicalAxis,radius,background,textMasks:texts,otherNodes:others,budget,work}))return reject('gap-corridor');
 for(let along=0;along<(horizontal?window.w:window.h);along++)if(along<profile.lo||along>profile.hi)
  for(let d=-radius;d<=radius;d++){
   const x=horizontal?along:Math.round(profile.axis)+d,y=horizontal?Math.round(profile.axis)+d:along,index=y*window.w+x;
   if(x<0||x>=window.w||y<0||y>=window.h)return reject('gap-corridor');
   if(!border[index]&&background.some((v,c)=>Math.abs(v-(raster.rgba[index*4+c]??0))>=42))return reject('gap-corridor');
  }
 const low=profile.lo+(horizontal?window.x:window.y),high=profile.hi+(horizontal?window.x:window.y);
 const startAlong=increasing?low:high,endAlong=increasing?high:low;
 const start=horizontal?{x:startAlong,y:physicalAxis}:{x:physicalAxis,y:startAlong},end=horizontal?{x:endAlong,y:physicalAxis}:{x:physicalAxis,y:endAlong};
 const startGap=(startAlong-(horizontal?startPort.x:startPort.y))*(increasing?1:-1),endGap=((horizontal?endPort.x:endPort.y)-endAlong)*(increasing?1:-1);
 if(startGap<0||endGap<0||Math.max(startGap,endGap)<=2)return reject('gap-not-distinct');
 const startPosition=horizontal?(physicalAxis-a.y)/a.h:(physicalAxis-a.x)/a.w,endPosition=horizontal?(physicalAxis-b.y)/b.h:(physicalAxis-b.x)/b.w;
 const boundaryStart=horizontal?{x:startSide==='right'?a.x+a.w:a.x,y:physicalAxis}:{x:physicalAxis,y:startSide==='bottom'?a.y+a.h:a.y};
 const boundaryEnd=horizontal?{x:endSide==='right'?b.x+b.w:b.x,y:physicalAxis}:{x:physicalAxis,y:endSide==='bottom'?b.y+b.h:b.y};
 const spatial=dashed?.spatial;
 const strokeGradient=spatial?nativeSourceRouteGradient([start,end],{stops:[],positions:[0,1],spatial:{...spatial,origin:spatial.origin+(horizontal?window.x:window.y)}}):undefined;
 if(spatial&&!strokeGradient)return reject('gap-spatial-paint');
 if(strokeGradient){for(const stop of strokeGradient.stops)Object.freeze(stop);Object.freeze(strokeGradient.stops);Object.freeze(strokeGradient);}
 const fit=Object.freeze({start:Object.freeze(start),end:Object.freeze(end),startSide,endSide,startPosition,endPosition,
  startOffset:Object.freeze({x:start.x-boundaryStart.x,y:start.y-boundaryStart.y}),endOffset:Object.freeze({x:end.x-boundaryEnd.x,y:end.y-boundaryEnd.y}),
  color:profile.color,widthPx:profile.widthPx,support:profile.support,...(dashed?{strokeDashPattern:dashed.strokeDashPattern}:{}),
  ...(strokeGradient?{strokeGradient}:{}),...(programEvidence?{programMaxErrorPx:programEvidence.maxCenterlineErrorPx}:{})});
 // The complete dash observer accounted for EVERY foreground component in
 // this window. Its remaining nonforeign samples are observed background.
 // Keep that separate, private authority for retiring old approximations;
 // blank dash intervals must never enter the source-paint ownership set.
 /** @type {number[]} */const retirement=[];
 if(dashed)for(let i=0;i<area;i++){
  if(++work.checks>4000000)return reject('gap-geometry-budget');
  const along=horizontal?i%window.w:Math.floor(i/window.w);
  if(!foreign[i]&&along>=profile.lo&&along<=profile.hi)
   retirement.push((Math.floor(i/window.w)+window.y)*image.width+i%window.w+window.x);
 }
 proofs.set(fit,{fromId:from.id,toId:to.id,direction,width:image.width,height:image.height,pixels:image.rgba,digest:createHash('sha256').update(image.rgba).digest('hex'),
  cells:component.cells.map(n=>(Math.floor(n/window.w)+window.y)*image.width+n%window.w+window.x),
  ...(dashed?{retirement:{horizontal,cells:retirement}}:{}),
  ...(programEvidence?{program:programEvidence.proposal}:{}),
  ...((programEvidence||dashed)&&box(input.shaftBox)?{shaft:JSON.stringify([input.shaftBox.x,input.shaftBox.y,input.shaftBox.w,input.shaftBox.h])}:{})});return {fit,reason:'source-visible-gap-confirmed'};
}
/** @param {unknown} fit @param {{fromId:string,toId:string,direction:string,width:number,height:number,visiblePath?:unknown,shaftBox?:unknown}} controls */
function isMeasuredSceneVisibleGap(fit,controls){const proof=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 if(!proof||!['fromId','toId','direction','width','height'].every(k=>proof[/** @type {keyof typeof proof} */(k)]===controls[/** @type {keyof typeof controls} */(k)]))return false;
 if(proof.shaft!==undefined){const shaft=controls.shaftBox;
  if(!box(shaft)||JSON.stringify([shaft.x,shaft.y,shaft.w,shaft.h])!==proof.shaft)return false;}
 if(proof.program===undefined)return controls.visiblePath===undefined;
 const shaft=controls.shaftBox;
 if(!box(shaft)||JSON.stringify([shaft.x,shaft.y,shaft.w,shaft.h])!==proof.shaft)return false;
 const program=parseScenePathProgram(controls.visiblePath,{widthPx:controls.width,heightPx:controls.height,coordinateSpace:'compiled-source-pixels',
  owner:{x:0,y:0,w:controls.width,h:controls.height}});
 return JSON.stringify(program)===proof.program;
}
/** A detached snapshot of this exact complete measured component. The shaft
 * proposal window, empty logical corridors, private node borders and inferred
 * attachment fringes never enter this set. This adds no scan or paint rights.
 * @param {unknown} image @param {unknown} fit @returns {Set<number>|null} */
function measuredSceneVisibleGapCells(image,fit){
 const proof=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 if(!proof||!record(image)||image.width!==proof.width||image.height!==proof.height||image.rgba!==proof.pixels)return null;
 return new Set(proof.cells);
}
/** The real full-slide residual builder decodes the same source again. Accept
 * only byte-identical RGBA and dimensions, plus the original private fit.
 * No public metadata, geometry envelope or blank interval can grant cells.
 * @param {unknown} image @param {unknown} fit @returns {Set<number>|null} */
function measuredSceneVisibleGapResidualCells(image,fit){
 const proof=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 if(!proof||!record(image)||image.width!==proof.width||image.height!==proof.height||!Buffer.isBuffer(image.rgba)
  ||image.rgba.length!==proof.pixels.length||createHash('sha256').update(image.rgba).digest('hex')!==proof.digest)return null;
 return new Set(proof.cells);
}
/** Complete dash-window classification only. This receipt retires legacy
 * approximation paint; it grants no erasure, source paint or node ownership.
 * @param {unknown} image @param {unknown} fit */
function measuredSceneVisibleGapRetirement(image,fit){
 const proof=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 if(!proof?.retirement||!record(image)||image.width!==proof.width||image.height!==proof.height||image.rgba!==proof.pixels)return null;
 return {horizontal:proof.retirement.horizontal,cells:new Set(proof.retirement.cells)};
}
module.exports={measureSourceSceneVisibleGap,isMeasuredSceneVisibleGap,measuredSceneVisibleGapCells,measuredSceneVisibleGapResidualCells,measuredSceneVisibleGapRetirement};
