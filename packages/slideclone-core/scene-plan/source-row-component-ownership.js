// @ts-check
"use strict";
const {types}=require('node:util');
const {findSourceRowWhitespaceCorridor}=require('./source-row-whitespace-corridor');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} v @returns {v is number} */
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
/** Attribute only complete connected ink to an ordered observed OCR row.
 * 0 = no observed ink; 255 = unresolved component; 1..4 = witnessed row.
 * Unknown pixels are retained as unknown, never erased or assigned by size.
 * This consumes an already charged binary source snapshot and cannot authorize
 * source erasure. The caller must bind the result to that exact observation.
 * @param {unknown} input */
function classifySourceRowComponents(input){
 if(!record(input)||!finite(input.width)||!finite(input.height)
  ||![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||input.width*input.height>262144)throw new TypeError('source row component frame is invalid');
 const {width:w,height:h,ink:raw,rows}=input;
 if(!Array.isArray(rows)||types.isProxy(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length<2||rows.length>4
  ||Reflect.ownKeys(rows).length!==rows.length+1||Object.values(Object.getOwnPropertyDescriptors(rows)).some(p=>!('value'in p))
  ||rows.some(b=>!record(b)||![b.x,b.y,b.w,b.h].every(finite)||Number(b.x)<0||Number(b.y)<0||Number(b.w)<=0||Number(b.h)<=0
   ||Number(b.x)+Number(b.w)>w||Number(b.y)+Number(b.h)>h))throw new TypeError('source row component seeds are invalid');
 const seeds=/** @type {Box[]} */(rows);
 for(let i=1;i<seeds.length;i++){const a=seeds[i-1],b=seeds[i];
  if(!a||!b||a.y+a.h/2>=b.y+b.h/2)throw new TypeError('source row component order is invalid');}
 if(types.isProxy(raw)||!types.isUint8Array(raw))throw new TypeError('source row component pixels are invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',raw),length=Reflect.get(proto,'length',raw);
 if(!types.isArrayBuffer(buffer)||length!==w*h)throw new TypeError('source row component pixels are invalid');
 const ink=new Uint8Array(buffer,Reflect.get(proto,'byteOffset',raw),length);
 if(ink.some(v=>v!==0&&v!==1))throw new TypeError('source row component pixels are invalid');
 /** @type {number[][]} */const seams=[];
 for(let i=0;i<seeds.length-1;i++){const a=seeds[i],b=seeds[i+1];if(!a||!b)return null;
  const seam=findSourceRowWhitespaceCorridor({width:w,height:h,ink,upperCenter:a.y+a.h/2,lowerCenter:b.y+b.h/2,preferredRow:(a.y+a.h+b.y)/2});
  if(!seam)return null;
  // Independently found corridors must leave an ordered nonempty row band.
  const previous=seams[seams.length-1];if(previous&&seam.some((y,x)=>y<=(previous[x]??h)+2))return null;
  seams.push(seam);
 }
 const seen=new Uint8Array(w*h),owners=new Uint8Array(w*h),queue=new Uint32Array(w*h),knownPixels=seeds.map(()=>0);
 let unknownPixels=0,components=0;
 for(let start=0;start<w*h;start++){
  if(!ink[start]||seen[start])continue;
  let head=0,tail=1,owner=-1,conflict=false,boundary=false,seeded=false;queue[0]=start;seen[start]=1;components++;
  while(head<tail){const at=queue[head++]??0,x=at%w,y=Math.floor(at/w);
   let row=0;for(const seam of seams){const cut=seam[x]??h;if(y>=cut+2)row++;else if(y>=cut)conflict=true;}
   if(owner>=0&&owner!==row)conflict=true;owner=row;
   const seed=seeds[row];if(!seed)return null;
   seeded ||=x+.5>=seed.x&&x+.5<seed.x+seed.w&&y+.5>=seed.y&&y+.5<seed.y+seed.h;
   boundary ||=x===0||y===0||x===w-1||y===h-1;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy,n=yy*w+xx;
    if(xx>=0&&xx<w&&yy>=0&&yy<h&&ink[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
   }
  }
  const label=conflict||boundary||!seeded?255:owner+1;
  for(let i=0;i<tail;i++)owners[queue[i]??0]=label;
  if(label===255)unknownPixels+=tail;else knownPixels[owner]=(knownPixels[owner]??0)+tail;
 }
 if(knownPixels.some(count=>count===0))return null;
 return {owners,seams,knownPixels,unknownPixels,components};
}
module.exports={classifySourceRowComponents};
