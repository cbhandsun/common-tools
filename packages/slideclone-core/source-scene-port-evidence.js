// @ts-check
"use strict";
const {types}=require('node:util');
const {ownerVertices}=require("./source-scene-band-geometry");
const {readSceneFillRaster}=require("./source-scene-fill-raster-cache");
const {measuredGroupVertices,fullyContainedGroupPolygon,box:validGroupBox,record:validGroupRecord}=require('./source-scene-group-containment');
const {patternedSceneFrameGeometry}=require('./source-scene-patterned-frame');
const {sourcePolygonRowMask}=require('./source-polygon-row-mask');
const {hasSceneInkPort,sceneInkPortContour,sceneInkPortMask,sceneInkPortOwnsCell,sceneInkPortCells}=require('./source-scene-ink-port');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,box:Box,vertices:Point[],groupVertices:Point[]|null,fill:number[]|null,perimeter:Set<number>}>} */
const frames=new WeakMap();
/** Expose geometry only for an opaque body already admitted on this source.
 * Hollow rings, copied tokens and serialized provider controls confer no
 * occlusion authority. The caller receives a detached geometry snapshot.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token */
function measuredSceneOpaqueSurface(image,token){
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;
 return frame&&frame.pixels===image.rgba&&frame.width===image.width&&frame.height===image.height
  &&frame.fill&&frame.groupVertices?{vertices:frame.groupVertices.map(p=>({...p})),fill:frame.fill.slice()}:null;
}
/** Only this source's privately measured perimeter can exclude endpoint paint
 * from its own shaft window. Serialized flags/colors or another image cannot
 * supply cells. This grants neither missing shaft pixels nor node attachment.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {Box} window */
function measuredScenePortPerimeterCells(image,token,box,window){
 if(hasSceneInkPort(image,token,box))return sceneInkPortCells(image,token,box,window);
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;
 if(!frame||frame.pixels!==image.rgba||frame.width!==image.width||frame.height!==image.height
  ||['x','y','w','h'].some(k=>frame.box[/** @type {keyof Box} */(k)]!==box[/** @type {keyof Box} */(k)]))return new Set();
 const cells=new Set();for(const cell of frame.perimeter){const x=cell%image.width,y=Math.floor(cell/image.width);
  if(x>=window.x&&x<window.x+window.w&&y>=window.y&&y<window.y+window.h)cells.add((y-window.y)*window.w+x-window.x);}
 return cells;
}
/** Copy only the private cache's admitted ring cells, never serialized IR.
 * Bound metadata to the existing unit scan capacity; getters/proxies cannot
 * execute while minting a source capability. @param {unknown} value @param {number} area */
function perimeterSnapshot(value,area){
 if(value===undefined)return new Set();
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>262144
  ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p))
  ||!value.every(n=>Number.isSafeInteger(n)&&n>=0&&n<area))throw new TypeError('Scene port perimeter is invalid');
 return new Set(/** @type {number[]} */(value));
}
/** Called only for an independently admitted measurement in the compiler's
 * private cache. The opaque token is transient and cannot be serialized into
 * a provider proposal or IR to acquire source-boundary authority.
 * @param {import('./png').PngImage} image
 * @param {{box:Box,fill:string,segments?:import('./source-scene-band-geometry').Segments,perimeterPixels?:number[]}} measurement @param {unknown} [pattern] */
