// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** A measured native ellipse restores only matching source fill inside its
 * actual interior. Bounding-box corners and the external stroke own no fill.
 * Unsupported transforms and paints fail before returning any row masks.
 * @param {unknown} item @param {{width:number,height:number}} image
 * @param {{w:number,h:number}} size
 * @returns {{x:number,y:number,w:number,h:number,sourceFill:number[]}[]} */
function ellipseBackgroundResidualMasks(item,image,size){
 if(!record(image)||!record(size)||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||![size.w,size.h].every(n=>Number.isFinite(n)&&n>0&&n<=100000))
  throw new TypeError('Residual ellipse frame is invalid');
 if(!record(item)||item.type!=='ellipse'||!record(item.box)||!record(item.style)||!record(item.source)
  ||item.source.residualBackgroundFill!==true)throw new TypeError('Residual ellipse input is invalid');
 const {style,box}=item;
 if(typeof style.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(style.fill)||style.gradient!==undefined
  ||[style.opacity,style.fillOpacity].some(n=>n!==undefined&&n!==1)||style.fillTransparency!==undefined&&style.fillTransparency!==0
  ||[item.rotation,style.rotation,style.rotationDeg,style.rotate].some(n=>n!==undefined&&n!==0)
  ||[style.flipH,style.flipV].some(n=>n!==undefined&&typeof n!=='boolean')
  ||style.stroke!==undefined&&style.stroke!=='none'&&(typeof style.stroke!=='string'||!/^#[a-f0-9]{6}$/iu.test(style.stroke))
  ||style.strokeWidthPt!==undefined&&(typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<0))
  throw new TypeError('Residual ellipse paint is invalid');
 const {x,y,w,h}=box;
 if(typeof x!=='number'||typeof y!=='number'||typeof w!=='number'||typeof h!=='number'
  ||![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>size.w||y+h>size.h)
  throw new TypeError('Residual ellipse geometry is invalid');
 const sx=image.width/size.w,sy=image.height/size.h,rx=w*sx/2,ry=h*sy/2,cx=(x+w/2)*sx,cy=(y+h/2)*sy;
 const fill=style.fill,color=[1,3,5].map(i=>Number.parseInt(fill.slice(i,i+2),16));
 /** @type {{x:number,y:number,w:number,h:number,sourceFill:number[]}[]} */const masks=[];
 for(let row=Math.max(0,Math.floor(y*sy));row<Math.min(image.height,Math.ceil((y+h)*sy));row++){
  const dy=(row+.5-cy)/ry;if(Math.abs(dy)>=1)continue;
  const span=rx*Math.sqrt(1-dy*dy),left=Math.max(0,Math.floor(cx-span-.5)+1),right=Math.min(image.width,Math.ceil(cx+span-.5));
  if(right>left)masks.push({x:left,y:row,w:right-left,h:1,sourceFill:color.slice()});
 }
 return masks;
}
module.exports={ellipseBackgroundResidualMasks};
