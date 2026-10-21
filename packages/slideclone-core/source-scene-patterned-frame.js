// @ts-check
"use strict";
const {parseBandBackground}=require('./source-scene-band-geometry');
const {sceneOutlineWindow,sceneOutlineReadWindows,sceneOutlineExteriorEvidence}=require('./source-scene-outline');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {sampleAtomInteriorFill,sampleAtomInteriorFillSeeds}=require('./visual-atom-interior-fill');
const {sourceRingTextOwned}=require('./source-ring-text-ownership');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {measureSourceOutlineColor}=require('./source-outline-color');
const {measureSourceOutlinePaint}=require('./source-outline-paint');
const {attachedSceneRailMarks}=require('./source-scene-attached-rail-mark');
const {sceneFrameGapCoverage}=require('./source-scene-frame-occlusion');
const {sourceFragmentedCorner}=require('./source-scene-fragmented-corner');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{box:Box,points:Point[],members?:Component[]}} Component */
/** @typedef {NonNullable<ReturnType<typeof traceNativeMaskContours>>} Segments */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,box:Box,segments:Segments,perimeterPixels:number[]}>} */const proofs=new WeakMap();
/** Observe a fragmented perimeter independently of continuous-ring topology.
 * Four repeated rails and four source corners must identify one enclosure.
 * Only observed cells are drawn; gaps never become paint or erase authority.
 * This optional consumer reuses the original charged outline window, contour
 * error, geometry work and path/parent capacities. Unknown OCR ownership fails.
 * @param {unknown} input */
