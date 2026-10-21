// @ts-check
"use strict";
const {types}=require('node:util');
const {admitOcrPolygon,projectOcrPolygon}=require('./ocr-text-quadrilateral');
const {admitOcrWordPositionHints}=require('./ocr-word-position-hints');
const {sourceWordWindowRetry}=require('./source-word-window-retry');
const {sampleJointSourceWordOwner}=require('./source-word-joint-observation');
/** @type {WeakMap<object,{owners:Uint8Array,rgba:Uint8Array,width:number,height:number}>} */const frameOwnership=new WeakMap();
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} v @returns {v is number} */
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(finite)&&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** @param {unknown} v @returns {v is unknown[]} */
function array(v){return Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype
 &&Reflect.ownKeys(v).length===v.length+1&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** Rectify only a validated near-rectangular source frame. This returns measured
 * coordinates, never authorizes erasure, and charges every resampled source cell.
 * The extra context is the existing single retry margin, not a larger allowance.
 * Neighbor envelopes conservatively retain foreign/overlapping source ink.
 * @param {unknown} input */
function prepareRotatedSourceWordFrame(input){
 return prepareSourceWordFrame(input,false);
}
/** A failed horizontal row can share the same observed component attribution.
 * This uses its original axis-aligned native frame, never a guessed rotation.
 * A private joint proof is mandatory; copied or unknown tokens leave all ink
 * unresolved in the ordinary frame-owner check. @param {unknown} input */
function prepareAxisAlignedSourceWordFrame(input){
 return prepareSourceWordFrame(input,true);
}
/** @param {unknown} input @param {boolean} axisAligned */
function prepareSourceWordFrame(input,axisAligned){
 if(!record(input)||!record(input.image)||!record(input.line)||!box(input.line.box)||!box(input.nativeBox)
  ||typeof input.line.text!=='string'||input.line.text.length>512||Array.from(input.line.text).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)
  ||!finite(input.maximum)||!Number.isSafeInteger(input.maximum)||input.maximum<0||input.maximum>4000000)
  throw new TypeError('rotated source word frame is invalid');
 const {width,height,rgba}=input.image,text=input.line.text,line=input.line,native=input.nativeBox;
 if(!finite(width)||!finite(height)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width>16384||height>16384||width*height>40000000
  ||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError('rotated source word raster is invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',rgba),length=Reflect.get(proto,'length',rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4)throw new TypeError('rotated source word raster is invalid');
 const bytes=new Uint8Array(buffer,Reflect.get(proto,'byteOffset',rgba),length);
 const bounds=/** @type {Box} */(line.box);
 if(bounds.x+bounds.w>width||bounds.y+bounds.h>height)throw new TypeError('rotated source word bounds are invalid');
 const neighbors=input.neighbors===undefined?[]:input.neighbors;
 if(!array(neighbors)||neighbors.length>10000||!neighbors.every(box)||neighbors.some(b=>b.x+b.w>width||b.y+b.h>height))
  throw new TypeError('rotated source word neighbors are invalid');
 /** @type {readonly (readonly [number,number])[]|undefined} */
 const polygon=axisAligned?[[bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],
  [bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]]:admitOcrPolygon(line.polygon,{widthPx:width,heightPx:height},bounds);
 const geometry=projectOcrPolygon(polygon);
 if(!geometry||!axisAligned&&Math.abs(geometry.rotation)<.5||axisAligned&&!input.jointEvidence)return null;
 const hints=admitOcrWordPositionHints(line.wordPositionHints,{text,box:bounds});
 const sx=native.w/bounds.w,sy=native.h/bounds.h;
 // Rectify in the native coordinate frame, including nonuniform slide scaling.
 // The rounded slide height must not silently change the source-to-native angle.
 const projected= polygon ? projectOcrPolygon(polygon.map(([x,y])=>[x*sx,y*sy])) : null;
 if(!projected)return null;
 const margin=sourceWordWindowRetry({height:projected.box.h/sy,maximumPixels:input.maximum,scannedPixels:0})?.margin??2;
 const w=Math.ceil(projected.box.w/sx)+2*margin,h=Math.ceil(projected.box.h/sy)+2*margin,area=w*h;
 if(area>262144||area>input.maximum)return null;
 const angle=projected.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=geometry.box.x+geometry.box.w/2,cy=geometry.box.y+geometry.box.h/2;
 /** @param {number} x @param {number} y */
 const inverse=(x,y)=>({x:c*(x-cx)+s*(y-cy)*sy/sx+w/2,y:-s*(x-cx)*sx/sy+c*(y-cy)+h/2});
 /** @param {readonly {x:number,y:number}[]} points */
 const envelope=points=>{const x=Math.max(0,Math.min(...points.map(p=>p.x))),y=Math.max(0,Math.min(...points.map(p=>p.y)));
  return {x,y,w:Math.min(w,Math.max(...points.map(p=>p.x)))-x,h:Math.min(h,Math.max(...points.map(p=>p.y)))-y};};
 /** @param {Box} b */
 const convert=b=>envelope([[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]].map(([x=0,y=0])=>inverse(x,y)));
 if(!polygon)return null;
 const seed=envelope(polygon.map(([x,y])=>inverse(x,y)));
 const transformedHints=hints?.map(hint=>({text:hint.text,box:convert(hint.box)}));
 // Word envelopes may expand during rectification. Clip only alignment hints
 // to the admitted line envelope; pixel ownership still uses complete strokes.
 let previousCenter=-Infinity;
 for(const hint of transformedHints??[]){const b=hint.box,right=Math.min(seed.x+seed.w,b.x+b.w),bottom=Math.min(seed.y+seed.h,b.y+b.h);
  b.x=Math.max(seed.x,b.x);b.y=Math.max(seed.y,b.y);b.w=right-b.x;b.h=bottom-b.y;
  if(b.w<=0||b.h<=0||b.x+b.w/2<=previousCenter)return null;previousCenter=b.x+b.w/2;}
 const nativeCx=projected.box.x+projected.box.w/2,nativeCy=projected.box.y+projected.box.h/2;
 const nativeFrame={x:nativeCx-w*sx/2,y:nativeCy-h*sy/2,w:w*sx,h:h*sy};
 if(nativeFrame.x<0||nativeFrame.y<0||nativeFrame.x+nativeFrame.w>width*sx||nativeFrame.y+nativeFrame.h>height*sy)return null;
 for(const [x=0,y=0] of [[0,0],[w-1,0],[w-1,h-1],[0,h-1]]){
  const dx=x+.5-w/2,dy=y+.5-h/2,xx=Math.floor(cx+c*dx-s*dy*sy/sx),yy=Math.floor(cy+s*dx*sx/sy+c*dy);
  if(xx<0||yy<0||xx>=width||yy>=height)return null;
 }
 const target=new Uint8Array(area*4),owners=input.jointEvidence?new Uint8Array(area):null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=x+.5-w/2,dy=y+.5-h/2,xx=Math.floor(cx+c*dx-s*dy*sy/sx),yy=Math.floor(cy+s*dx*sx/sy+c*dy);
  const source=(yy*width+xx)*4,dest=(y*w+x)*4;
  for(let channel=0;channel<4;channel++)target[dest+channel]=bytes[source+channel]??0;
  if(owners)owners[y*w+x]=sampleJointSourceWordOwner(input.jointEvidence,/** @type {{width:number,height:number,rgba:Uint8Array}} */(input.image),bounds,xx,yy);
 }
 const neighborBoxes=neighbors.filter(b=>b!==line.box).map(convert).filter(b=>b.w>0&&b.h>0);
 const image={width:w,height:h,rgba:target};if(owners)frameOwnership.set(image,{owners,rgba:target.slice(),width:w,height:h});
 return {image,line:{...line,text,box:seed,...(transformedHints?{wordPositionHints:transformedHints}:{})},
  neighborBoxes,scannedPixels:area,rotation:projected.rotation,frame:{x:0,y:0,w,h},nativeFrame};
}
/** Null means no joint evidence; false means a changed or unresolved source.
 * Only complete rectified components may be retained or excluded. All checks
 * use the caller's already charged local observation and private frame copy.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {Uint8Array} ink
 * @param {{left:number,top:number,width:number,height:number}} window @param {Uint8Array} local */
