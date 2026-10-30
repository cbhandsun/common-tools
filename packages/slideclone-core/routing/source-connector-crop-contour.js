// @ts-check
"use strict";
const { types } = require("node:util");
const { traceNativeMaskContours } = require("../scene-plan/native-mask-contours");
/** @typedef {Record<string,unknown>} Item */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @returns {value is Item} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(p => "value" in p);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.x >= 0 && value.y >= 0 && value.w >= 0 && value.h >= 0 && value.w + value.h > 0
    && value.x + value.w <= 100000 && value.y + value.h <= 100000;
}
/** @param {unknown} value @param {number} max @returns {Item[]} */
function items(value,max) {
  if (types.isProxy(value) || !Array.isArray(value) || value.length > max || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("source connector objects are invalid");
  /** @type {Item[]} */ const result=[];
  const ids=new Set();
  for(let i=0;i<value.length;i++) {
    const p=Object.getOwnPropertyDescriptor(value,String(i));
    if(!p || !("value" in p) || !record(p.value) || typeof p.value.id !== "string" || !/^[A-Za-z0-9_.:-]{1,256}$/u.test(p.value.id) || ids.has(p.value.id)) throw new TypeError("source connector identity is invalid");
    ids.add(p.value.id);result.push(p.value);
  }
  return result;
}
/** @param {unknown} value @returns {Raster} */
function raster(value) {
  if(!record(value) || !finite(value.width) || !finite(value.height) || !Number.isSafeInteger(value.width)
    || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 512 || value.height > 512
    || value.width*value.height > 262144 || types.isProxy(value.rgba) || !types.isUint8Array(value.rgba)) throw new TypeError("source connector crop is invalid");
  const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",value.rgba),length=Reflect.get(proto,"length",value.rgba);
  if(!types.isArrayBuffer(buffer) || length !== value.width*value.height*4) throw new TypeError("source connector pixels are invalid");
  return {width:value.width,height:value.height,rgba:new Uint8Array(buffer,Reflect.get(proto,"byteOffset",value.rgba),length)};
}
/** @param {Box} outer @param {Box} inner */
function contains(outer,inner) { return inner.x >= outer.x && inner.y >= outer.y && inner.x+inner.w <= outer.x+outer.w && inner.y+inner.h <= outer.y+outer.h; }
/** Source antialiasing may mix the measured ink with its background and a dark
 * edge shadow. Require ink to remain the dominant contribution; unrelated colors
 * cannot pass by merely touching the same bounding box.
 * @param {number[]} pixel @param {number[]} ink @param {number[]} background */
function edgeColor(pixel,ink,background) {
  const a=background.map((v,i)=>v-(ink[i]??0)),b=ink.map(v=>-v),p=pixel.map((v,i)=>v-(ink[i]??0));
  const dot=(/** @type {number[]} */ x,/** @type {number[]} */ y)=>x.reduce((sum,v,i)=>sum+v*(y[i]??0),0);
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),denominator=aa*bb-ab*ab;
  if(denominator<1) return false;
  const light=(dot(p,a)*bb-dot(p,b)*ab)/denominator,shadow=(dot(p,b)*aa-dot(p,a)*ab)/denominator;
  return light>=-0.03 && shadow>=-0.03 && light+shadow<=0.65
    && p.every((v,i)=>Math.abs(v-light*(a[i]??0)-shadow*(b[i]??0))<=24);
}
/** @param {Item} shape @param {Item} image */
function owner(shape,image) {
  if(!box(shape.box) || !box(image.box) || !record(shape.source) || !record(image.source) || !record(shape.style)
    || !["line","connector"].includes(String(shape.type)) || shape.hidden===true || shape.rotation!==undefined || shape.source.sceneRelationId!==undefined || shape.style.startAnchor!==undefined || shape.style.endAnchor!==undefined
    || shape.source.editable!==true || shape.source.nativeRebuild!==true || shape.source.semanticNativeStructure!==true
    || shape.source.pageImage!==image.source.pageImage || !contains(image.box,shape.box)
    || !finite(shape.style.strokeWidthPt) || shape.style.strokeWidthPt<=0 || shape.style.strokeWidthPt>20
    || (shape.style.opacity!==undefined && shape.style.opacity!==1)
    || typeof shape.style.stroke!=="string" || !/^#[a-f\d]{6}$/iu.test(shape.style.stroke)) return null;
  const stroke=shape.style.stroke;
  return {shape,box:shape.box,style:shape.style,color:[1,3,5].map(i=>Number.parseInt(stroke.slice(i,i+2),16))};
}
/** @param {Item} image @param {{widthPt:number,heightPt:number}} size */
function candidate(image,size) {
  if(image.type!=="fidelity-crop" || !box(image.box) || image.box.w<=0 || image.box.h<=0 || !record(image.source)
    || image.source.reason!=="source-isolated-leading-icon" || image.source.protectedMinimumUnit!==true
    || image.source.cropEvidenceRequired!==true || typeof image.source.pageImage!=="string" || !record(image.source.sourceIconEvidence)
    || image.source.sourceIconEvidence.independentSourceROI!==true || !record(image.source.coordinateReferenceSizePx)
    || !box(image.source.tightenedPixelBox) || !box(image.source.mappedPixelBox)
    || !contains({x:0,y:0,w:size.widthPt,h:size.heightPt},image.box) || image.box.w*image.box.h/(size.widthPt*size.heightPt)>0.025) return null;
  const ref=image.source.coordinateReferenceSizePx,pixelBox=image.source.tightenedPixelBox;
  if(!finite(ref.width) || !finite(ref.height) || !Number.isSafeInteger(ref.width) || !Number.isSafeInteger(ref.height)
    || ref.width<1 || ref.height<1 || ref.width>16384 || ref.height>16384 || ref.width*ref.height>40000000
    || !contains(image.source.mappedPixelBox,pixelBox) || !contains({x:0,y:0,w:ref.width,h:ref.height},pixelBox)
    || [pixelBox.x,pixelBox.y,pixelBox.w,pixelBox.h].some(v=>!Number.isSafeInteger(v))) return null;
  const projected={x:image.box.x*ref.width/size.widthPt,y:image.box.y*ref.height/size.heightPt,w:image.box.w*ref.width/size.widthPt,h:image.box.h*ref.height/size.heightPt};
  if(["x","y","w","h"].some(k=>Math.abs(projected[/** @type {keyof Box} */(k)]-pixelBox[/** @type {keyof Box} */(k)])>0.02)) return null;
  return {box:image.box,pixelBox};
}
/** Recover one measured source connector as one movable native contour. This
 * proposes geometry only; the ordinary render and editability gates still apply.
 * @param {Raster} image @param {Box} target @param {NonNullable<ReturnType<typeof owner>>} measured @param {string} cropId */
function contour(image,target,measured,cropId) {
  const {color,shape}=measured,points=[],corePoints=[];
  /** @type {number[][]} */ const channels=[[],[],[]];
  const background=[0,1,2].map(channel=>{
    const corners=[0,image.width-1,(image.height-1)*image.width,image.width*image.height-1]
      .map(index=>image.rgba[index*4+channel]??0).sort((a,b)=>a-b);
    return corners[2]??0;
  });
  const sx=image.width/target.w,sy=image.height/target.h,dx=measured.box.w*sx,dy=measured.box.h*sy,length=dx*dx+dy*dy;
  if(length<144) return null;
  const x1=(measured.box.x-target.x)*sx,y1=(measured.box.y-target.y)*sy;
  const radius=/** @type {number} */(measured.style.strokeWidthPt)*(sx+sy)/4,shaft=new Uint8Array(32);
  let visible=0,overlap=0,halo=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++) {
    const o=(y*image.width+x)*4,a=image.rgba[o+3]??0;
    if(a<128) continue;
    if(x===0 || y===0 || x===image.width-1 || y===image.height-1) return null;
    visible++;
    const distance=Math.max(...color.map((c,i)=>Math.abs(c-(image.rgba[o+i]??0))));
    points.push({x,y});
    if(distance>64) { halo++;continue; }
    corePoints.push({x,y});
    if(a>=224 && distance<=32) for(let i=0;i<3;i++) /** @type {number[]} */(channels[i]).push(image.rgba[o+i]??0);
    const t=((x+.5-x1)*dx+(y+.5-y1)*dy)/length;
    if(t>=0 && t<=1 && distance<=32 && Math.hypot(x+.5-x1-t*dx,y+.5-y1-t*dy)<=radius) {
      overlap++;shaft[Math.min(31,Math.floor(t*32))]=1;
    }
  }
  const core=/** @type {number[]} */(channels[0]);
  if(points.length<28 || corePoints.length/Math.max(1,visible)<0.7 || core.length<16 || overlap<16 || shaft.reduce((a,b)=>a+b,0)<28) return null;
  // Remaining light antialias pixels must form a narrow exterior halo, never a
  // second icon, letter or differently colored detail inside the same crop.
  const cells=new Set(corePoints.map(p=>p.y*image.width+p.x));
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++) {
    const o=(y*image.width+x)*4;if((image.rgba[o+3]??0)<128 || cells.has(y*image.width+x)) continue;
    const values=[0,1,2].map(i=>image.rgba[o+i]??0);
    const axis=background.map((c,i)=>c-(color[i]??0)),denominator=axis.reduce((sum,v)=>sum+v*v,0);
    const blend=axis.reduce((sum,v,i)=>sum+v*((values[i]??0)-(color[i]??0)),0)/Math.max(1,denominator);
    const simple=blend>=0 && blend<=1 && color.every((c,i)=>Math.abs((values[i]??0)-c-blend*(axis[i]??0))<=32);
    if(!simple && !edgeColor(values,color,background)) return null;
    let adjacent=false;
    for(let yy=Math.max(0,y-3);yy<=Math.min(image.height-1,y+3) && !adjacent;yy++) for(let xx=Math.max(0,x-3);xx<=Math.min(image.width-1,x+3);xx++) if(cells.has(yy*image.width+xx)) {adjacent=true;break;}
    if(!adjacent) return null;
  }
  let left=image.width,top=image.height,right=0,bottom=0;
  for(const p of points) {left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
  const bounds={x:left,y:top,w:right-left+1,h:bottom-top+1},segments=traceNativeMaskContours(points,bounds,{tolerancePx:0.75});
  if(!segments || segments.filter(segment=>segment.type==="moveTo").length!==1) return null;
  const fill="#"+channels.map(values=>{
    const sorted=/** @type {number[]} */(values).sort((a,b)=>a-b);
    return (sorted[Math.floor(sorted.length/2)]??0).toString(16).padStart(2,"0");
  }).join("");
  return {...shape,id:/** @type {string} */(shape.id),type:"freeform",box:{x:target.x+left/sx,y:target.y+top/sy,w:bounds.w/sx,h:bounds.h/sy},
    style:{fill,stroke:"none",strokeWidthPt:0,freeformSegments:segments},source:{.../** @type {Item} */(shape.source),
      connector:true,nativeComponentRole:"connector",sourceConnectorCropContour:{provider:"source-connector-crop-contour-v1",cropId,
        matchedForegroundPixels:points.length,measuredStrokeOverlap:overlap,measuredShaftBins:shaft.reduce((a,b)=>a+b,0),haloPixels:halo}}};
}
/** @param {unknown} input @param {(image:Item)=>unknown} readImage */
function reconcileSourceConnectorCrops(input,readImage) {
  if(!record(input) || !record(input.slideSize) || !finite(input.slideSize.widthPt) || !finite(input.slideSize.heightPt)
    || input.slideSize.widthPt<=0 || input.slideSize.heightPt<=0 || input.slideSize.widthPt>100000 || input.slideSize.heightPt>100000
    || typeof readImage!=="function") throw new TypeError("source connector request is invalid");
  const images=items(input.images,2000),shapes=items(input.shapes,10000),size={widthPt:input.slideSize.widthPt,heightPt:input.slideSize.heightPt};
  const replacements=new Map(),removed=new Set();let scanned=0,considered=0;
  for(const image of images) {
    const proof=candidate(image,size);if(!proof || ++considered>128) continue;
    const owners=shapes.map(shape=>owner(shape,image)).filter(value=>value!==null);
    if(owners.length!==1 || replacements.has(owners[0]?.shape.id)) continue;
    if(scanned+proof.pixelBox.w*proof.pixelBox.h*2>4000000) break;
    const pixels=raster(readImage(image));
    if(pixels.width!==proof.pixelBox.w || pixels.height!==proof.pixelBox.h) throw new TypeError("source connector crop dimensions changed");
    scanned+=pixels.width*pixels.height*2;
    const replacement=contour(pixels,proof.box,/** @type {NonNullable<ReturnType<typeof owner>>} */(owners[0]),/** @type {string} */(image.id));
    if(!replacement) continue;
    replacements.set(replacement.id,replacement);removed.add(image.id);
  }
  return {shapes:shapes.map(shape=>replacements.get(shape.id)||shape),images:images.filter(image=>!removed.has(image.id)),replacedCrops:removed.size};
}
module.exports={reconcileSourceConnectorCrops};
