// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value"in p);}
/** This reads an already charged binary ink snapshot, never more source pixels.
 * A detached component outside the recognition seed cannot censor its glyphs.
 * Connected clipped strokes and nearby detached marks remain unresolved: dots
 * and accents must not disappear merely because OCR underestimated a frame.
 * @param {unknown} input */
function isolateSourceWordInk(input){
 if(!record(input)||typeof input.width!=="number"||typeof input.height!=="number"
  ||![input.width,input.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||input.width*input.height>262144||!record(input.seed))throw new TypeError("source word ink frame is invalid");
 const {width:w,height:h}=input,area=w*h,seed=input.seed;
 if([seed.x,seed.y,seed.w,seed.h].some(v=>typeof v!=="number"||!Number.isFinite(v))
  ||Number(seed.x)<0||Number(seed.y)<0||Number(seed.w)<=0||Number(seed.h)<=0
  ||Number(seed.x)+Number(seed.w)>w||Number(seed.y)+Number(seed.h)>h)throw new TypeError("source word ink seed is invalid");
 if(types.isProxy(input.ink)||!types.isUint8Array(input.ink))throw new TypeError("source word ink pixels are invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",input.ink),length=Reflect.get(proto,"length",input.ink);
 if(!types.isArrayBuffer(buffer)||length!==area)throw new TypeError("source word ink pixels are invalid");
 const ink=new Uint8Array(buffer,Reflect.get(proto,"byteOffset",input.ink),length);
 if(ink.some(v=>v!==0&&v!==1))throw new TypeError("source word ink pixels are invalid");
 const box=/** @type {Box} */({x:Number(seed.x),y:Number(seed.y),w:Number(seed.w),h:Number(seed.h)});
 const neighborInput=input.neighborBoxes===undefined?[]:input.neighborBoxes;
 if(!Array.isArray(neighborInput)||types.isProxy(neighborInput)||Object.getPrototypeOf(neighborInput)!==Array.prototype||neighborInput.length>10000
  ||Reflect.ownKeys(neighborInput).length!==neighborInput.length+1||Object.values(Object.getOwnPropertyDescriptors(neighborInput)).some(p=>!('value'in p))
  ||neighborInput.some(n=>!record(n)||![n.x,n.y,n.w,n.h].every(v=>typeof v==='number'&&Number.isFinite(v))
   ||Number(n.x)<0||Number(n.y)<0||Number(n.w)<=0||Number(n.h)<=0||Number(n.x)+Number(n.w)>w||Number(n.y)+Number(n.h)>h))
  throw new TypeError('source word neighbor ownership is invalid');
 const neighborBoxes=/** @type {Box[]} */(neighborInput);
 const labels=new Uint32Array(area),queue=new Uint32Array(area);
 /** @type {{seeded:boolean,boundary:boolean,box:Box}[]} */const components=[];
 /** @param {number} i @param {(n:number)=>void} visit */
 function neighbors(i,visit){const x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)visit(ny*w+nx);
 }}
 for(let start=0;start<area;start++){
  if(!ink[start]||labels[start])continue;
  const label=components.length+1;let head=0,tail=1,seeded=false,boundary=false,left=w,top=h,right=-1,bottom=-1;
  labels[start]=label;queue[0]=start;
  while(head<tail){const i=queue[head++]??0,x=i%w,y=Math.floor(i/w);
   seeded ||=x+.5>=box.x&&x+.5<box.x+box.w&&y+.5>=box.y&&y+.5<box.y+box.h;
   boundary ||=x===0||y===0||x===w-1||y===h-1;
   left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
   neighbors(i,n=>{if(ink[n]&&!labels[n]){labels[n]=label;queue[tail++]=n;}});
  }
  components.push({seeded,boundary,box:{x:left,y:top,w:right-left+1,h:bottom-top+1}});
 }
 const distance=new Int32Array(area).fill(-1),columnTop=new Int32Array(w).fill(h),columnBottom=new Int32Array(w).fill(-1);
 let head=0,tail=0;
 for(let i=0;i<area;i++)if(components[(labels[i]??0)-1]?.seeded){
  distance[i]=0;queue[tail++]=i;const x=i%w,y=Math.floor(i/w);
  columnTop[x]=Math.min(columnTop[x]??h,y);columnBottom[x]=Math.max(columnBottom[x]??-1,y);
 }
 // One bounded multi-source distance pass protects detached punctuation.
 while(head<tail){const i=queue[head++]??0;neighbors(i,n=>{if(distance[n]===-1){distance[n]=(distance[i]??0)+1;queue[tail++]=n;}});}
 // Only whole disconnected components can belong to another admitted OCR
 // seed. Never subtract pixels from a component touching the current seed.
 // Bound geometry comparisons by the already admitted window area. Exhaustion
 // disables this optional exclusion, preserving the conservative old result.
 const foreign=new Uint8Array(components.length);let checks=0,exhausted=false;
 for(let i=0;i<components.length&&!exhausted;i++){
  const c=components[i];if(!c||c.seeded)continue;
  for(const n of neighborBoxes){
   if(++checks>area){exhausted=true;break;}
   const b=c.box;
   if(b.x>=n.x&&b.y>=n.y&&b.x+b.w<=n.x+n.w&&b.y+b.h<=n.y+n.h){foreign[i]=1;break;}
  }
 }
 if(exhausted)foreign.fill(0);
 const radius=box.h/2,keep=components.map(c=>c.seeded);
 for(let i=0;i<area;i++){
  const index=(labels[i]??0)-1,component=components[index];if(!component||keep[index]||foreign[index])continue;
  const x=i%w,y=Math.floor(i/w),top=columnTop[x]??h,bottom=columnBottom[x]??-1;
  const sameColumn=bottom>=0&&Math.max(top-y,y-bottom,0)<=radius;
  const small=component.box.w<=radius&&component.box.h<=radius&&(distance[i]??-1)>=0&&(distance[i]??Infinity)<=radius;
  if(sameColumn||small)keep[index]=true;
 }
 const retained=new Uint8Array(area),columns=new Uint32Array(w),censoredSides={left:false,right:false,top:false,bottom:false};let censored=false,unseededComponents=0;
 components.forEach((c,i)=>{if(keep[i])censored ||=c.boundary;else unseededComponents++;});
 for(let i=0;i<area;i++)if(keep[(labels[i]??0)-1]){retained[i]=1;columns[i%w]=(columns[i%w]??0)+1;
  censoredSides.left ||=i%w===0;censoredSides.right ||=i%w===w-1;
  censoredSides.top ||=i<w;censoredSides.bottom ||=i>=area-w;
 }
 return {ink:retained,columns,censored,unseededComponents,censoredSides};
}
module.exports={isolateSourceWordInk};
