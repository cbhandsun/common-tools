// @ts-check
'use strict';
const {types}=require('node:util');
const {readNativeFreeformSegments,encodeNativeFreeformPath,decodeNativeFreeformPath}=require('./native-freeform-path');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).every(key=>typeof key==='string')
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value'in p);}
/** @param {unknown} value @returns {number} */
function number(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>100000)throw new TypeError('Residual connector geometry is invalid');return value;}
/** @param {Record<string,unknown>} value @param {string} key */
function flag(value,key){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new TypeError('Residual connector transform is invalid');return value[key]===true;}
/** Match .NET midpoint-to-even quantization of DrawingML path coordinates.
 * @param {number} value */
function rounded(value){const low=Math.floor(value),part=value-low;return part===.5?low+(low%2===0?0:1):Math.round(value);}
/** @param {Box} box */
function drawingBox(box){return {x:rounded(box.x*12700)/12700,y:rounded(box.y*12700)/12700,w:rounded(box.w*12700)/12700,h:rounded(box.h*12700)/12700};}
/** @param {Box} box @param {boolean} flipH @param {boolean} flipV @param {number} rotation @param {{x:number,y:number}} scale */
function transform(box,flipH,flipV,rotation,scale){
 const angle=rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 /** Flips and rotation precede nonuniform pixel scaling, as in DrawingML.
  * @param {Point} p */
 return p=>{const x=(flipH?box.w-p.x:p.x)-box.w/2,y=(flipV?box.h-p.y:p.y)-box.h/2;
  return {x:(box.x+box.w/2+x*cos-y*sin)*scale.x,y:(box.y+box.h/2+x*sin+y*cos)*scale.y};};
}
/** @param {Point} a @param {Point} b @param {Point} p */
function distance(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** Subdivision bounds both control points against the finite chord. This also
 * handles coincident endpoints and collinear curves that double back.
 * @param {Point[]} points @param {Point[]} output @param {number} depth */
function flatten(points,output,depth=0){
 const a=points[0],b=points.at(-1);if(!a||!b)throw new TypeError('Residual connector curve is invalid');
 if(points.slice(1,-1).every(p=>distance(a,b,p)<=.125)){
  if(output.length>=4096)throw new RangeError('Residual connector segment count exceeds boundary');output.push(b);return;
 }
 if(depth>=16)throw new RangeError('Residual connector subdivision exceeds boundary');
 const left=[a],right=[b];let row=points;
 while(row.length>1){row=row.slice(1).map((p,i)=>({x:(p.x+(row[i]?.x??NaN))/2,y:(p.y+(row[i]?.y??NaN))/2}));
  const first=row[0],last=row.at(-1);if(!first||!last)throw new TypeError('Residual connector curve is invalid');left.push(first);right.unshift(last);}
 flatten(left,output,depth+1);flatten(right,output,depth+1);
}
/** Read the drawing geometry, never source.nativeRoutePoints or OCR boxes.
 * This is a projection constraint; it does not grant source pixel ownership.
 * Unsupported geometry fails instead of guessing a bounding-box diagonal.
 * @param {unknown} item @param {unknown} scale @returns {Point[]} */
function residualConnectorPath(item,scale){
 if(!record(item)||!record(item.box)||(item.style!==undefined&&!record(item.style))||!record(scale))throw new TypeError('Residual connector input is invalid');
 const style=/** @type {Record<string,unknown>} */(item.style??{}),raw=item.box;
 const box={x:number(raw.x),y:number(raw.y),w:number(raw.w),h:number(raw.h)};
 const pixelScale={x:number(scale.x),y:number(scale.y)};
 if(pixelScale.x<=0||pixelScale.y<=0)throw new TypeError('Residual connector scale is invalid');
 if(item.type==='freeform'){
  if(box.w<=0||box.h<=0||style.closed!==false||style.fill!=='none')throw new TypeError('Residual connector path must be open and unfilled');
  const segments=decodeNativeFreeformPath(encodeNativeFreeformPath(readNativeFreeformSegments(style)));
  const rawRotation=number(style.rotationDeg??style.rotation??style.rotate??0);
  const rotation=Math.abs(rawRotation)<=.001?0:rounded((rawRotation%360)*60000)/60000;
  const frame=drawingBox(box),project=transform(frame,flag(style,'flipH'),flag(style,'flipV'),rotation,pixelScale);
  /** @type {Point[]} */const output=[];let drawn=false;
  for(const [i,segment]of segments.entries()){
   if(segment.type==='close'||i>0&&segment.type==='moveTo')throw new TypeError('Residual connector subpath is invalid');
   const mapped=segment.points.map(p=>project({x:rounded(p.x*21600)/21600*frame.w,y:rounded(p.y*21600)/21600*frame.h}));
   if(segment.type==='moveTo'||segment.type==='lnTo'){
    const p=mapped[0];if(!p)throw new TypeError('Residual connector point is invalid');
    if(output.length>=4096)throw new RangeError('Residual connector segment count exceeds boundary');output.push(p);
    if(i>0)drawn=true;
   }else{
    const start=output.at(-1);if(!start)throw new TypeError('Residual connector curve is invalid');flatten([start,...mapped],output);drawn=true;
   }
  }
  if(!drawn)throw new TypeError('Residual connector path is empty');return output;
 }
 if(item.type!=='line'&&item.type!=='connector')throw new TypeError('Residual connector type is invalid');
 const type=style.connectorType??'straight';
 if(typeof type!=='string'||!['straight','line','elbow','elbow-2','elbow-3','elbow-4','elbow-5'].includes(type)
  ||style.connectorPath!==undefined)throw new TypeError('Residual connector preset is unsupported');
 const straight=type==='straight'||type==='line';
 let frame={x:Math.min(box.x,box.x+box.w),y:Math.min(box.y,box.y+box.h),w:Math.abs(box.w),h:Math.abs(box.h)};
 let flipH=(box.w<0)!==flag(style,'flipH'),flipV=(box.h<0)!==flag(style,'flipV'),rotation=0;
 if(style.connectorFrame!==undefined){
  if(!record(style.connectorFrame))throw new TypeError('Residual connector frame is invalid');const f=style.connectorFrame;
  frame={x:number(f.x),y:number(f.y),w:number(f.w),h:number(f.h)};rotation=number(f.rotationDeg??0);
  if(frame.w<0||frame.h<0||![0,90,180,270].includes(rotation))throw new TypeError('Residual connector frame is invalid');
  flipH=flag(f,'flipH');flipV=flag(f,'flipV');
 }else if(style.startAnchor!==undefined||style.endAnchor!==undefined){
  throw new TypeError('Residual connector anchors require a drawing frame');
 }
 // Match NativeConnectorExtents, including exact zero axes for straight lines.
 const original={...frame};frame.w=straight&&original.w===0&&original.h>0?0:Math.max(.1,original.w);
 frame.h=straight&&original.h===0&&original.w>0?0:Math.max(.1,original.h);
 frame=drawingBox(frame);
 const count=['elbow-3','elbow-4','elbow-5'].indexOf(type)+1;
 /** @type {number[]} */let adjustments=Array(Math.max(0,count)).fill(50000);
 if(style.connectorAdjustments!==undefined){
  const value=style.connectorAdjustments;
  if(count<=0||!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==count
   ||Reflect.ownKeys(value).length!==count+1||Reflect.ownKeys(value).some(k=>typeof k!=='string')
   ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value'in p)))throw new TypeError('Residual connector adjustments are invalid');
  adjustments=Array.from({length:count},(_,i)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
   const v=descriptor&&'value'in descriptor?descriptor.value:undefined;
   if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>2147483647)throw new TypeError('Residual connector adjustments are invalid');return rounded(v);});
 }
 const w=frame.w,h=frame.h,a=(adjustments[0]??50000)/100000*w,b=(adjustments[1]??50000)/100000*h,c=(adjustments[2]??50000)/100000*w;
 let vertices=[{x:0,y:0},{x:w,y:h}];
 if(type==='elbow'||type==='elbow-2')vertices=[{x:0,y:0},{x:w,y:0},{x:w,y:h}];
 if(type==='elbow-3')vertices=[{x:0,y:0},{x:a,y:0},{x:a,y:h},{x:w,y:h}];
 if(type==='elbow-4')vertices=[{x:0,y:0},{x:a,y:0},{x:a,y:b},{x:w,y:b},{x:w,y:h}];
 if(type==='elbow-5')vertices=[{x:0,y:0},{x:a,y:0},{x:a,y:b},{x:c,y:b},{x:c,y:h},{x:w,y:h}];
 return vertices.map(transform(frame,flipH,flipV,rotation,pixelScale));
}
module.exports={residualConnectorPath,residualConnectorRecord:record};
