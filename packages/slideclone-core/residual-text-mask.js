// @ts-check
"use strict";
const { types } = require("node:util");
const { parseResidualFill } = require("./residual-background-mask");
const { residualInkComponents, residualInkFringe } = require("./residual-ink-components");
const MAX_REGION_PIXELS = 262144;
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{color:readonly [number,number,number],polygon:readonly (readonly [number,number])[]}} TextInk */
/** @typedef {{color:number[],points:[number,number][],count:number}} Mode */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(entry=>"value" in entry);
}
/** @param {unknown} value @returns {Raster} */
function sourceRaster(value) {
  if(!record(value)||typeof value.width!=="number"||typeof value.height!=="number"
    ||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<1||value.height<1
    ||value.width>16384||value.height>16384||value.width*value.height>40000000
    ||types.isProxy(value.rgba)||!types.isUint8Array(value.rgba))throw new TypeError("residual text raster is invalid");
  const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,"buffer",value.rgba);
  const length=Reflect.get(prototype,"length",value.rgba),offset=Reflect.get(prototype,"byteOffset",value.rgba);
  if(!types.isArrayBuffer(buffer)||length!==value.width*value.height*4)throw new TypeError("residual text pixels are invalid");
  return {width:value.width,height:value.height,rgba:new Uint8Array(buffer,offset,length)};
}
/** @param {unknown} value @param {Raster} source @returns {Uint8Array|undefined} */
function textExclusion(value,source) {
  if(value===undefined)return undefined;
  if(types.isProxy(value)||!types.isUint8Array(value))throw new TypeError("residual text context is invalid");
  const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,"buffer",value);
  const length=Reflect.get(prototype,"length",value),offset=Reflect.get(prototype,"byteOffset",value);
  if(!types.isArrayBuffer(buffer)||length!==source.width*source.height)throw new TypeError("residual text context is invalid");
  return new Uint8Array(buffer,offset,length);
}
/** @param {unknown} value @param {Raster} source @returns {Box} */
function sourceBounds(value,source) {
  if(!record(value)||["x","y","w","h"].some(k=>typeof value[k]!=="number"||!Number.isSafeInteger(value[k])))throw new TypeError("residual text bounds are invalid");
  const bounds={x:/** @type {number} */(value.x),y:/** @type {number} */(value.y),w:/** @type {number} */(value.w),h:/** @type {number} */(value.h)};
  const area=bounds.w*bounds.h;
  if(!Number.isSafeInteger(area)||bounds.w<1||bounds.h<1||area>MAX_REGION_PIXELS)throw new RangeError("residual text scan exceeds the region pixel budget");
  if(bounds.x<0||bounds.y<0||bounds.x+bounds.w>source.width||bounds.y+bounds.h>source.height)throw new TypeError("residual text bounds are invalid");
  return bounds;
}
/** @param {unknown} value @returns {TextInk|undefined} */
function parseResidualTextInk(value) {
  if(value===undefined) return undefined;
  if(!record(value) || !Array.isArray(value.polygon) || types.isProxy(value.polygon) || value.polygon.length!==4
    || Object.values(Object.getOwnPropertyDescriptors(value.polygon)).some(entry=>!("value" in entry))) throw new TypeError("residual text evidence is invalid");
  const color=parseResidualFill(value.color);
  if(!color) throw new TypeError("residual text color is invalid");
  /** @type {[number,number][]} */ const polygon=[];
  for(const entry of /** @type {unknown[]} */(value.polygon)) {
    if(!Array.isArray(entry) || types.isProxy(entry) || entry.length!==2
      || Object.values(Object.getOwnPropertyDescriptors(entry)).some(property=>!("value" in property))) throw new TypeError("residual text polygon is invalid");
    const x=entry[0],y=entry[1];
    if(typeof x!=="number" || typeof y!=="number" || !Number.isFinite(x) || !Number.isFinite(y)
      || x<0 || y<0 || x>16384 || y>16384) throw new TypeError("residual text polygon is invalid");
    polygon.push([x,y]);
  }
  let area=0,orientation=0;
  for(let i=0;i<4;i++){
    const p=polygon[i],q=polygon[(i+1)%4],r=polygon[(i+2)%4];
    if(!p||!q||!r)throw new TypeError("residual text polygon is invalid");
    area+=p[0]*q[1]-p[1]*q[0];
    const cross=(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);
    if(cross===0||(orientation&&Math.sign(cross)!==orientation))throw new TypeError("residual text polygon is invalid");
    orientation=Math.sign(cross);
  }
  if(Math.abs(area)<1) throw new TypeError("residual text polygon is invalid");
  return {color,polygon};
}
/** @param {number} x @param {number} y @param {TextInk} ink */
function inside(x,y,ink) {
  let sign=0;
  for(let i=0;i<4;i++) {
    const p=ink.polygon[i],q=ink.polygon[(i+1)%4];if(!p||!q)return false;
    const cross=(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]);
    if(Math.abs(cross)<1e-6)continue;
    if(sign&&Math.sign(cross)!==sign)return false;
    sign=Math.sign(cross);
  }
  return true;
}
/** @param {number} x @param {number} y @param {TextInk} ink @param {number} margin */
function supported(x,y,ink,margin) {
  if(inside(x,y,ink))return true;
  for(let i=0;i<4;i++){
    const a=ink.polygon[i],b=ink.polygon[(i+1)%4];if(!a||!b)return false;
    const vx=b[0]-a[0],vy=b[1]-a[1],norm=vx*vx+vy*vy;
    const t=norm?Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/norm)):0;
    if(Math.hypot(x-a[0]-t*vx,y-a[1]-t*vy)<=margin)return true;
  }
  return false;
}
/** @param {readonly number[]} a @param {readonly number[]} b */
function distance(a,b){return Math.max(...a.map((v,i)=>Math.abs(v-(b[i]??0))));}
/** @param {Raster} source @param {number} x @param {number} y @param {readonly number[]} color */
function stableBackground(source,x,y,color) {
  if(x<1||y<1||x>=source.width-1||y>=source.height-1)return false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const offset=((y+dy)*source.width+x+dx)*4;
    if((source.rgba[offset+3]??0)<64||color.some((v,c)=>Math.abs(v-(source.rgba[offset+c]??0))>16))return false;
  }
  return true;
}
/** Background witnesses must be outside the measured text polygon. Interior
 * antialias shades can never nominate themselves as a background mode.
 * @param {Raster} source @param {Box} bounds @param {TextInk} ink @param {Uint8Array|undefined} exclusion
 * @param {readonly number[]|undefined} [requiredBackground] */
