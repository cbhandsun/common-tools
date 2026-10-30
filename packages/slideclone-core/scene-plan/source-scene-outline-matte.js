// @ts-check
'use strict';
const {parseBandBackground}=require('./source-scene-band-geometry');
const {measureOutlinedSceneContainerDetailed,sceneOutlineWindow}=require('./source-scene-outline');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {summarizeInteriorColors}=require('./visual-atom-interior-fill');
/** A complete measured source ring can identify its adjacent background even
 * when the heterogeneous center cannot prove a solid fill. The palette grants
 * color separation only; it never grants a native body or stroke erasure.
 * @param {unknown} imageInput @param {unknown} hintInput
 * @param {unknown} masksInput @param {unknown} budgetInput @param {unknown} [glyphOcclusion] */
function measureSceneOutlineMatte(imageInput,hintInput,masksInput,budgetInput,glyphOcclusion){
 const {image,hint,textMasks,budget}=parseBandBackground({image:imageInput,hint:hintInput,textMasks:masksInput,budget:budgetInput,owners:[]});
 if(hint.w<12||hint.h<12)return null;
 const frame=sceneOutlineWindow(image,hint);
 if(!frame.dense||frame.area>262144)return null;
 const window={x:frame.x0,y:frame.y0,w:frame.x1-frame.x0,h:frame.y1-frame.y0};
 if(budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 // Preserve the validated source view and budget identity used by the node
 // compiler. A wrapper view loses its cache; OCR rectangles alone cannot
 // substitute for the same private glyph/ring ownership predicate.
 const outline=measureOutlinedSceneContainerDetailed(image,hint,textMasks,budget,glyphOcclusion).outline;
 if(!outline)return null;
 if(outline.bodySegments&&outline.fill!=='none')return {outline,color:outline.fill,matteOnly:true};
 if(budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,window,budget),area=window.w*window.h;
 const ring=new Uint8Array(area),outside=new Uint8Array(area),distance=new Uint8Array(area),queue=new Int32Array(area);
 for(const n of outline.sourcePixels){const x=n%image.width-window.x,y=Math.floor(n/image.width)-window.y;
  if(x<0||y<0||x>=window.w||y>=window.h)throw new TypeError('Measured ring leaves its source window');
  ring[y*window.w+x]=1;
 }
 /** @param {number} n @returns {number[]} */
 const neighbors=n=>{const x=n%window.w,y=Math.floor(n/window.w);return [x?n-1:-1,x<window.w-1?n+1:-1,y?n-window.w:-1,y<window.h-1?n+window.w:-1];};
 let head=0,tail=0;
 /** @param {number} n */const add=n=>{if(n<0||ring[n]||outside[n])return;outside[n]=1;queue[tail++]=n;};
 for(let x=0;x<window.w;x++){add(x);add((window.h-1)*window.w+x);}
 for(let y=1;y<window.h-1;y++){add(y*window.w);add(y*window.w+window.w-1);}
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Measured ring traversal is invalid');for(const k of neighbors(n))add(k);}
 head=0;tail=0;
 for(let n=0;n<area;n++)if(ring[n])for(const k of neighbors(n))if(k>=0&&!ring[k]&&!outside[k]&&!distance[k]){distance[k]=1;queue[tail++]=k;}
 /** @type {number[][]} */const colors=[];
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Measured ring traversal is invalid');const d=distance[n]??0;
  if(d>=4){const x=window.x+n%window.w,y=window.y+Math.floor(n/window.w);
   if((raster.rgba[n*4+3]??0)>=250&&!textMasks.some(m=>x>=m.x&&y>=m.y&&x<m.x+m.w&&y<m.y+m.h))colors.push([0,1,2].map(k=>raster.rgba[n*4+k]??0));
  }
  if(d<8)for(const k of neighbors(n))if(k>=0&&!ring[k]&&!outside[k]&&!distance[k]){distance[k]=d+1;queue[tail++]=k;}
 }
 const sample=summarizeInteriorColors(colors);if(!sample)return null;
 const rgb=[1,3,5].map(k=>Number.parseInt(sample.color.slice(k,k+2),16));
 if((rgb[0]??0)*.2126+(rgb[1]??0)*.7152+(rgb[2]??0)*.0722<200)return null;
 return {outline,color:sample.color,matteOnly:true};
}
module.exports={measureSceneOutlineMatte};
