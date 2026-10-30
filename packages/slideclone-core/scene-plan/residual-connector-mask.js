// @ts-check
'use strict';
const {residualConnectorPath,residualConnectorRecord:record}=require('./residual-connector-path');
const {maskBounds,pointInMask}=require('./raster-native-detection');
/** @typedef {{kind:'line',x1:number,y1:number,x2:number,y2:number,width:number}} LineMask */
/** A conservative repair: intersect the OLD erasure with the actual drawing
 * corridor. No new source pixel can be erased, regardless of path metadata.
 * The legacy width remains unchanged; this does not prove native coverage,
 * background recovery, arrowhead ownership or complete route deduplication.
 * One bounded ledger belongs to each full-slide build, never to global state.
 * @param {unknown} imageInput @param {unknown} sizeInput */
function createResidualConnectorMaskProjector(imageInput,sizeInput){
 if(!record(imageInput)||!record(sizeInput))throw new TypeError('Residual connector dimensions are invalid');
 const {width,height}=imageInput,{w,h}=sizeInput;
 if(typeof width!=='number'||typeof height!=='number'||![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)||width*height>40000000
  ||typeof w!=='number'||typeof h!=='number'||![w,h].every(v=>Number.isFinite(v)&&v>0))throw new TypeError('Residual connector dimensions are invalid');
 const image={width,height},size={w,h};
 let scanned=0;
 /** @param {number} count */
 function reserve(count){if(!Number.isSafeInteger(count)||count<0||scanned+count>40000000)throw new RangeError('Residual connector scan exceeds the page pixel budget');scanned+=count;}
 /** @param {unknown} item @param {unknown} legacyInput */
 return (item,legacyInput)=>{
  if(!record(legacyInput)||legacyInput.kind!=='line'||!['x1','y1','x2','y2','width'].every(k=>typeof legacyInput[k]==='number'
   &&Number.isFinite(legacyInput[k])&&Math.abs(/** @type {number} */(legacyInput[k]))<=100000)
   ||/** @type {number} */(legacyInput.width)<=0)throw new TypeError('Residual connector mask is invalid');
  const legacy=/** @type {LineMask} */({...legacyInput});
  const points=residualConnectorPath(item,{x:image.width/size.w,y:image.height/size.h});
  const bounds=maskBounds(legacy,image),area=bounds.w*bounds.h;reserve(area);
  const owned=new Uint8Array(area);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];if(!a||!b)throw new TypeError('Residual connector segment is invalid');
   /** @type {LineMask} */const mask={kind:'line',x1:a.x,y1:a.y,x2:b.x,y2:b.y,width:legacy.width};
   const other=maskBounds(mask,image),left=Math.max(bounds.x,other.x),top=Math.max(bounds.y,other.y),
    right=Math.min(bounds.x+bounds.w,other.x+other.w),bottom=Math.min(bounds.y+bounds.h,other.y+other.h);
   reserve(Math.max(0,right-left)*Math.max(0,bottom-top));
   for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(pointInMask(x,y,legacy)&&pointInMask(x,y,mask))owned[(y-bounds.y)*bounds.w+x-bounds.x]=1;
  }
  /** @type {{kind:'rect',x:number,y:number,w:number,h:number}[]} */const masks=[];
  for(let y=0;y<bounds.h;y++)for(let x=0;x<bounds.w;){
   if(!owned[y*bounds.w+x]){x++;continue;}const start=x;
   while(x<bounds.w&&owned[y*bounds.w+x])x++;
   if(masks.length>=30000)throw new RangeError('Residual connector mask count exceeds boundary');
   masks.push({kind:'rect',x:bounds.x+start,y:bounds.y+y,w:x-start,h:1});
  }
  return masks;
 };
}
module.exports={createResidualConnectorMaskProjector};
