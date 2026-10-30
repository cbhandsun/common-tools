// @ts-check
"use strict";
const { types } = require("node:util");
const { maskBounds, pointInMask, sampleMaskBackgroundColor } = require("./raster-native-detection");
const { parseResidualFill, sourcePixelMatchesResidualFill } = require("./residual-background-mask");
const { residualTextPlans, textBackgroundOwned } = require("../typography/residual-text-erasure");
const { sharedResidualBackdropPlans } = require("./source-shared-residual-union");
const MAX_PIXELS = 40000000;
const MAX_MASKS = 30000;
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);
}
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @returns {Raster} */
function raster(value) {
  if (!record(value) || typeof value.width !== "number" || typeof value.height !== "number"
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1
    || value.width > 16384 || value.height > 16384 || value.width*value.height > MAX_PIXELS
    || types.isProxy(value.rgba) || !types.isUint8Array(value.rgba)) throw new TypeError("residual ownership raster is invalid");
  const prototype=Object.getPrototypeOf(Uint8Array.prototype);
  const buffer=Reflect.get(prototype,"buffer",value.rgba), length=Reflect.get(prototype,"length",value.rgba);
  if (!types.isArrayBuffer(buffer) || length !== value.width*value.height*4) throw new TypeError("residual ownership pixels are invalid");
  return {width:value.width,height:value.height,rgba:new Uint8Array(buffer,Reflect.get(prototype,"byteOffset",value.rgba),length)};
}
/** Audit actual visible foreground against the source and each erasure's sampled background.
 * Counts describe pixels, never infer semantic ownership from object counts or box overlap.
 * @param {unknown} input */
