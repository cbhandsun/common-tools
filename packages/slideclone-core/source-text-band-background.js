// @ts-check
"use strict";
const {types}=require('node:util');
const LIMIT=4000000;
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @returns {v is {x:number,y:number,w:number,h:number}} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** A measured text backplate can seed a connected source band. Its full
 * rectangle needs independent witnesses on all four sides; a text box alone
 * never authorizes expansion. This is UNDERPAINT only: no foreground ownership,
 * erasure permission, residual omission or quality exemption is issued here.
 * Existing Worker candidate rendering and all editability gates remain required.
 * @param {unknown} input */
function proposeSourceTextBandBackgrounds(input){
 if(!record(input)||!record(input.image)||!record(input.slideSize)||!Array.isArray(input.shapes)
  ||types.isProxy(input.shapes)||input.shapes.length>20000
  ||Object.values(Object.getOwnPropertyDescriptors(input.shapes)).some(p=>!('value' in p)))throw new TypeError('Source text band input is invalid');
 const image=input.image,size=input.slideSize,width=Number(image.width),height=Number(image.height);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>40000000
  ||types.isProxy(image.rgba)||!(image.rgba instanceof Uint8Array)||image.rgba.length!==width*height*4
  ||[size.widthPt,size.heightPt].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0))throw new TypeError('Source text band raster is invalid');
 const widthPt=Number(size.widthPt),heightPt=Number(size.heightPt),rgba=image.rgba;
 let checks=0;
 /** @type {{id:string,type:string,box:{x:number,y:number,w:number,h:number},style:{fill:string,stroke:string,strokeWidthPt:number},source:{editable:boolean,nativeRebuild:boolean,detector:string,sourceBackplateId:string,residualBackgroundFill:boolean,sourceBandEvidence:{connectedPixels:number,perimeterWitnessed:boolean,foregroundOwnership:boolean}}}[]} */
 const backgrounds=[];
 if(width<8||height<8)return {backgrounds,checks,exhausted:false};
 if(width*height>LIMIT)return {backgrounds,checks,exhausted:true};
 const seeds=input.shapes.filter(s=>record(s)&&record(s.source)&&s.source.detector==='sampled-text-backplate');
 if(seeds.length>32)return {backgrounds,checks,exhausted:true};
 for(const plate of seeds){
  if(!record(plate)||typeof plate.type!=='string'||!['rect','roundRect'].includes(plate.type)||!record(plate.style)||!record(plate.source)||plate.source.editable!==true||plate.source.nativeRebuild!==true
   ||!box(plate.box)||plate.box.x+plate.box.w>widthPt||plate.box.y+plate.box.h>heightPt
   ||typeof plate.id!=='string'||plate.id.length>200||typeof plate.style.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(plate.style.fill))continue;
  const fill=plate.style.fill,rgb=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16));
  /** @param {number} n */const match=n=>{if(++checks>LIMIT)throw new RangeError('Source text band scan budget exceeded');
   return (rgba[n*4+3]??0)>=240&&rgb.every((v,c)=>Math.abs(v-(rgba[n*4+c]??0))<=16);};
  const seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);
  let head=0,tail=0,minX=width,minY=height,maxX=-1,maxY=-1;
  try{
   for(let y=Math.floor(plate.box.y*height/heightPt);y<Math.min(height,Math.ceil((plate.box.y+plate.box.h)*height/heightPt))&&!tail;y++)
    for(let x=Math.floor(plate.box.x*width/widthPt);x<Math.min(width,Math.ceil((plate.box.x+plate.box.w)*width/widthPt));x++)
     if(match(y*width+x)){queue[tail++]=y*width+x;seen[y*width+x]=1;break;}
   /** @param {number} n */const add=n=>{if(!seen[n]){seen[n]=1;if(match(n))queue[tail++]=n;}};
   while(head<tail){const n=queue[head++]??0,x=n%width,y=Math.floor(n/width);
    minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY);
    if(x)add(n-1);if(x+1<width)add(n+1);if(y)add(n-width);if(y+1<height)add(n+width);
   }
   if(!tail)continue;
   let w=maxX-minX+1,h=maxY-minY+1;
   // Only a source band spanning opposite page edges is admitted. Ordinary
   // panels, L shapes, photos and disconnected same-color patches stay intact.
   if(!((minX===0&&maxX===width-1)||(minY===0&&maxY===height-1))
    ||Math.max(w/h,h/w)<8||w*h>width*height*.08||tail/(w*h)<.7)continue;
   /** @param {number} x @param {number} y @param {number} dx @param {number} dy @param {number} count */
   const side=(x,y,dx,dy,count)=>{let supported=0;for(let i=0;i<count;i++)if(match((y+i*dy)*width+x+i*dx))supported++;return supported/count>=.98;};
   // At most the existing two-pixel source fringe may be excluded. Every
   // admitted side is then witnessed independently across its complete length.
   for(let i=0;i<2&&!side(minX,minY,1,0,w);i++)minY++;
   for(let i=0;i<2&&!side(minX,maxY,1,0,w);i++)maxY--;
   for(let i=0;i<2&&!side(minX,minY,0,1,maxY-minY+1);i++)minX++;
   for(let i=0;i<2&&!side(maxX,minY,0,1,maxY-minY+1);i++)maxX--;
   w=maxX-minX+1;h=maxY-minY+1;
   if(w<8||h<8||!side(minX,minY,1,0,w)||!side(minX,maxY,1,0,w)||!side(minX,minY,0,1,h)||!side(maxX,minY,0,1,h))continue;
   const fitted={x:minX*widthPt/width,y:minY*heightPt/height,w:w*widthPt/width,h:h*heightPt/height};
   if(fitted.x>plate.box.x||fitted.y>plate.box.y||fitted.x+fitted.w<plate.box.x+plate.box.w||fitted.y+fitted.h<plate.box.y+plate.box.h)continue;
   if(input.shapes.some(s=>record(s)&&s.id===plate.id+'-source-band')||backgrounds.some(s=>JSON.stringify(s.box)===JSON.stringify(fitted)))continue;
   backgrounds.push({id:plate.id+'-source-band',type:'rect',box:fitted,
    style:{fill,stroke:'none',strokeWidthPt:0},source:{editable:true,nativeRebuild:true,
     detector:'source-text-band-background',sourceBackplateId:plate.id,residualBackgroundFill:true,
     sourceBandEvidence:{connectedPixels:tail,perimeterWitnessed:true,foregroundOwnership:false}}});
  }catch(error){if(error instanceof RangeError&&checks>LIMIT)return {backgrounds:[],checks:LIMIT,exhausted:true};throw error;}
 }
 return {backgrounds,checks,exhausted:false};
}
module.exports={proposeSourceTextBandBackgrounds};
