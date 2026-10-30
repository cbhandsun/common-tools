// @ts-check
"use strict";
const {types}=require('node:util');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} v @returns {v is number} */
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
/** Find a continuous two-pixel whitespace corridor in an already charged ink
 * observation. This does not assign source ownership or authorize erasure.
 * Stair steps require the entire transition rectangle clear on both columns,
 * so a diagonal connected stroke cannot be crossed. All work is bounded by
 * the existing 262144-cell source window; no additional source pixels read.
 * @param {unknown} input @returns {number[]|null} */
function findSourceRowWhitespaceCorridor(input){
 if(!record(input)||!finite(input.width)||!finite(input.height)
  ||![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=16384)
  ||input.width*input.height>262144||!finite(input.upperCenter)||!finite(input.lowerCenter)||!finite(input.preferredRow)
  ||input.upperCenter<0||input.lowerCenter>=input.height||input.upperCenter>=input.lowerCenter
  ||input.preferredRow<0||input.preferredRow>=input.height)
  throw new TypeError('source row corridor frame is invalid');
 const {width:w,height:h,upperCenter,lowerCenter,preferredRow,ink:raw}=input;
 if(types.isProxy(raw)||!types.isUint8Array(raw))throw new TypeError('source row corridor pixels are invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',raw),length=Reflect.get(proto,'length',raw);
 if(!types.isArrayBuffer(buffer)||length!==w*h)throw new TypeError('source row corridor pixels are invalid');
 const ink=new Uint8Array(buffer,Reflect.get(proto,'byteOffset',raw),length);
 if(ink.some(v=>v!==0&&v!==1))throw new TypeError('source row corridor pixels are invalid');
 const lo=Math.ceil(upperCenter),hi=Math.min(h-2,Math.floor(lowerCenter));
 if(lo>hi)return null;
 let previous=new Float64Array(h).fill(Infinity);
 const back=new Int16Array(w*h).fill(-1);
 for(let y=lo;y<=hi;y++)if(!ink[y*w]&&!ink[(y+1)*w])previous[y]=Math.abs(y-preferredRow);
 for(let x=1;x<w;x++){
  const current=new Float64Array(h).fill(Infinity);
  for(let y=lo;y<=hi;y++){
   if(ink[y*w+x]||ink[(y+1)*w+x])continue;
   for(let py=Math.max(lo,y-1);py<=Math.min(hi,y+1);py++){
    const prior=previous[py]??Infinity;if(!Number.isFinite(prior))continue;
    let clear=true;
    for(let yy=Math.min(y,py);yy<=Math.max(y,py)+1;yy++)if(ink[yy*w+x]||ink[yy*w+x-1])clear=false;
    const cost=prior+Math.abs(y-preferredRow);
    if(clear&&cost<(current[y]??Infinity)){current[y]=cost;back[y*w+x]=py;}
   }
  }
  previous=current;
 }
 let end=-1;
 for(let y=lo;y<=hi;y++)if(Number.isFinite(previous[y])&&(end<0||(previous[y]??Infinity)<(previous[end]??Infinity)))end=y;
 if(end<0)return null;
 const seam=new Array(w).fill(0);seam[w-1]=end;
 for(let x=w-1;x>0;x--)seam[x-1]=back[(seam[x]??0)*w+x]??-1;
 // A blank observation cannot establish two physical rows. Even with ink on
 // both sides, callers must separately prove row identity and completeness.
 let above=false,below=false;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink[y*w+x]){
  above ||=y<(seam[x]??0);below ||=y>=(seam[x]??0)+2;
 }
 return above&&below?seam:null;
}
module.exports={findSourceRowWhitespaceCorridor};