function filterRotatedSourceWordInk(image,ink,window,local){
 const proof=frameOwnership.get(image);if(!proof)return null;
 if(!record(image)||image.width!==proof.width||image.height!==proof.height)return false;
 const {width:w,height:h,left,top}=window,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),retained=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++)
  if(local[(y*w+x)*4+c]!==proof.rgba[((y+top)*image.width+x+left)*4+c])return false;
 for(let start=0;start<w*h;start++){
  if(!ink[start]||seen[start])continue;
  let head=0,tail=1,kind=-1;seen[start]=1;queue[0]=start;
  while(head<tail){const at=queue[head++]??0,x=at%w,y=Math.floor(at/w),owner=proof.owners[(y+top)*image.width+x+left];
   if(owner===undefined||owner===255||kind>=0&&owner!==kind)return false;kind=owner;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy,n=yy*w+xx;
    if(xx>=0&&xx<w&&yy>=0&&yy<h&&ink[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
   }
  }
  if(kind===1)for(let i=0;i<tail;i++)retained[queue[i]??0]=1;
 }
 ink.set(retained);return true;
}
/** Preserve private frame identity when the local observer captures its own
 * request object. Pixel evidence remains the immutable charged local snapshot.
 * @param {{width:number,height:number,rgba:Uint8Array}} image */
function captureSourceWordFrameIdentity(image){
 const captured={width:image.width,height:image.height,rgba:image.rgba},proof=frameOwnership.get(image);
 if(proof&&image.width===proof.width&&image.height===proof.height)frameOwnership.set(captured,proof);
 return captured;
}
module.exports={prepareRotatedSourceWordFrame,prepareAxisAlignedSourceWordFrame,filterRotatedSourceWordInk,captureSourceWordFrameIdentity};
