// @ts-check
'use strict';
const {freeformResidualMasks}=require('./residual-freeform-mask');
const {createSceneInkPort,sceneInkPortContour,bindSceneInkPortUnit}=require('./source-scene-ink-port');
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {sourceIconPartFringeOwners}=require('./source-icon-part-fringe-owners');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,portFrame:object}} PartNode */
/** @type {WeakMap<object,{source:import('./png').PngImage,box:Box,whole:object,owners:Int8Array,window:Box,parts:(PartNode|null)[]}>} */
const units=new WeakMap();
/** Project the actual native paint order onto an already isolated source crop.
 * The whole-unit contour selects a contacted member; it never becomes a fake
 * Office shape. Each member owns only its actual rendered cells intersected
 * with the original isolated ink; palette approximations grant no extra ink.
 * @param {import('./png').PngImage} source @param {import('./png').PngImage} isolated
 * @param {Box} window @param {Box} iconBox
 * @param {import('./source-scene-native-icon').NativeBinding['parts']} shapes
 * @param {{widthPt:number,heightPt:number}} slideSize */
function createSceneIconPartPorts(source,isolated,window,iconBox,shapes,slideSize){
 if(!validBox(iconBox)||!record(slideSize)||![slideSize.widthPt,slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)
  ||!list(shapes)||shapes.length<2||shapes.length>32||shapes.some(shape=>sceneGroupSnapshot(shape)===null))return null;
 const whole=createSceneInkPort(source,isolated,window,window);
 if(!whole)return null;
 const area=isolated.width*isolated.height;let owners=new Int8Array(area).fill(-1);
 for(let index=0;index<shapes.length;index++){
  const shape=shapes[index];if(!shape||shape.type!=='freeform')return null;
  const b=shape.box,sx=isolated.width/iconBox.w,sy=isolated.height/iconBox.h;
  const x=Math.max(0,(b.x-iconBox.x)*sx),y=Math.max(0,(b.y-iconBox.y)*sy);
  const right=Math.min(isolated.width,(b.x+b.w-iconBox.x)*sx),bottom=Math.min(isolated.height,(b.y+b.h-iconBox.y)*sy);
  if(right<=x||bottom<=y)return null;
  const masks=freeformResidualMasks({...shape,box:{x,y,w:right-x,h:bottom-y}},isolated,{w:isolated.width,h:isolated.height});
  for(const mask of masks)for(let py=mask.y;py<mask.y+mask.h;py++)for(let px=mask.x;px<mask.x+mask.w;px++)owners[py*isolated.width+px]=index;
 }
 const edgeOwners=sourceIconPartFringeOwners({owners,rgba:isolated.rgba,width:isolated.width,height:isolated.height,work:{checks:0}});
 if(!edgeOwners)return null;owners=edgeOwners;
 /** @type {(PartNode|null)[]} */const parts=[];
 for(let index=0;index<shapes.length;index++){
  const shape=shapes[index];if(!shape)return null;
  const rgba=Buffer.alloc(area*4);
  for(let cell=0;cell<area;cell++)if(owners[cell]===index){
   const offset=cell*4;
   if((isolated.rgba[offset+3]??0)>=64)rgba.set(isolated.rgba.subarray(offset,offset+4),offset);
   else owners[cell]=-1;
  }
  const b=shape.box,sx=source.width/slideSize.widthPt,sy=source.height/slideSize.heightPt;
  /** @param {number} n @param {number} scale @param {number} limit */
  const edge=(n,scale,limit)=>{const v=n*scale,r=Math.round(v);return Math.abs(v-r)<=4*Number.EPSILON*limit?r:v;};
  const x=edge(b.x,sx,source.width),y=edge(b.y,sy,source.height);
  const box={x,y,w:edge(b.x+b.w,sx,source.width)-x,h:edge(b.y+b.h,sy,source.height)-y};
  // A fractional native envelope can cross a source cell. Keep its real
  // geometry unchanged and withhold that cell rather than enlarge the shape.
  for(let cell=0;cell<area;cell++)if(owners[cell]===index){
   const px=window.x+cell%window.w,py=window.y+Math.floor(cell/window.w);
   if(px<box.x||px+1>box.x+box.w||py<box.y||py+1>box.y+box.h){rgba[cell*4+3]=0;owners[cell]=-1;}
  }
  const portFrame=createSceneInkPort(source,{...isolated,rgba},window,box);
  if(portFrame&&!bindSceneInkPortUnit(source,portFrame,box,whole,window))return null;
  parts.push(portFrame?{id:shape.id,box,portFrame}:null);
 }
 const token=Object.freeze({});units.set(token,{source,box:{...window},whole,owners,window:{...window},parts});return token;
}
/** Select the topmost real native member at the complete source silhouette.
 * A gap, hole, foreign source or missing member fails closed. The existing
 * physical port's 2-pixel contact boundary also bounds antialiased edge lookup.
 * @param {import('./png').PngImage} source @param {unknown} token
 * @param {number} axis @param {string} side */
function sceneIconPartEndpoint(source,token,axis,side){
 const unit=token!==null&&typeof token==='object'?units.get(token):undefined;
 if(!unit||source.rgba!==unit.source.rgba||source.width!==unit.source.width||source.height!==unit.source.height)return null;
 const point=sceneInkPortContour(source,unit.whole,unit.box,axis,side);if(!point)return null;
 const x=Math.floor(point.x)-(side==='right'?1:0),y=Math.floor(point.y)-(side==='bottom'?1:0),w=unit.window;
 for(let inward=0;inward<=2;inward++){
  const px=x+(side==='left'?inward:side==='right'?-inward:0),py=y+(side==='top'?inward:side==='bottom'?-inward:0);
  if(px<w.x||px>=w.x+w.w||py<w.y||py>=w.y+w.h)continue;
  const index=unit.owners[(py-w.y)*w.w+px-w.x],part=index===undefined?null:unit.parts[index];
  if(part)return {...part,box:{...part.box}};
 }
 return null;
}
/** Enumerate actual private native members for a bounded source observation.
 * No ordering, distance or rectangle can decide which member is contacted.
 * @param {import('./png').PngImage} source @param {unknown} token */
function sceneIconPartNodes(source,token){
 const unit=token!==null&&typeof token==='object'?units.get(token):undefined;
 if(!unit||source.rgba!==unit.source.rgba||source.width!==unit.source.width||source.height!==unit.source.height)return [];
 return unit.parts.flatMap(part=>part?[{...part,box:{...part.box}}]:[]);
}
module.exports={createSceneIconPartPorts,sceneIconPartEndpoint,sceneIconPartNodes};
