// @ts-check
"use strict";
const { freeformResidualMasks } = require("./residual-freeform-mask");
/** Compare complete native paint on the already isolated immutable crop. No
 * new source observation or ownership is minted by this representation score.
 * @param {{width:number,height:number,rgba:Uint8Array}} image
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {{type:string,box:typeof box,style:Record<string,unknown>}[]} shapes */
function sourceIconPaintError(image,box,shapes) {
  const area=image.width*image.height;
  if(area>262144||shapes.length>32)return null;
  const paint=new Uint8Array(area*4);
  for(const shape of shapes){
    if(shape.type!=="freeform"||shape.style.stroke!=="none"||typeof shape.style.fill!=="string"||!/^#[a-f0-9]{6}$/iu.test(shape.style.fill))return null;
    const sx=image.width/box.w,sy=image.height/box.h,b=shape.box;
    let x=(b.x-box.x)*sx,y=(b.y-box.y)*sy,right=(b.x+b.w-box.x)*sx,bottom=(b.y+b.h-box.y)*sy;
    if(x<-.05||y<-.05||right>image.width+.05||bottom>image.height+.05)return null;
    x=Math.max(0,x);y=Math.max(0,y);right=Math.min(image.width,right);bottom=Math.min(image.height,bottom);
    const local={...shape,box:{x,y,w:right-x,h:bottom-y}};
    const masks=freeformResidualMasks(local,image,{w:image.width,h:image.height});
    const hex=shape.style.fill,rgb=[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16));
    for(const mask of masks)for(let py=mask.y;py<mask.y+mask.h;py++)for(let px=mask.x;px<mask.x+mask.w;px++)paint.set([...rgb,255],(py*image.width+px)*4);
  }
  let error=0,missing=0,extra=0;
  for(let i=0;i<area;i++){
    const source=(image.rgba[i*4+3]??0)>=32,rendered=paint[i*4+3]===255;
    if(source&&!rendered){missing++;error+=765;}
    else if(!source&&rendered){extra++;error+=765;}
    else if(source)for(let c=0;c<3;c++)error+=Math.abs((image.rgba[i*4+c]??0)-(paint[i*4+c]??0));
  }
  return {error,missing,extra};
}
module.exports={sourceIconPaintError};