function auditResidualPixelOwnership(input) {
  if (!record(input) || !Array.isArray(input.masks) || types.isProxy(input.masks) || input.masks.length > MAX_MASKS
    || Object.values(Object.getOwnPropertyDescriptors(input.masks)).some(property=>!("value" in property))) throw new TypeError("residual ownership masks are invalid");
  const source=raster(input.source), residual=raster(input.residual);
  if (source.width !== residual.width || source.height !== residual.height) throw new TypeError("residual ownership dimensions differ");
  const owned=new Uint8Array(source.width*source.height);
  // Validate mask records before the text planner inspects their properties.
  if(input.masks.some(value=>!record(value)))throw new TypeError("residual ownership mask is invalid");
  const routeBackgrounds=sharedResidualBackdropPlans(source,input.masks);
  const plans=residualTextPlans(source,[.../** @type {import("../typography/residual-text-erasure").Mask[]} */(input.masks)]);
  const textOwned=new Uint8Array(owned.length);
  for(const plan of plans)for(let i=0;i<plan.owned.length;i++)if(plan.owned[i]){
    textOwned[(plan.bounds.y+Math.floor(i/plan.bounds.w))*source.width+plan.bounds.x+i%plan.bounds.w]=1;
  }
  let scannedPixels=0, ownedPixels=0, ownedForegroundPixels=0, remainingOwnedForegroundPixels=0;
  let remainingOwnedBackgroundPixels=0;
  for (const value of /** @type {unknown[]} */ (input.masks)) {
    if (!record(value) || (value.kind !== undefined && value.kind !== "line" && value.kind !== "rect")) throw new TypeError("residual ownership mask is invalid");
    const names=value.kind === "line" ? ["x1","y1","x2","y2","width"] : ["x","y","w","h"];
    if (names.some(name=>typeof value[name] !== "number" || !Number.isFinite(value[name]) || Math.abs(/** @type {number} */ (value[name])) > 100000)) throw new TypeError("residual ownership mask geometry is invalid");
    if ((value.kind === "line" && /** @type {number} */ (value.width) <= 0)
      || (value.kind !== "line" && (/** @type {number} */ (value.w) <= 0 || /** @type {number} */ (value.h) <= 0))) throw new TypeError("residual ownership mask size is invalid");
    const sourceFill=parseResidualFill(value.sourceFill);
    if(value.sourceRouteInk!==undefined)continue;
    if(value.textInk!==undefined) {
      if(value.kind==="line"||sourceFill)throw new TypeError("residual text mask geometry is invalid");
      continue;
    }
    if (sourceFill && value.kind === "line") throw new TypeError("residual background mask geometry is invalid");
    /** @type {import("./raster-native-detection").Mask} */
    const mask=value.kind === "line" ? {kind:"line",x1:/** @type {number} */(value.x1),y1:/** @type {number} */(value.y1),x2:/** @type {number} */(value.x2),y2:/** @type {number} */(value.y2),width:/** @type {number} */(value.width)}
      : {x:/** @type {number} */(value.x),y:/** @type {number} */(value.y),w:/** @type {number} */(value.w),h:/** @type {number} */(value.h)};
    const bounds=maskBounds(mask,source), fill=sampleMaskBackgroundColor(source,mask), residualFill=sampleMaskBackgroundColor(residual,mask);
    const cost=bounds.w*bounds.h;
    if (!Number.isSafeInteger(cost) || cost < 0 || scannedPixels+cost > MAX_PIXELS) throw new RangeError("residual ownership scan exceeds the page pixel budget");
    scannedPixels+=cost;
    for(let y=bounds.y;y<bounds.y+bounds.h;y++) for(let x=bounds.x;x<bounds.x+bounds.w;x++) {
      if (!pointInMask(x,y,mask)) continue;
      const index=y*source.width+x, offset=index*4;
      // A panel may resemble a glyph's antialias fringe. The text plan owns
      // that source ink and validates its replacement below, independently
      // of the panel's fill-color admission.
      if(textOwned[index])continue;
      if (!sourcePixelMatchesResidualFill(source.rgba,offset,sourceFill)) continue;
      if (sourceFill && (residual.rgba[offset+3]??0)>=64) remainingOwnedBackgroundPixels++;
      if ((owned[index]??0)&2) continue;
      if (!owned[index]) ownedPixels++;
      owned[index]=1;
      const alpha=source.rgba[offset+3]??0;
      const contrast=Math.max(Math.abs((source.rgba[offset]??0)-fill.r),Math.abs((source.rgba[offset+1]??0)-fill.g),Math.abs((source.rgba[offset+2]??0)-fill.b));
      if(alpha < 64 || contrast <= 16) continue;
      owned[index]=3;
      ownedForegroundPixels++;
      const residualContrast=Math.max(Math.abs((residual.rgba[offset]??0)-residualFill.r),Math.abs((residual.rgba[offset+1]??0)-residualFill.g),Math.abs((residual.rgba[offset+2]??0)-residualFill.b));
      const retained=(residual.rgba[offset+3]??0)>=64 && residualContrast>16
        && [0,1,2].every(channel=>Math.abs((source.rgba[offset+channel]??0)-(residual.rgba[offset+channel]??0))<=16);
      if(retained) remainingOwnedForegroundPixels++;
    }
  }
  // Recompile source evidence rather than trusting an eraser's claimed bitmap
  // or object count. Text owns ink, never the background of its entire box.
  let remainingTextCorePixels=0,incorrectTextBackgroundPixels=0,unresolvedTextMasks=0;
  const textSeen=new Uint8Array(owned.length);
  for(const plan of plans) {
    if(plan.corePixels===0)unresolvedTextMasks++;
    scannedPixels+=plan.scannedPixels;
    if(scannedPixels>MAX_PIXELS)throw new RangeError("residual ownership scan exceeds the page pixel budget");
    for(let i=0;i<plan.owned.length;i++) {
      const x=plan.bounds.x+i%plan.bounds.w,y=plan.bounds.y+Math.floor(i/plan.bounds.w),index=y*source.width+x,offset=index*4;
      if(plan.core[i]&&!textSeen[index]){
        textSeen[index]=1;
        if((residual.rgba[offset+3]??0)>=64&&[0,1,2].every(c=>Math.abs((source.rgba[offset+c]??0)-(residual.rgba[offset+c]??0))<=16))remainingTextCorePixels++;
      }
      if(!plan.owned[i])continue;
      if(!owned[index])ownedPixels++;
      if(!((owned[index]??0)&2))ownedForegroundPixels++;
      owned[index]=3;
      const hole=textBackgroundOwned(plan,i,x,y);
      if(hole){if((residual.rgba[offset+3]??0)>=64)incorrectTextBackgroundPixels++;}
      else if(residual.rgba[offset+3]!==source.rgba[offset+3]||[0,1,2].some(c=>residual.rgba[offset+c]!==plan.background[i*3+c]))incorrectTextBackgroundPixels++;
    }
  }
  let incorrectRouteBackgroundPixels=0;
  for(const row of routeBackgrounds){
    const index=row.cell,offset=index*4;
    // The text audit above already verifies these pixels against its own
    // source-backed background and independent ownership decisions.
    if(textOwned[index])continue;
    if(!owned[index])ownedPixels++;
    if(!((owned[index]??0)&2))ownedForegroundPixels++;
    owned[index]=3;
    if(residual.rgba[offset+3]!==source.rgba[offset+3]||row.color.some((v,c)=>residual.rgba[offset+c]!==v))incorrectRouteBackgroundPixels++;
  }
  let unownedChangedPixels=0;
  for(let index=0;index<owned.length;index++) {
    if(owned[index]) continue;
    const offset=index*4;
    if([0,1,2,3].some(channel=>source.rgba[offset+channel]!==residual.rgba[offset+channel])) unownedChangedPixels++;
  }
  return Object.freeze({passed:remainingOwnedForegroundPixels===0 && remainingOwnedBackgroundPixels===0 && unownedChangedPixels===0
    && remainingTextCorePixels===0 && incorrectTextBackgroundPixels===0 && unresolvedTextMasks===0 && incorrectRouteBackgroundPixels===0,
    scannedPixels,ownedPixels,ownedForegroundPixels,remainingOwnedForegroundPixels,remainingOwnedBackgroundPixels,unownedChangedPixels,
    remainingTextCorePixels,incorrectTextBackgroundPixels,unresolvedTextMasks,incorrectRouteBackgroundPixels});
}
module.exports={auditResidualPixelOwnership};