function createMeasuredScenePortFrame(image,measurement,pattern){
 if(!measurement||types.isProxy(measurement)||![Object.prototype,null].includes(Object.getPrototypeOf(measurement))
  ||Object.values(Object.getOwnPropertyDescriptors(measurement)).some(p=>!('value' in p)))throw new TypeError('Scene port measurement is invalid');
 if(typeof measurement.fill!=='string')throw new TypeError('Scene port fill is invalid');
 const perimeter=perimeterSnapshot(measurement.perimeterPixels,image.width*image.height);
 const token=Object.freeze({}),box={...measurement.box};
 const vertices=ownerVertices({box,...(measurement.segments?{segments:measurement.segments}:{})});
 const groupVertices=measuredGroupVertices(measurement);
 const enclosure=patternedSceneFrameGeometry(pattern,image);
 if(pattern!==undefined&&(!enclosure||measurement.fill!=='none'||JSON.stringify(enclosure.box)!==JSON.stringify(box)
  ||JSON.stringify(enclosure.segments)!==JSON.stringify(measurement.segments)||enclosure.perimeterPixels.length!==perimeter.size
  ||enclosure.perimeterPixels.some(cell=>!perimeter.has(cell))))throw new TypeError('Scene patterned enclosure is invalid');
 if(measurement.fill==='none'&&(!measurement.segments||!groupVertices||!perimeter.size))throw new TypeError('Scene hollow port perimeter is invalid');
 if(measurement.fill!=='none'&&!/^#[a-f0-9]{6}$/iu.test(measurement.fill))throw new TypeError('Scene port fill is invalid');
 // A hollow port is a perimeter capability only. Retain the existing
 // complete-body requirement for physical label/part grouping and paint.
 frames.set(token,{pixels:image.rgba,width:image.width,height:image.height,box,vertices,groupVertices:measurement.fill==='none'&&!enclosure?null:groupVertices,perimeter,
  fill:measurement.fill==='none'?null:[1,3,5].map(i=>Number.parseInt(measurement.fill.slice(i,i+2),16))});
 return token;
}
/** Unknown, copied, proxy and cross-source tokens never authorize ports.
 * Require the actual contour intersection within the original 2px attachment
 * allowance, plus independently observed body and shaft pixels at both ends.
 * The unchanged shaft/head proof has already established direction and .9
 * support. A midpoint is unnecessary when both source attachments are proven.
 * @param {{image:import('./png').PngImage,token:unknown,box:Box,point:Point,side:string,color:string,textMasks:Box[],budget:{used:number}}} input */
function verifyMeasuredScenePort({image,token,box,point,side,color,textMasks,budget}){
 if(token===null||typeof token!=="object")return false;
 const frame=frames.get(token);
 if(!hasMeasuredScenePortFrame(image,token,box))return false;
 const horizontal=side==="left"||side==="right",axis=horizontal?point.y:point.x;
 if(!["left","right","top","bottom"].includes(side)||!Number.isFinite(axis))return false;
 // A closed concave body can cross the scanline more than twice. Remote
 // recesses do not invalidate its outer entry/exit on the requested side.
 // Half-open edge intersections retain even parity, including tangent pairs;
 // the selected boundary still needs the original distance and paint proof.
 const contour=measuredSceneContourPort(image,token,box,axis,side);if(!contour)return false;
 const boundary=horizontal?contour.x:contour.y;
 if(Math.abs(boundary-(horizontal?point.x:point.y))>2)return false;
 const increasing=side==="right"||side==="bottom",inside=Math.floor(boundary)+(increasing?-1:1),outside=Math.floor(boundary)+(increasing?1:-1),farOutside=outside+(increasing?1:-1);
 const window=horizontal?{x:Math.min(inside,farOutside),y:Math.round(axis)-1,w:Math.abs(inside-farOutside)+1,h:3}
  :{x:Math.round(axis)-1,y:Math.min(inside,farOutside),w:3,h:Math.abs(inside-farOutside)+1};
 if(window.x<0||window.y<0||window.x+window.w>image.width||window.y+window.h>image.height
  ||textMasks.some(t=>t.x<window.x+window.w&&t.x+t.w>window.x&&t.y<window.y+window.h&&t.y+t.h>window.y)
  ||budget.used+window.w*window.h>4000000)return false;
 const raster=readSceneFillRaster(image,window,budget),shaft=[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
 /** @param {number} along @param {number[]} target */
 const supported=(along,target)=>[-1,0,1].some(offset=>{
  const x=horizontal?along:Math.round(axis)+offset,y=horizontal?Math.round(axis)+offset:along;
  const i=((y-window.y)*raster.width+x-window.x)*4;
  return (raster.rgba[i+3]??0)>=240&&target.every((value,c)=>Math.abs(value-(raster.rgba[i+c]??0))<=18);
 });
 // A JPEG fringe can separate the paint component from the shaft's opaque
 // core by one cell. The original 2px attachment allowance covers it only if
 // that intervening source cell independently has the original 42 contrast.
 const fill=frame?.fill??null;
 const fringe=fill!==null&&[-1,0,1].some(offset=>{
  const x=horizontal?outside:Math.round(axis)+offset,y=horizontal?Math.round(axis)+offset:outside;
  const i=((y-window.y)*raster.width+x-window.x)*4;
  const bodyDistance=Math.max(...fill.map((v,c)=>Math.abs(v-(raster.rgba[i+c]??0)))),shaftDistance=Math.max(...shaft.map((v,c)=>Math.abs(v-(raster.rgba[i+c]??0))));
  return (raster.rgba[i+3]??0)>=240&&bodyDistance>=42&&shaftDistance+6<=bodyDistance;
 });
 // The same inner samples may belong to the independently proven closed
 // stroke instead of the fill. Reuse that ownership, never a color guess or
 // a wider search; the external shaft and original distance tests still apply.
 const border=[-1,0,1].some(offset=>measuredScenePortOwnsCell(image,token,box,(horizontal?Math.round(axis)+offset:inside)*image.width+(horizontal?inside:Math.round(axis)+offset)));
 return (fill!==null&&supported(inside,fill)||border)&&(supported(outside,shaft)||fringe&&supported(farOutside,shaft));
}
/** Physical frame presence is independent of an admitted interior paint color.
 * Hollow frames authorize only their actual closed perimeter. Unknown/cross-
 * source tokens and copied or changed boxes retain the same rejection.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box */
function hasMeasuredScenePortFrame(image,token,box){
 if(hasSceneInkPort(image,token,box))return true;
 if(token===null||typeof token!=='object')return false;
 const frame=frames.get(token);
 return !!frame&&validGroupRecord(image)&&validGroupBox(box)&&frame.pixels===image.rgba&&frame.width===image.width&&frame.height===image.height
  &&['x','y','w','h'].every(k=>frame.box[/** @type {keyof Box} */(k)]===box[/** @type {keyof Box} */(k)]);
}
/** A measured node body can enter a relation's small gap window through its
 * source fringe. Its paint is background evidence, not shaft ink. Only this
 * exact private source/frame binding may nominate an exclusion color.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box
 * @returns {number[]|null} */
function measuredScenePortFill(image,token,box){
 if(token===null||typeof token!=="object")return null;
 const frame=frames.get(token);
 if(!frame||frame.pixels!==image.rgba||frame.width!==image.width||frame.height!==image.height||["x","y","w","h"].some(k=>frame.box[/** @type {keyof Box} */(k)]!==box[/** @type {keyof Box} */(k)]))return null;
 return frame.fill?.slice()??null;
}
/** A private measured body can bind controls without adding source ownership.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {Point[]} polygon @param {{used:number,exhausted:boolean}} [work] */
function measuredSceneContainsGroup(image,token,box,polygon,work){
 if(token===null||typeof token!=='object'||!validGroupBox(box))return false;
 const frame=frames.get(token);
 return !!frame&&frame.pixels===image.rgba&&frame.width===image.width&&frame.height===image.height&&!!frame.groupVertices
  &&['x','y','w','h'].every(k=>frame.box[/** @type {keyof Box} */(k)]===box[/** @type {keyof Box} */(k)])
  &&polygon.length===4&&polygon.every(p=>p.x>=frame.box.x&&p.x<=frame.box.x+frame.box.w&&p.y>=frame.box.y&&p.y<=frame.box.y+frame.box.h)
  &&fullyContainedGroupPolygon(frame.groupVertices,polygon,work);
}
/** Snapshot the admitted frame, never a provider or rounded output box.
 * @param {import('./png').PngImage} image @param {unknown} token @returns {Box|null} */
function measuredSceneGroupBounds(image,token){
 if(token===null||typeof token!=='object')return null;
 const frame=frames.get(token);
 return frame&&frame.pixels===image.rgba&&frame.width===image.width&&frame.height===image.height&&frame.groupVertices?{...frame.box}:null;
}
/** Project an observed route axis onto its already measured physical body.
 * This proves ONLY the boundary, never an attached shaft or a blank corridor.
 * The original 2px contour/frame agreement remains mandatory. Visible gaps
 * require a separate complete source observation and explicit native site.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box
 * @param {number} axis @param {string} side @returns {Point|null} */
function measuredSceneProjectedPort(image,token,box,axis,side){
 const point=measuredSceneContourPort(image,token,box,axis,side);if(!point)return null;
 const horizontal=side==='left'||side==='right',boundary=horizontal?point.x:point.y;
 const expected=side==='right'?box.x+box.w:side==='left'?box.x:side==='bottom'?box.y+box.h:box.y;
 return Math.abs(boundary-expected)<=2?point:null;
}
/** Return the private measured contour intersection, not its rectangular
 * envelope. This is a site proposal only: the full shaft and original 2px
 * attachment proof are still required. No serialized frame grants a site.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box
 * @param {number} axis @param {string} side @param {{checks:number}} [work] @returns {Point|null} */
function measuredSceneContourPort(image,token,box,axis,side,work){
 if(!Number.isFinite(axis)||!['left','right','top','bottom'].includes(side)||!hasMeasuredScenePortFrame(image,token,box))return null;
 if(hasSceneInkPort(image,token,box))return sceneInkPortContour(image,token,box,axis,side,work);
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;if(!frame)return null;
 if(work){
  if(!validGroupRecord(work)||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)return null;
  work.checks+=frame.vertices.length;if(work.checks>4000000)return null;
 }
 const horizontal=side==='left'||side==='right',intersections=[];
 for(let i=0;i<frame.vertices.length;i++){
  const a=frame.vertices[i],b=frame.vertices[(i+1)%frame.vertices.length];if(!a||!b)return null;
  const start=horizontal?a.y:a.x,end=horizontal?b.y:b.x;
  if(start===end||axis<Math.min(start,end)||axis>=Math.max(start,end))continue;
  intersections.push((horizontal?a.x:a.y)+(horizontal?b.x-a.x:b.y-a.y)*(axis-start)/(end-start));
 }
 if(intersections.length<2||intersections.length%2)return null;
 const boundary=['right','bottom'].includes(side)?Math.max(...intersections):Math.min(...intersections);
 const point=horizontal?{x:boundary,y:axis}:{x:axis,y:boundary};
 return point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h?point:null;
}
/** The complete private physical body excludes its interior and observed ring,
 * never the empty corners of its rectangular envelope. This mask grants no
 * new paint, glyph ownership or source pixels. Geometry shares the route cap.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box
 * @param {Box} window @param {{checks:number}} work @returns {Uint8Array|null} */
function measuredScenePortBodyMask(image,token,box,window,work){
 if(!hasMeasuredScenePortFrame(image,token,box)||!validGroupBox(window)||!validGroupRecord(work)
  ||![window.x,window.y,window.w,window.h].every(Number.isSafeInteger)||window.w*window.h>262144
  ||window.x+window.w>image.width||window.y+window.h>image.height
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)return null;
 if(hasSceneInkPort(image,token,box))return sceneInkPortMask(image,token,box,window,work);
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;if(!frame)return null;
 const mask=sourcePolygonRowMask(frame.vertices,window,box,work);if(!mask)return null;
 // A measured raster boundary may occupy cells straddling its geometric box.
 // Keep those actual cells; do not dilate the node or infer a fringe.
 for(const cell of frame.perimeter){
  if(++work.checks>4000000)return null;const x=cell%image.width,y=Math.floor(cell/image.width);
  if(x>=window.x&&x<window.x+window.w&&y>=window.y&&y<window.y+window.h)mask[(y-window.y)*window.w+x-window.x]=1;
 }
 return mask;
}
/** Exclude only independently admitted ring cells from a route window.
 * No provider box, serialized token or inferred fringe acquires ownership.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {number} cell */
function measuredScenePortOwnsCell(image,token,box,cell){
 if(!Number.isSafeInteger(cell)||cell<0||cell>=image.width*image.height||!hasMeasuredScenePortFrame(image,token,box))return false;
 if(hasSceneInkPort(image,token,box))return sceneInkPortOwnsCell(image,token,box,cell);
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;
 return !!frame&&frame.perimeter.has(cell);
}
module.exports={createMeasuredScenePortFrame,verifyMeasuredScenePort,measuredScenePortFill,hasMeasuredScenePortFrame,measuredSceneContainsGroup,measuredSceneGroupBounds,
 measuredSceneProjectedPort,measuredSceneContourPort,measuredScenePortBodyMask,measuredScenePortOwnsCell,measuredScenePortPerimeterCells,measuredSceneOpaqueSurface};