function backgroundModes(source,bounds,ink,exclusion,requiredBackground) {
  /** @type {Map<string,Mode>} */ const buckets=new Map();
  for(let y=bounds.y;y<bounds.y+bounds.h;y++)for(let x=bounds.x;x<bounds.x+bounds.w;x++) {
    if(inside(x+.5,y+.5,ink))continue;
    // A stable patch inside a neighboring glyph is still foreground. Reject
    // witnesses whose 3x3 support intersects any admitted text polygon.
    if(exclusion){let text=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx>=0&&x+dx<source.width&&y+dy>=0&&y+dy<source.height&&exclusion[(y+dy)*source.width+x+dx])text=true;
    }if(text)continue;}
    const o=(y*source.width+x)*4;
    if((source.rgba[o+3]??0)<64)continue;
    const color=[source.rgba[o]??0,source.rgba[o+1]??0,source.rgba[o+2]??0];
    if(distance(color,ink.color)<64||!stableBackground(source,x,y,color))continue;
    const key=color.map(v=>Math.round(v/16)).join(",");
    let mode=buckets.get(key);if(!mode){mode={color:[0,0,0],points:[],count:0};buckets.set(key,mode);}
    mode.count++;for(let c=0;c<3;c++)mode.color[c]=(mode.color[c]??0)+(color[c]??0);
    // Every witness retains its position; the number is bounded by the ROI.
    mode.points.push([x,y]);
  }
  const modes=[...buckets.values()].filter(mode=>mode.count>=4).sort((a,b)=>b.count-a.count)
    .map(mode=>({...mode,color:mode.color.map(v=>Math.round(v/mode.count))}));
  const reference=modes[0];if(!reference)return [];
  // A darker neighboring glyph cannot become the background of dark text,
  // even when a fitted native font color is lighter than its actual source.
  // Use the observed background direction, not a fixed light/dark palette.
  const eligible=modes.filter(mode=>mode.color.reduce((sum,v,c)=>sum+(v-(ink.color[c]??0))*((reference.color[c]??0)-(ink.color[c]??0)),0)>0);
  const selected=eligible.slice(0,8);
  // A measured target can be rarer than adjacent backgrounds in the OCR
  // context. Reserve one existing slot for its independently observed mode;
  // a proposed color alone cannot create a witness or increase the mode cap.
  if(requiredBackground&&!selected.some(mode=>distance(mode.color,requiredBackground)<=18)){
    const witnessed=eligible.find(mode=>distance(mode.color,requiredBackground)<=18);
    if(witnessed){if(selected.length===8)selected.pop();selected.push(witnessed);}
  }
  return selected;
}
/** @param {readonly number[]} color @param {readonly number[]} foreground @param {readonly number[]} background */
function mixture(color,foreground,background) {
  let dot=0,norm=0;
  for(let c=0;c<3;c++){const delta=(foreground[c]??0)-(background[c]??0);dot+=((color[c]??0)-(background[c]??0))*delta;norm+=delta*delta;}
  const alpha=norm>0?dot/norm:0;
  const error=Math.max(...color.map((v,c)=>Math.abs(v-((background[c]??0)+alpha*((foreground[c]??0)-(background[c]??0))))));
  return {alpha,error};
}
/** Produce a source-backed per-pixel plan, never a rectangle owner. Background
 * pixels remain byte-identical. Only components with a measured glyph seed
 * are replaced, including their antialias fringe; boundary-connected graphics
 * are retained for a separate owner rather than silently erased as text.
 * @param {unknown} sourceValue @param {unknown} boundsValue @param {unknown} inkValue @param {unknown} [exclusionValue] */
