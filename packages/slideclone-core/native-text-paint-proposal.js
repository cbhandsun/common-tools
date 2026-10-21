// @ts-check
"use strict";
const {types}=require('node:util');
const {squaredSourceStrokeDistances}=require('./source-stroke-distance');
/** @typedef {[number,number,number]} Color */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {Color} a @param {Color} b @param {number} tolerance */
function near(a,b,tolerance){return a.every((v,c)=>Math.abs(v-(b[c]??0))<=tolerance);}
/** @param {Color} p */
function luminance(p){return p[0]*.2126+p[1]*.7152+p[2]*.0722;}
/** @param {Color[]} colors */
function palettes(colors){
 /** @type {Map<string,Color[]>} */const bins=new Map();
 for(const p of colors){const key=p.map(v=>v>>5).join(',');let bin=bins.get(key);if(!bin){bin=[];bins.set(key,bin);}bin.push(p);}
 return [...bins.values()].map(bin=>{
  const rgb=/** @type {Color} */([0,1,2].map(c=>bin.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(bin.length/2)]??0));
  return {rgb,count:bin.length,support:bin.filter(p=>near(p,rgb,18)).length/bin.length};
 }).sort((a,b)=>b.count-a.count);
}
/** @param {Color} p @param {Color} a @param {Color} b */
function mixture(p,a,b){
 const delta=a.map((v,c)=>v-(b[c]??0)),norm=delta.reduce((s,v)=>s+v*v,0);
 if(!norm)return near(p,a,16);
 const alpha=Math.max(0,Math.min(1,p.reduce((s,v,c)=>s+(v-(b[c]??0))*(delta[c]??0),0)/norm));
 return p.every((v,c)=>Math.abs(v-((b[c]??0)+alpha*(delta[c]??0)))<=16);
}
/** @param {Color} p @param {Color} fill @param {Color} outline @param {Color} background */
function explained(p,fill,outline,background){return near(p,fill,18)||near(p,outline,18)
 ||mixture(p,fill,outline)||mixture(p,fill,background)||mixture(p,outline,background);}
/** Propose native text appearance from an ALREADY charged sampled window.
 * This returns colors and bounds, never glyph paths, erasure masks, or source
 * ownership. The caller must keep OCR identity and verify the native render
 * in a common region before adoption. No allowance is created here.
 * @param {unknown} input */
function proposeNativeTextPaint(input){
 if(!record(input))throw new TypeError('Native text paint input is invalid');
 const {width:w,height:h,rgba}=input;
 if(typeof w!=='number'||typeof h!=='number'||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)
  ||w<1||h<1||w*h>9000||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError('Native text paint window is invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',rgba),length=Reflect.get(proto,'length',rgba);
 if(!types.isArrayBuffer(buffer)||length!==w*h*4)throw new TypeError('Native text paint pixels are invalid');
 const bytes=new Uint8Array(buffer,Reflect.get(proto,'byteOffset',rgba),length);
 /** @type {Color[]} */const samples=[];
 for(let i=0;i<w*h;i++){
  const p=i*4;if((bytes[p+3]??0)<240)return null;
  samples.push([bytes[p]??0,bytes[p+1]??0,bytes[p+2]??0]);
 }
 const palette=palettes(samples),background=palette.find(p=>p.support>=.82&&luminance(p.rgb)>=220);
 if(!background)return null;
 const fill=palette.find(p=>p.support>=.82&&Math.max(...p.rgb)-Math.min(...p.rgb)>50&&!near(p.rgb,background.rgb,41));
 const outline=palette.find(p=>p.support>=.82&&luminance(p.rgb)<80);
 if(!fill||!outline)return null;
 const mask=Uint8Array.from(samples,p=>!near(p,background.rgb,41)&&explained(p,fill.rgb,outline.rgb,background.rgb)?1:0);
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);
 /** @type {{distance:number,boundary:boolean,box:{x:number,y:number,w:number,h:number},indices:number[]}[]} */const components=[];
 for(let seed=0;seed<mask.length;seed++){
  if(!mask[seed]||seen[seed])continue;
  let head=0,tail=1,left=w,top=h,right=-1,bottom=-1,distance=Infinity,boundary=false;queue[0]=seed;seen[seed]=1;
  while(head<tail){const i=queue[head++]??0,x=i%w,y=Math.floor(i/w);
   left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
   distance=Math.min(distance,(x+.5-w/2)**2+(y+.5-h/2)**2);boundary ||=x===0||y===0||x===w-1||y===h-1;
   for(const n of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&mask[n]&&!seen[n]){queue[tail++]=n;seen[n]=1;}
  }
  components.push({distance,boundary,box:{x:left,y:top,w:right-left+1,h:bottom-top+1},indices:Array.from(queue.subarray(0,tail))});
 }
 components.sort((a,b)=>a.distance-b.distance);const principal=components[0];
 if(!principal||principal.boundary||components[1]?.distance===principal.distance)return null;
 // Audit every raw foreground sample in the proposed rectangle, including
 // colors excluded from the proposal mask. Unknown paint cannot disappear.
 /** @type {Color[]} */const raw=[];
 for(let y=principal.box.y;y<principal.box.y+principal.box.h;y++)for(let x=principal.box.x;x<principal.box.x+principal.box.w;x++){
  const p=samples[y*w+x];if(p&&!near(p,background.rgb,41))raw.push(p);
 }
 const paints=palettes(raw),inner=paints.find(p=>p.support>=.82&&Math.max(...p.rgb)-Math.min(...p.rgb)>50);
 const border=paints.find(p=>p.support>=.82&&luminance(p.rgb)<80);
 if(!inner||!border||!raw.length)return null;
 const support=raw.filter(p=>explained(p,inner.rgb,border.rgb,background.rgb)).length/raw.length;
 if(support<.82)return null;
 const stroke=Uint8Array.from(samples,p=>near(p,border.rgb,18)?1:0);
 const distances=squaredSourceStrokeDistances({width:w,height:h,mask:stroke});
 const radii=principal.indices.filter(i=>stroke[i]).map(i=>Math.sqrt(distances[i]??0)).sort((a,b)=>a-b);
 const radius=radii[Math.floor(radii.length*.95)];if(radius===undefined||!Number.isFinite(radius)||radius<=0)return null;
 /** @param {Color} color */const hex=color=>'#'+color.map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase();
 return {frame:principal.box,fillColor:hex(inner.rgb),outlineColor:hex(border.rgb),outlineRadius95:radius,explained:support};
}
module.exports={proposeNativeTextPaint};