function measurePatternedSceneFrame(input){
 const {image,hint,textMasks,budget}=parseBandBackground(input);
 const work={checks:0,exhausted:false};
 const covered=sceneFrameGapCoverage(image,/** @type {Record<string,unknown>} */(input).occlusionFrames,work);
 const win=sceneOutlineWindow(image,hint);
 const windows=sceneOutlineReadWindows(win),sampleCost=win.dense?0:2880;
 if(win.area+sampleCost>262144||budget.used+sampleCost+windows.reduce((sum,w)=>sum+sceneFillRasterReadCost(image,w,budget),0)>4000000)return null;
 const strips=windows.map(window=>({window,raster:readSceneFillRaster(image,window,budget)}));
 // Sparse observations reserve all 24x24 interior probes (one full sample
 // and four seed samples). They exclude background only, never add paint.
 budget.used+=sampleCost;
 /** @param {number} x @param {number} y */
 const pixel=(x,y)=>{const strip=strips.find(s=>x>=s.window.x&&y>=s.window.y&&x<s.window.x+s.window.w&&y<s.window.y+s.window.h);
  if(!strip)throw new TypeError('Patterned frame read reached an unobserved cell');
  const i=((y-strip.window.y)*strip.raster.width+x-strip.window.x)*4;return [0,1,2,3].map(c=>strip.raster.rgba[i+c]??0);};
 const exterior=sceneOutlineExteriorEvidence({...image,rgba:Buffer.from(image.rgba.buffer,image.rgba.byteOffset,image.rgba.byteLength)},win.x0,win.y0,win.x1,win.y1,pixel);if(!exterior.stable)return null;
 const sample=sampleAtomInteriorFill(image,hint,textMasks);
 const interiorColors=(sample?[{color:sample.color}]:sampleAtomInteriorFillSeeds(image,hint,textMasks))
  .map(s=>[1,3,5].map(i=>Number.parseInt(s.color.slice(i,i+2),16)));
 const ink=new Set(),colors=new Map();
 for(const {window}of strips)for(let y=window.y;y<window.y+window.h;y++)for(let x=window.x;x<window.x+window.w;x++){
  const p=pixel(x,y),contrast=(/** @type {number[]} */c)=>Math.max(...c.map((v,i)=>Math.abs(v-(p[i]??0))));
  if((p[3]??0)>=240&&(exterior.colors?Math.min(...exterior.colors.map(contrast)):contrast(exterior.fill))>=18
   &&interiorColors.every(c=>contrast(c)>=18)&&!covered.owns(x+.5,y+.5,p.slice(0,3))){const cell=y*image.width+x;ink.add(cell);colors.set(cell,p.slice(0,3));}
 }
 if(work.exhausted)return null;
 // A component cut by the unknown core cannot testify that it is a dash:
 // its unseen continuation might be text, a branch or a larger drawing.
 const components=sourceComponents(ink,image.width).filter(c=>win.dense||!c.points.some(p=>
  ((p.x===win.x0+2*win.margin-1||p.x===win.x1-2*win.margin)&&p.y>=win.y0+2*win.margin&&p.y<win.y1-2*win.margin)
  ||((p.y===win.y0+2*win.margin-1||p.y===win.y1-2*win.margin)&&p.x>=win.x0+2*win.margin&&p.x<win.x1-2*win.margin)));
 const rails=frameRails(components,hint,win.margin,work,textMasks,covered);
 if(!rails)return null;
 const {marks,corners}=rails;
 const selected=[...new Set([...marks,...corners.flatMap(c=>c.members??[c])])];
 const points=selected.flatMap(c=>c.points);
 const box={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),
  w:Math.max(...points.map(p=>p.x))+1-Math.min(...points.map(p=>p.x)),h:Math.max(...points.map(p=>p.y))+1-Math.min(...points.map(p=>p.y))};
 if(sourceRingTextOwned({image,budget,points,textMasks,glyphOcclusion:/** @type {Record<string,unknown>} */(input).glyphOcclusion}))return null;
 const parts=paintParts(selected,box,work);if(!parts)return null;
 const hull=convexBoundary(points,work);if(!hull||hull.length<4||hull.length+2>120)return null;
 const first=hull[0];if(!first)return null;
 const segments=[{type:'moveTo',points:[{x:(first.x-box.x)/box.w,y:(first.y-box.y)/box.h}]},
  ...hull.slice(1).map(p=>({type:'lnTo',points:[{x:(p.x-box.x)/box.w,y:(p.y-box.y)/box.h}]})),{type:'close',points:[]}];
 const colorInput={points,colors,width:image.width},paint=measureSourceOutlinePaint(colorInput,work);
 if(work.exhausted)return null;
 const measurement={box,parts,color:measureSourceOutlineColor(colorInput),sourcePixels:points.map(p=>p.y*image.width+p.x),
  ...(paint&&parts.length+paint.parts.length<=32?{paint}:{})};
 if(measurement.paint){
  for(const p of measurement.paint.parts){Object.freeze(p.box);for(const s of p.segments){s.points.forEach(Object.freeze);Object.freeze(s.points);Object.freeze(s);}Object.freeze(p.segments);Object.freeze(p);}
  Object.freeze(measurement.paint.box);Object.freeze(measurement.paint.parts);Object.freeze(measurement.paint);
 }
 for(const part of parts){for(const s of part){s.points.forEach(Object.freeze);Object.freeze(s.points);Object.freeze(s);}Object.freeze(part);}
 Object.freeze(box);Object.freeze(parts);Object.freeze(measurement.sourcePixels);Object.freeze(measurement);
 proofs.set(measurement,{pixels:image.rgba,width:image.width,height:image.height,box:{...box},segments:structuredClone(segments),perimeterPixels:measurement.sourcePixels.slice()});
 return measurement;
}
/** Four-neighbor components of the fully observed source window.
 * @param {Set<number>} ink @param {number} width @returns {Component[]} */
function sourceComponents(ink,width){
 const components=[];
 while(ink.size){const seed=/** @type {number} */(ink.values().next().value),pending=[seed];ink.delete(seed);
  const points=[];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(let i=0;i<pending.length;i++){const n=pending[i];if(n===undefined)throw new TypeError('Patterned frame source cell is invalid');
   const x=n%width,y=Math.floor(n/width);points.push({x,y});x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const next of[x?n-1:-1,x+1<width?n+1:-1,n-width,n+width])if(ink.delete(next))pending.push(next);
  }
  components.push({points,box:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}});
 }
 return components;
}
/** Source fragments nominate rails, never the proposal rectangle alone.
 * At least three separate marks establish each repeated rail. A missing side,
 * missing source corner or unexplained long gap cannot become an enclosure.
 * @param {Component[]} components @param {Box} hint @param {number} margin @param {{checks:number,exhausted:boolean}} work @param {Box[]} textMasks
 * @param {(side:number,start:number,end:number,track:number,thickness:number,allowance:number)=>boolean} covered */
