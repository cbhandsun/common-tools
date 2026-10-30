// @ts-check
"use strict";
const { sourceRaster } = require("../typography/residual-text-mask");
const { types } = require("node:util");
const { inspectSourceLineTerminals } = require('./source-line-terminal-contradiction');
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(p => "value" in p); }
/** This is a contradiction filter, not an ownership or completeness proof.
 * A density peak can match a broad color family while its proposed fill is
 * absent at the actual location. Such a proposal must not paint or erase.
 * @param {unknown} raster @param {unknown} size */
function createSolidAtomSourceFilter(raster, size) {
  const image = sourceRaster(raster);
  if (!record(size)
    || typeof size.widthPt !== "number" || typeof size.heightPt !== "number"
    || !Number.isFinite(size.widthPt) || !Number.isFinite(size.heightPt)
    || size.widthPt <= 0 || size.heightPt <= 0) throw new TypeError("solid atom slide size is invalid");
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  let scannedPixels = 0;
  /** @param {unknown} value */
  function inspect(value) {
    if (!record(value)) throw new TypeError("solid atom candidate is invalid");
    if (value.kind !== "native-rect-candidate") return { retained: true, reason: "outside-scope" };
    if (!record(value.box) || typeof value.color !== "string" || !/^#[a-f0-9]{6}$/iu.test(value.color)) return { retained: false, reason: "invalid-evidence" };
    const box = value.box;
    if (["x", "y", "w", "h"].some(k => typeof box[k] !== "number" || !Number.isFinite(box[k]))) return { retained: false, reason: "invalid-geometry" };
    const x = Number(box.x), y = Number(box.y), w = Number(box.w), h = Number(box.h);
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || (x + w) * sx > image.width + 1e-6 || (y + h) * sy > image.height + 1e-6) return { retained: false, reason: "invalid-geometry" };
    const left = Math.floor(x * sx), top = Math.floor(y * sy);
    const right = Math.min(image.width, Math.ceil((x + w) * sx)), bottom = Math.min(image.height, Math.ceil((y + h) * sy));
    const area = (right - left) * (bottom - top);
    const densityPeak = record(value.source) && value.source.detector === "dense-linked-node-visual-atom" && value.source.method === "density-peak";
    const outerLeft = Math.max(0, left - 1), outerTop = Math.max(0, top - 1);
    const outerRight = Math.min(image.width, right + 1), outerBottom = Math.min(image.height, bottom + 1);
    const scanArea = densityPeak ? (outerRight - outerLeft) * (outerBottom - outerTop) : area;
    if (area > 262144 || scannedPixels + scanArea > 4000000) return { retained: false, reason: "source-budget" };
    scannedPixels += scanArea;
    const hex = value.color;
    const color = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
    let matching = 0;
    for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
      const offset = (py * image.width + px) * 4;
      if ((image.rgba[offset + 3] ?? 0) < 128) continue;
      if (color.every((c, i) => Math.abs(c - (image.rgba[offset + i] ?? 0)) <= 18)) matching++;
    }
    if (densityPeak && matching === area) {
      let ring = 0, matchingRing = 0;
      for (let py = outerTop; py < outerBottom; py++) for (let px = outerLeft; px < outerRight; px++) {
        if (px >= left && px < right && py >= top && py < bottom) continue;
        ring++;
        const offset = (py * image.width + px) * 4;
        if ((image.rgba[offset + 3] ?? 0) >= 128 && color.every((c, i) => Math.abs(c - (image.rgba[offset + i] ?? 0)) <= 18)) matchingRing++;
      }
      // A uniformly colored window and surrounding ring supply no independent object boundary.
      if (ring > 0 && matchingRing === ring) return { retained: false, reason: "uniform-surroundings", scannedPixels: scanArea, matchingPixels: matching };
    }
    return { retained: matching > 0, reason: matching > 0 ? "not-contradicted" : "fill-absent", scannedPixels: scanArea, matchingPixels: matching };
  }
  /** Compare a speculative primitive's actual paint footprint with the local
   * unpainted backdrop. A proposal which increases source error cannot claim
   * paint or erase rights. This is a rejection test, never an ownership proof.
   * Unsupported geometry retains its existing admission path.
   * @param {unknown} value */
  function inspectShape(value) {
    if (!record(value)) throw new TypeError('native atom shape is invalid');
    if (typeof value.type!=='string'||!['line','ellipse','rect','roundRect'].includes(value.type) || value.rotation)
      return {retained:true,reason:'outside-scope'};
    if (!record(value.box) || !record(value.style)) return {retained:false,reason:'invalid-evidence'};
    const b=value.box,style=value.style,line=value.type==='line';
    if (style.opacity!==undefined&&style.opacity!==1 || style.gradient!==undefined || style.shadow!==undefined
      || !line && style.strokeWidthPt!==undefined&&style.strokeWidthPt!==0) return {retained:true,reason:'outside-scope'};
    const hex=line?style.stroke:style.fill;
    if(typeof hex!=='string'||!/^#[a-f0-9]{6}$/iu.test(hex))return {retained:true,reason:'outside-scope'};
    if(['x','y','w','h'].some(k=>typeof b[k]!=='number'||!Number.isFinite(b[k])))return {retained:false,reason:'invalid-geometry'};
    const x=Number(b.x)*sx,y=Number(b.y)*sy,w=Number(b.w)*sx,h=Number(b.h)*sy;
    const stroke=line?style.strokeWidthPt:0;
    if(line&&(typeof stroke!=='number'||!Number.isFinite(stroke)||stroke<=0))return {retained:false,reason:'invalid-geometry'};
    if(!line&&(w<=0||h<=0))return {retained:false,reason:'invalid-geometry'};
    const half=line?Number(stroke)*Math.max(sx,sy)/2:0;
    const left=Math.floor(Math.min(x,x+w)-half),right=Math.ceil(Math.max(x,x+w)+half);
    const top=Math.floor(Math.min(y,y+h)-half),bottom=Math.ceil(Math.max(y,y+h)+half);
    if(left<0||top<0||right>image.width||bottom>image.height)return {retained:false,reason:'invalid-geometry'};
    const ol=Math.max(0,left-2),ot=Math.max(0,top-2),or=Math.min(image.width,right+2),ob=Math.min(image.height,bottom+2);
    const area=(or-ol)*(ob-ot);
    if(area>262144||scannedPixels+area>4000000)return {retained:false,reason:'source-budget'};
    scannedPixels+=area;
    /** @type {number[][]} */const ring=[[],[],[]];
    for(let py=ot;py<ob;py++)for(let px=ol;px<or;px++){
      if(px>=left&&px<right&&py>=top&&py<bottom)continue;
      const i=(py*image.width+px)*4;if((image.rgba[i+3]??0)<128)continue;
      for(let c=0;c<3;c++)ring[c]?.push(image.rgba[i+c]??0);
    }
    if(!ring[0]?.length)return {retained:false,reason:'source-background-unavailable'};
    const background=ring.map(values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??0;});
    const color=[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16));
    if(value.type==='roundRect'&&style.radiusRatio!==undefined&&typeof style.radiusRatio!=='number')return {retained:false,reason:'invalid-geometry'};
    const radius=value.type==='roundRect'?Math.min(w,h)*Number(style.radiusRatio??.08):0;
    if(!Number.isFinite(radius)||radius<0||!line&&radius>Math.min(w,h)/2)return {retained:false,reason:'invalid-geometry'};
    let paintError=0,backgroundError=0,pixels=0;
    for(let py=top;py<bottom;py++)for(let px=left;px<right;px++){
      const dx=px+.5-x,dy=py+.5-y;
      let inside;
      if(line){const length=w*w+h*h,t=length?Math.max(0,Math.min(1,(dx*w+dy*h)/length)):0;
        inside=Math.hypot(dx-t*w,dy-t*h)<=half;
      }else if(value.type==='ellipse')inside=((dx-w/2)/(w/2))**2+((dy-h/2)/(h/2))**2<=1;
      else {const qx=Math.abs(dx-w/2)-w/2+radius,qy=Math.abs(dy-h/2)-h/2+radius;
        inside=Math.hypot(Math.max(0,qx),Math.max(0,qy))+Math.min(0,Math.max(qx,qy))<=radius;}
      if(!inside)continue;
      const i=(py*image.width+px)*4;if((image.rgba[i+3]??0)<128)continue;pixels++;
      for(let c=0;c<3;c++){const actual=image.rgba[i+c]??0;
        paintError+=Math.abs(actual-(color[c]??0));backgroundError+=Math.abs(actual-(background[c]??0));}
    }
    let retained=pixels>0&&paintError<backgroundError;
    let reason=retained?'source-paint-improves':'source-paint-contradicted';
    if(retained&&line){
      const terminal=inspectSourceLineTerminals({image,shape:value,sx,sy,remainingPixels:4000000-scannedPixels});
      scannedPixels+=terminal.scannedPixels;
      if(terminal.budgetExceeded)return {retained:false,reason:'source-budget'};
      if(terminal.contradicted){retained=false;reason='source-line-terminal-contradicted';}
    }
    return {retained,reason,
      paintError:pixels?paintError/(3*pixels):0,backgroundError:pixels?backgroundError/(3*pixels):0,paintCoverage:area?pixels/area:0};
  }
  return { inspect, inspectShape, scannedPixels: () => scannedPixels };
}
module.exports = { createSolidAtomSourceFilter };
