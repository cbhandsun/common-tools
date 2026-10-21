"use strict";
// @ts-check
const { traceNativeMaskContours } = require("./native-mask-contours");
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{r:number,g:number,b:number}} Color */
/** @typedef {{points:Point[],curve:unknown,connectorContour:unknown}} Geometry */
/** @typedef {{source:{width:number,height:number,rgba:Uint8Array},foreground:Uint8Array,left:number,top:number,width:number,height:number,scaleX:number,scaleY:number,maximumComponentAreaPt2?:number}} Request */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is Box} */
function validBox(value) {
  return record(value) && [value.x,value.y,value.w,value.h].every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<=100000)
    && typeof value.w==="number"&&value.w>0 && typeof value.h==="number"&&value.h>0;
}
/** @param {unknown} target @param {unknown} textBoxes */
function missingBlobTargetTouchesText(target,textBoxes) {
  if(!record(target)||!validBox(target.box)||!Array.isArray(textBoxes)||textBoxes.length>2000)
    throw new TypeError("Invalid missing component text ownership");
  for(const text of textBoxes) {
    if(!record(text)||typeof text.text!=="string") throw new TypeError("Invalid missing component text owner");
    if(!text.text.trim()) continue;
    const evidence=record(text.source)?text.source.evidenceBox:undefined;
    const boxes=[text.box,...(evidence===undefined?[]:[evidence])];
    for(const box of boxes) {
      if(!validBox(box)) throw new TypeError("Invalid missing component text bounds");
      if(Math.min(target.box.x+target.box.w,box.x+box.w)>Math.max(target.box.x,box.x)
        && Math.min(target.box.y+target.box.h,box.y+box.h)>Math.max(target.box.y,box.y)) return true;
    }
  }
  return false;
}

/** @param {{summarizeColor:(colors:Color[],density:number)=>string,describeGeometry:(points:Point[],bounds:Box,density:number)=>Geometry}} dependencies */
function createMissingBlobComponentCollector({summarizeColor,describeGeometry}) {
  if (typeof summarizeColor !== "function" || typeof describeGeometry !== "function") throw new TypeError("Invalid blob component dependencies");
  return function collect(/** @type {unknown} */ input) {
    if (!record(input) || !record(input.source) || !(input.source.rgba instanceof Uint8Array)
      || !(input.foreground instanceof Uint8Array)) throw new TypeError("Invalid blob component input");
    const value = /** @type {Request} */ (input);
    const {source,foreground,left,top,width,height,scaleX,scaleY,maximumComponentAreaPt2=9000} = value;
    if (![source.width,source.height,width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
      || ![left,top].every(n=>Number.isSafeInteger(n)&&n>=0) || left+width>source.width || top+height>source.height
      || width*height>1_000_000 || source.width*source.height>40_000_000
      || foreground.length!==width*height || foreground.some(n=>n>1) || source.rgba.length!==source.width*source.height*4
      || ![scaleX,scaleY].every(n=>Number.isFinite(n)&&n>0&&n<=256)
      || !Number.isFinite(maximumComponentAreaPt2)||maximumComponentAreaPt2<12||maximumComponentAreaPt2>25000)
      throw new RangeError("Invalid blob component bounds");
    const visited=new Uint8Array(width*height), components=[];
    const neighbors=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let startY=0;startY<height;startY++) for(let startX=0;startX<width;startX++) {
      const startIndex=startY*width+startX;
      if(!foreground[startIndex]||visited[startIndex]) continue;
      /** @type {Point[]} */ const pixels=[{x:startX,y:startY}];
      /** @type {Color[]} */ const colors=[];
      visited[startIndex]=1;
      let minX=startX,minY=startY,maxX=startX,maxY=startY;
      for(let cursor=0;cursor<pixels.length;cursor++) {
        const {x,y}=/** @type {Point} */ (pixels[cursor]);
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        const offset=((top+y)*source.width+left+x)*4;
        colors.push({r:source.rgba[offset]??0,g:source.rgba[offset+1]??0,b:source.rgba[offset+2]??0});
        for(const [dx=0,dy=0] of neighbors) {
          const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=width||ny>=height) continue;
          const index=ny*width+nx;
          if(!foreground[index]||visited[index]) continue;
          visited[index]=1;pixels.push({x:nx,y:ny});
        }
      }
      const bounds={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
      const area=bounds.w*bounds.h,density=pixels.length/area;
      const box={x:(left+minX)/scaleX,y:(top+minY)/scaleY,w:bounds.w/scaleX,h:bounds.h/scaleY};
      if(pixels.length<12||area<12||density<0.025||box.w*box.h<12||box.w*box.h>maximumComponentAreaPt2) continue;
      const geometry=describeGeometry(pixels,bounds,density);
      if(geometry.points.length<3) continue;
      // Dense pictorial ink needs concavities and holes, not its convex hull.
      let nativeContour=null;
      if(density>0.18) for(const tolerancePx of [0.5,0.75,1]) {
        const segments=traceNativeMaskContours(pixels,bounds,{maxSegments:120,tolerancePx});
        if(segments) {nativeContour={segments,tolerancePx};break;}
      }
      components.push({pixelCount:pixels.length,density,color:summarizeColor(colors,density),box,...geometry,nativeContour});
    }
    return components;
  };
}
module.exports={createMissingBlobComponentCollector,missingBlobTargetTouchesText};
