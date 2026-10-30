// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** A solid replacement can remove background only inside its own opaque
 * footprint. Rounded shapes use two inscribed rectangles; retaining corner
 * source pixels is conservative and does not invent a rounded-corner radius.
 * Other paint and stroked-only shapes retain their separate mask policies.
 * @param {unknown} item
 * @param {{width:number,height:number}} image
 * @param {{w:number,h:number}} size
 * @returns {{x:number,y:number,w:number,h:number}[]|null} */
function nativeOpaqueRectangleMasks(item,image,size){
 if(!record(image)||!record(size)||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||![size.w,size.h].every(n=>Number.isFinite(n)&&n>0&&n<=100000))
  throw new TypeError('Opaque rectangle frame is invalid');
 if(!record(item)||typeof item.type!=='string'||!['rect','roundRect'].includes(item.type)||!record(item.style)||!record(item.box))return null;
 const {style,box}=item;
 if(typeof style.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(style.fill)
  ||style.opacity!==undefined&&style.opacity!==1||style.fillOpacity!==undefined&&style.fillOpacity!==1
  ||style.fillTransparency!==undefined&&style.fillTransparency!==0||style.gradient!==undefined
  ||style.stroke!==undefined&&style.stroke!=='none'&&style.strokeWidthPt!==0)return null;
 if(![box.x,box.y,box.w,box.h].every(v=>typeof v==='number'&&Number.isFinite(v)))throw new TypeError('Opaque rectangle geometry is invalid');
 const x=Number(box.x),y=Number(box.y),w=Number(box.w),h=Number(box.h);
 if(x<0||y<0||w<=0||h<=0||x+w>size.w||y+h>size.h)throw new TypeError('Opaque rectangle geometry is invalid');
 const radius=item.type==='roundRect'?Math.min(w,h)/2:0;
 const boxes=radius?[{x:x+radius,y,w:w-2*radius,h},{x,y:y+radius,w,h:h-2*radius}]:[{x,y,w,h}];
 return boxes.flatMap(b=>{
  const left=Math.ceil(b.x*image.width/size.w),top=Math.ceil(b.y*image.height/size.h);
  const right=Math.floor((b.x+b.w)*image.width/size.w),bottom=Math.floor((b.y+b.h)*image.height/size.h);
  return right>left&&bottom>top?[{x:left,y:top,w:right-left,h:bottom-top}]:[];
 });
}
module.exports={nativeOpaqueRectangleMasks};