function frameRails(components,hint,margin,work,textMasks,covered){
 const small=components.filter(c=>c.points.length>=4&&c.box.w<=hint.w*.5&&c.box.h<=hint.h*.5);
 /** @param {number} side @returns {Component[]} */
 const candidates=side=>small.filter(c=>{
  const b=c.box,horizontal=side<2,position=side===0?b.y:side===1?b.y+b.h:side===2?b.x:b.x+b.w;
  const expected=side===0?hint.y:side===1?hint.y+hint.h:side===2?hint.x:hint.x+hint.w;
  return (horizontal?b.w>=b.h&&b.h<=12:b.h>=b.w&&b.w<=12)&&Math.abs(position-expected)<=margin;
 });
 /** @param {Component[]} rows @param {number} side */
 const fit=(rows,side)=>{
  const observedRows=rows;
  const thickness=rows.map(c=>side<2?c.box.h:c.box.w).sort((a,b)=>a-b);
  // Corners and attached arrows can be thicker than the repeated rail. Use
  // its corroborated thickness cluster, rather than a median shifted by
  // those different component roles; every cluster comparison is bounded.
  let support=0;
  /** @type {number|undefined} */let typical;
  for(const seed of thickness){let count=0;for(const value of thickness){
   if(++work.checks>4000000){work.exhausted=true;return null;}
   if(Math.abs(value-seed)<=1.5)count++;
  }if(count>support){support=count;typical=seed;}}
  if(typical===undefined)return null;
  const measuredThickness=typical;
  rows=rows.filter(c=>Math.abs((side<2?c.box.h:c.box.w)-measuredThickness)<=1.5);
  const axis=(/** @type {Component} */c)=>side===0?c.box.y:side===1?c.box.y+c.box.h:side===2?c.box.x:c.box.x+c.box.w;
  const track=(/** @type {Component} */c)=>side<2?c.box.y+(c.box.h-1)/2:c.box.x+(c.box.w-1)/2;
  // Ragged outer edges need not share their rectangle endpoint. The same
  // observed source stroke must support a common rail track instead. Keep
  // the original 1.5px source tolerance; this grants no paint in a gap.
  const supportsTrack=(/** @type {Component} */c,/** @type {number} */coordinate)=>c.points.some(p=>{
   if(++work.checks>4000000){work.exhausted=true;return false;}
   return Math.abs((side<2?p.y:p.x)-coordinate)<=1.5;
  });
  /** @type {Component[][]} */const groups=[];
  for(const seed of rows){const group=[];for(const c of rows){
   if(++work.checks>4000000){work.exhausted=true;return null;}
   if(supportsTrack(c,track(seed)))group.push(c);
  }groups.push(group);}
  groups.sort((a,b)=>b.length-a.length);
  const group=groups[0];if(!group||group.length<2)return null;
  const centers=group.map(axis).sort((a,b)=>a-b),coordinate=centers[Math.floor(centers.length/2)];
  if(coordinate===undefined)return null;
  const tracks=group.map(track).sort((a,b)=>a-b),commonTrack=tracks[Math.floor(tracks.length/2)];
  if(commonTrack===undefined)return null;
  const retained=group.filter(c=>supportsTrack(c,commonTrack)).sort((a,b)=>side<2?a.box.x-b.box.x:a.box.y-b.box.y);
  if(work.exhausted)return null;
  if(retained.length<2)return null;
  // The repeated core establishes a track. Retain a rougher straight mark
  // only when its ENTIRE source component stays in that measured stroke band
  // plus the same contour tolerance. A corner or branch cannot pass this.
  for(const c of observedRows)if(!retained.includes(c)&&supportsTrack(c,commonTrack)&&c.points.every(p=>{
   if(++work.checks>4000000){work.exhausted=true;return false;}
   return Math.abs((side<2?p.y:p.x)-commonTrack)<=measuredThickness/2+1.5;
  }))retained.push(c);
  if(work.exhausted)return null;
  retained.push(...attachedSceneRailMarks({components,marks:retained,hint,side,work,textMasks}));
  if(work.exhausted)return null;
  retained.sort((a,b)=>side<2?a.box.x-b.box.x:a.box.y-b.box.y);
  /** @type {{start:number,end:number}[]} */const runs=[];
  for(const c of retained){const start=side<2?c.box.x:c.box.y,end=start+(side<2?c.box.w:c.box.h),last=runs[runs.length-1];
   if(last&&start-last.end<=1.5)last.end=Math.max(last.end,end);else runs.push({start,end});
  }
  if(runs.length<2)return null;
  const longest=Math.max(...runs.map(r=>r.end-r.start));
  for(let i=1;i<runs.length;i++){const a=runs[i-1],b=runs[i];if(!a||!b||b.start-a.end>longest&&!covered(side,a.end,b.start,commonTrack,measuredThickness,longest))return null;}
  return {coordinate,marks:retained,track:commonTrack,thickness:measuredThickness};
 };
 const sides=[0,1,2,3].map(i=>fit(candidates(i),i));if(sides.some(s=>!s))return null;
 const top=sides[0],bottom=sides[1],left=sides[2],right=sides[3];if(!top||!bottom||!left||!right)return null;
 const box={x:left.coordinate,y:top.coordinate,w:right.coordinate-left.coordinate,h:bottom.coordinate-top.coordinate};
 if(box.w<hint.w*.7||box.w>hint.w*1.35||box.h<hint.h*.55||box.h>hint.h*1.6)return null;
 const marks=sides.flatMap(s=>s?.marks??[]),cornerLimit=Math.max(...marks.map(c=>Math.max(c.box.w,c.box.h)));
 const markSet=new Set(marks);
 const verticalThickness=Math.max(...[...left.marks,...right.marks].map(c=>c.box.w));
 const horizontalThickness=Math.max(...[...top.marks,...bottom.marks].map(c=>c.box.h));
 const corners=[];
 for(const [x,y]of[[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]]){
  if(x===undefined||y===undefined)return null;
  const farX=x===box.x+box.w,farY=y===box.y+box.h;
  /** @param {Component} corner */
  const witnessedTurn=corner=>{
   const innerX=farX?corner.box.x:corner.box.x+corner.box.w-1,innerY=farY?corner.box.y:corner.box.y+corner.box.h-1;
   // Two observed arms and an empty inner corner distinguish a turn from a
   // thick straight dash. Test this evidence before counting ambiguity.
   return corner.points.some(p=>Math.abs(p.y+(farY?1:0)-y)<=horizontalThickness+1.5&&Math.abs(p.x+(farX?1:0)-x)>verticalThickness+1.5)
    &&corner.points.some(p=>Math.abs(p.x+(farX?1:0)-x)<=verticalThickness+1.5&&Math.abs(p.y+(farY?1:0)-y)>horizontalThickness+1.5)
    &&!corner.points.some(p=>Math.abs(p.x-innerX)<=1.5&&Math.abs(p.y-innerY)<=1.5);
  };
  const matches=small.filter(c=>!markSet.has(c)&&c.box.w>verticalThickness+1.5&&c.box.h>horizontalThickness+1.5
   &&Math.max(Math.abs((c.box.x+c.box.w/2)-x),Math.abs((c.box.y+c.box.h/2)-y))<=cornerLimit&&witnessedTurn(c));
  let corner=matches[0];
  if(matches.length>1)return null;
  if(!corner){
   const members=sourceFragmentedCorner({components:small,x,y,farX,farY,limit:cornerLimit,
    horizontalThickness:(farY?bottom:top).thickness,verticalThickness:(farX?right:left).thickness,work});
   if(!members)return null;
   const points=members.flatMap(c=>c.points),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
   corner={box:{x:minX,y:minY,w:Math.max(...points.map(p=>p.x))+1-minX,h:Math.max(...points.map(p=>p.y))+1-minY},points,members};
  }
  corners.push(corner);
 }
 for(const [side,index]of sides.entries()){
  if(!index)return null;
  const endCorners=side===0?[corners[0],corners[1]]:side===1?[corners[2],corners[3]]:side===2?[corners[0],corners[2]]:[corners[1],corners[3]];
  // A short rail needs two separate marks PLUS both independently witnessed
  // source turns. Neither a proposed box nor a branch replaces those turns.
  if(index.marks.length<3&&(index.marks.length!==2||endCorners.some(c=>!c)||endCorners[0]===endCorners[1]))return null;
  const runs=[...index.marks,...endCorners.filter((/** @type {Component|undefined} */c)=>c!==undefined)]
   .map(c=>({start:side<2?c.box.x:c.box.y,end:side<2?c.box.x+c.box.w:c.box.y+c.box.h})).sort((a,b)=>a.start-b.start);
  const longest=Math.max(...index.marks.map(c=>side<2?c.box.w:c.box.h));
  for(let i=1;i<runs.length;i++){const a=runs[i-1],b=runs[i];if(!a||!b||b.start-a.end>longest&&!covered(side,a.end,b.start,index.track,index.thickness,longest))return null;}
 }
 return {box,marks,corners};
}
/** Batch exact observed paint, retaining the existing 120 commands per path
 * and 32 native parts per parent. Batching never joins separate ink components.
 * @param {Component[]} components @param {Box} box @param {{checks:number,exhausted:boolean}} work */