function compileResidualTextMask(sourceValue,boundsValue,inkValue,exclusionValue) {
  const plan=compileTextMask(sourceValue,boundsValue,inkValue,exclusionValue,262144);
  if(!plan)throw new TypeError("residual text plan is invalid");
  return plan;
}
/** Reject a whole optional proof before ownership assignment when its complete
 * candidate population cannot fit the remaining allowance. Background cells
 * are scan work, never glyph population. Neither counters nor masks are split.
 * @param {unknown} sourceValue @param {unknown} boundsValue @param {unknown} inkValue
 * @param {unknown} options */
function compileBoundedResidualTextMask(sourceValue,boundsValue,inkValue,options) {
  if(!record(options)||Reflect.ownKeys(options).length!==2
    ||!Number.isSafeInteger(options.remainingOwned)||Number(options.remainingOwned)<0||Number(options.remainingOwned)>100000)
    throw new TypeError("residual text ownership allowance is invalid");
  const fill=parseResidualFill(options.backgroundColor);
  if(!fill)throw new TypeError("residual text background evidence is invalid");
  return compileTextMask(sourceValue,boundsValue,inkValue,undefined,Number(options.remainingOwned),fill);
}
/** Observe all independently witnessed backgrounds for an icon/text separation
 * proof. This grants no paint-color bridge. The complete candidate population
 * must fit the same shared glyph allowance before any ownership is assigned.
 * @param {unknown} source @param {unknown} bounds @param {unknown} ink @param {unknown} remaining */
function compileBoundedObservedTextMask(source,bounds,ink,remaining){
  if(typeof remaining!=='number'||!Number.isSafeInteger(remaining)||remaining<0||remaining>100000)
    throw new TypeError('residual text ownership allowance is invalid');
  return compileTextMask(source,bounds,ink,undefined,remaining);
}
/** @param {unknown} sourceValue @param {unknown} boundsValue @param {unknown} inkValue
 * @param {unknown} exclusionValue @param {number} maximumOwned
 * @param {readonly number[]} [requiredBackground] */
