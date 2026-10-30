// @ts-check
"use strict";
const {types}=require("node:util");
/** Exact squared Euclidean distance to observed zero cells. This measures the
 * physical stroke radius without the orientation bias of four-neighbor walks.
 * Work is linear in the admitted window; no source pixels are read.
 * @param {unknown} input @returns {Float64Array} */
function squaredSourceStrokeDistances(input){
 if(!input||typeof input!=="object"||types.isProxy(input)||Array.isArray(input)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(input))
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!("value" in p)))throw new TypeError("Source stroke controls are invalid");
 const value=/** @type {Record<string,unknown>} */(input),{width,height,mask}=value;
 if(typeof width!=="number"||typeof height!=="number"||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width>16384||height>16384||width*height>262144||types.isProxy(mask)||!types.isUint8Array(mask))
  throw new TypeError("Source stroke window is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",mask),length=Reflect.get(proto,"length",mask),offset=Reflect.get(proto,"byteOffset",mask);
 if(!types.isArrayBuffer(buffer)||length!==width*height)throw new TypeError("Source stroke mask is invalid");
 const cells=new Uint8Array(buffer,offset,length);
 if(cells.some(v=>v!==0&&v!==1))throw new TypeError("Source stroke mask is invalid");
 const cap=width*width+height*height+1,vertical=new Float64Array(length);
 for(let x=0;x<width;x++){
  let last=-cap;
  for(let y=0;y<height;y++){if(!cells[y*width+x])last=y;vertical[y*width+x]=last<0?cap:(y-last)**2;}
  last=cap;
  for(let y=height-1;y>=0;y--){if(!cells[y*width+x])last=y;vertical[y*width+x]=Math.min(vertical[y*width+x]??cap,last>=height?cap:(last-y)**2);}
 }
 const result=new Float64Array(length),sites=new Int32Array(width),breaks=new Float64Array(width+1);
 for(let y=0;y<height;y++){
  let k=0;sites[0]=0;breaks[0]=-Infinity;breaks[1]=Infinity;
  for(let q=1;q<width;q++){
   let p=sites[k]??0,s=((vertical[y*width+q]??cap)+q*q-(vertical[y*width+p]??cap)-p*p)/(2*(q-p));
   while(s<=(breaks[k]??-Infinity)){k--;p=sites[k]??0;s=((vertical[y*width+q]??cap)+q*q-(vertical[y*width+p]??cap)-p*p)/(2*(q-p));}
   k++;sites[k]=q;breaks[k]=s;breaks[k+1]=Infinity;
  }
  k=0;
  for(let q=0;q<width;q++){while((breaks[k+1]??Infinity)<q)k++;const p=sites[k]??0;result[y*width+q]=(q-p)**2+(vertical[y*width+p]??cap);}
 }
 return result;
}
module.exports={squaredSourceStrokeDistances};