function paintParts(components,box,work){
 /** @type {Segments[]} */const parts=[];let pending=/** @type {Segments} */([]);
 for(const component of components){
  const traced=traceNativeMaskContours(component.points,component.box,{tolerancePx:1.5,workState:work});if(!traced)return null;
  const segments=traced.map(s=>({...s,points:s.points.map(p=>({x:(component.box.x+p.x*component.box.w-box.x)/box.w,y:(component.box.y+p.y*component.box.h-box.y)/box.h}))}));
  if(segments.some(s=>s.points.some(p=>p.x<0||p.y<0||p.x>1||p.y>1)))return null;
  if(pending.length+segments.length>120){parts.push(pending);pending=[];}
  pending.push(...segments);
 }
 if(pending.length)parts.push(pending);
 return parts.length&&parts.length<=32?parts:null;
}
/** An enclosure's contour joins only ordered extreme observed corner/rail
 * cells. It is geometry for source attachment, never a drawable solid ring.
 * @param {Point[]} points @param {{checks:number,exhausted:boolean}} work */
function convexBoundary(points,work){
 const unique=[...new Map(points.map(p=>[`${p.x},${p.y}`,p])).values()].sort((a,b)=>{
  if(++work.checks>4000000){work.exhausted=true;return 0;}return a.x-b.x||a.y-b.y;
 });
 if(work.exhausted)return null;
 /** @param {Point} a @param {Point} b @param {Point} c */const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 /** @param {Point[]} rows */const half=rows=>{const hull=[];for(const p of rows){while(hull.length>1){const a=hull[hull.length-2],b=hull[hull.length-1];if(!a||!b||cross(a,b,p)>0)break;hull.pop();}hull.push(p);}return hull.slice(0,-1);};
 return [...half(unique),...half(unique.slice().reverse())];
}
/** Private source geometry survives only on the measuring raster; clones and
 * serialized fields cannot acquire ports or enclosure membership.
 * @param {unknown} measurement @param {import('./png').PngImage} image */
function patternedSceneFrameGeometry(measurement,image){
 const proof=measurement!==null&&typeof measurement==='object'?proofs.get(measurement):undefined;
 return proof&&proof.pixels===image.rgba&&proof.width===image.width&&proof.height===image.height
  ?{box:{...proof.box},segments:structuredClone(proof.segments),perimeterPixels:proof.perimeterPixels.slice()}:null;
}
module.exports={measurePatternedSceneFrame,patternedSceneFrameGeometry};