function compileTextMask(sourceValue,boundsValue,inkValue,exclusionValue,maximumOwned,requiredBackground) {
  const source=sourceRaster(sourceValue),bounds=sourceBounds(boundsValue,source),ink=parseResidualTextInk(inkValue);
  if(!ink)throw new TypeError("residual text evidence is invalid");
  const area=bounds.w*bounds.h;
  const exclusion=textExclusion(exclusionValue,source);
  const modes=backgroundModes(source,bounds,ink,exclusion,requiredBackground);
  if(requiredBackground&&!modes.some(mode=>distance(mode.color,requiredBackground)<=18))return null;
  const supportMargin=Math.min(...ink.polygon.map((p,i)=>{const q=ink.polygon[(i+1)%4];return q?Math.hypot(p[0]-q[0],p[1]-q[1]):0;}))/2;
  const candidates=new Uint8Array(area),seed=new Uint8Array(area),solid=new Uint8Array(area),background=new Uint8Array(area*3);
  // Nearest witnesses propagate their modes in four linear passes. This avoids
  // comparing every pixel with every witness, and keeps scan cost bounded.
  const labels=new Int16Array(area).fill(-1),cost=new Uint32Array(area).fill(0xffffffff);
  for(let m=0;m<modes.length;m++)for(const p of modes[m]?.points??[]) {
    const index=(p[1]-bounds.y)*bounds.w+p[0]-bounds.x;labels[index]=m;cost[index]=0;
  }
  // Source pixels that match a witnessed background extend that region into
  // the text polygon. This follows a highlight's true boundary rather than
  // filling the centers of black glyphs from a distant white page perimeter.
  for(let i=0;i<area;i++) {
    const x=bounds.x+i%bounds.w,y=bounds.y+Math.floor(i/bounds.w),o=(y*source.width+x)*4;
    if((source.rgba[o+3]??0)<64)continue;
    const color=[source.rgba[o]??0,source.rgba[o+1]??0,source.rgba[o+2]??0];
    if(!stableBackground(source,x,y,color))continue;
    let best=17;
    for(let m=0;m<modes.length;m++){const delta=distance(color,modes[m]?.color??[]);if(delta<best){best=delta;labels[i]=m;cost[i]=0;}}
  }
  /** @param {number} to @param {number} from */
  function propagate(to,from){if(from<0||from>=area)return;const next=(cost[from]??Infinity)+1;if(next<(cost[to]??Infinity)){cost[to]=next;labels[to]=labels[from]??-1;}}
  for(let i=0;i<area;i++){if(i%bounds.w)propagate(i,i-1);propagate(i,i-bounds.w);}
  for(let i=area-1;i>=0;i--){if(i%bounds.w<bounds.w-1)propagate(i,i+1);propagate(i,i+bounds.w);}
  // A fitted native font color is not the source pigment. Calibrate fringe
  // mixtures only from strong source cores inside the measured polygon. This
  // cannot introduce another solid component or seed outside that evidence.
  /** @type {Map<string,{color:number[],count:number}>} */const pigments=new Map();
  for(let i=0;i<area;i++) {
    const x=bounds.x+i%bounds.w,y=bounds.y+Math.floor(i/bounds.w),o=(y*source.width+x)*4;
    const mode=modes[labels[i]??-1];
    if(!mode||(source.rgba[o+3]??0)<64||!inside(x+.5,y+.5,ink))continue;
    if(requiredBackground&&distance(mode.color,requiredBackground)>18)continue;
    const color=[source.rgba[o]??0,source.rgba[o+1]??0,source.rgba[o+2]??0];
    if(distance(color,ink.color)>65||distance(color,mode.color)<64)continue;
    const key=color.map(v=>v>>4).join(',');
    let pigment=pigments.get(key);
    if(!pigment){pigment={color:[0,0,0],count:0};pigments.set(key,pigment);}
    pigment.count++;for(let c=0;c<3;c++)pigment.color[c]=(pigment.color[c]??0)+(color[c]??0);
  }
  const observedPigments=[...pigments.values()].filter(p=>p.count>=4).sort((a,b)=>b.count-a.count).slice(0,8)
    .map(p=>p.color.map(v=>v/p.count));
  let corePixels=0;
  for(let i=0;i<area;i++) {
    const x=bounds.x+i%bounds.w,y=bounds.y+Math.floor(i/bounds.w),o=(y*source.width+x)*4;
    const mode=modes[labels[i]??-1];if(!mode||(source.rgba[o+3]??0)<64)continue;
    const color=[source.rgba[o]??0,source.rgba[o+1]??0,source.rgba[o+2]??0];
    background.set(mode.color,i*3);
    // An optional paint proof owns ink only on its independently witnessed
    // target background. Other modes remain propagation context; charging
    // their glyphs exhausts the shared allowance without authorizing paint.
    // Select the complete candidate population before the unchanged cap.
    if(requiredBackground&&distance(mode.color,requiredBackground)>18)continue;
    if(distance(color,mode.color)<=16)continue;
    const fit=mixture(color,ink.color,mode.color);
    const measuredCore=distance(color,ink.color)<=65&&distance(color,mode.color)>=64;
    // Font fitting can change the native color. Stronger source contrast in
    // the same witnessed direction is measured ink, not an invalid opacity.
    const observedFringe=!measuredCore&&(fit.error>16||fit.alpha<=0)&&observedPigments.some(pigment=>{
      const observed=mixture(color,pigment,mode.color);
      return observed.error<=16&&observed.alpha>0&&observed.alpha<.65;
    });
    if(!measuredCore&&(fit.error>16||fit.alpha<=0)&&!observedFringe)continue;
    candidates[i]=1;
    if(measuredCore||(!observedFringe&&fit.alpha>=.65))solid[i]=1;
    if(inside(x+.5,y+.5,ink)&&solid[i]){seed[i]=1;corePixels++;}
  }
  // Both admitted core cells and fringe are subsets of candidates. This is a
  // conservative upper bound before any owned mask or owned count is created.
  if(candidates.reduce((sum,value)=>sum+value,0)>maximumOwned)return null;
  const componentLabels=residualInkComponents(candidates,solid,bounds.w);
  const owned=new Uint8Array(area),seen=new Uint8Array(area),queue=new Int32Array(area);
  let ownedPixels=0,rejectedBoundaryPixels=0,rejectedSupportPixels=0;
  for(let i=0;i<area;i++) {
    if(!candidates[i]||!componentLabels[i]||seen[i])continue;
    let tail=1,head=0,hasSeed=false,touchesBoundary=false,leavesTextSupport=false;queue[0]=i;seen[i]=1;
    while(head<tail){const j=queue[head++]??0,x=j%bounds.w,y=Math.floor(j/bounds.w);hasSeed ||= seed[j]===1;
      touchesBoundary ||= x===0||y===0||x===bounds.w-1||y===bounds.h-1;
      const sx=bounds.x+x,sy=bounds.y+y;
      leavesTextSupport ||= !exclusion?.[sy*source.width+sx]&&!supported(sx+.5,sy+.5,ink,supportMargin);
      for(const n of [x?j-1:-1,x<bounds.w-1?j+1:-1,y?j-bounds.w:-1,y<bounds.h-1?j+bounds.w:-1]){
        if(n>=0&&candidates[n]&&componentLabels[n]===componentLabels[i]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
      }
    }
    if(!hasSeed)continue;
    if(touchesBoundary){rejectedBoundaryPixels+=tail;continue;}
    if(leavesTextSupport){rejectedSupportPixels+=tail;continue;}
    for(let q=0;q<tail;q++){owned[queue[q]??0]=1;ownedPixels++;}
  }
  const fringe=residualInkFringe(candidates,solid,bounds.w,owned);
  for(let i=0;i<area;i++){
    if(owned[i]||solid[i]||componentLabels[i]||fringe[i]!==1)continue;
    const x=i%bounds.w,y=Math.floor(i/bounds.w),sx=bounds.x+x,sy=bounds.y+y;
    if(x===0||y===0||x===bounds.w-1||y===bounds.h-1)continue;
    if(!exclusion?.[sy*source.width+sx]&&!supported(sx+.5,sy+.5,ink,supportMargin))continue;
    owned[i]=1;ownedPixels++;
  }
  return {bounds,ink,owned,core:seed,background,backgroundDistance:cost,ownedPixels,corePixels,rejectedBoundaryPixels,rejectedSupportPixels,backgroundModes:modes.length,scannedPixels:area};
}
module.exports={parseResidualTextInk,compileResidualTextMask,compileBoundedResidualTextMask,compileBoundedObservedTextMask,sourceRaster,insideTextPolygon:inside};
