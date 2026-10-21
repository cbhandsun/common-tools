// @ts-check
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {run}=require("./renderer-process"),{resolvePdfToText}=require("./libreoffice-tools");
const {parseTypographyDeck,numeric,jsonSnapshot,record,list}=require("./typography-contract");
/** Numeric-only admission for renderer callbacks. Extra fields cannot reach quality reports.
 * @param {unknown} input */
function parseRenderedTypographyAudit(input){
 if(input===null||input===undefined)return null;
 const value=jsonSnapshot(input);if(!record(value)||typeof value.passed!=='boolean')throw new TypeError('Invalid rendered typography audit');
 const counts=Object.fromEntries(['paragraphs','missing','overflow','collisions','order','unverified','ambiguous'].map(key=>{
  const n=numeric(value[key]===undefined&&['order','unverified','ambiguous'].includes(key)?0:value[key],0,10000000);if(!Number.isInteger(n))throw new TypeError('Invalid rendered typography count');return [key,n];}));
 if(value.passed!==['missing','overflow','collisions','order','unverified','ambiguous'].every(key=>counts[key]===0))throw new TypeError('Contradictory rendered typography audit');
 const measurements=value.measurements===undefined?[]:list(value.measurements,10000).map(row=>{
  if(!record(row))throw new TypeError('Invalid rendered typography measurement');
  const pageIndex=numeric(row.pageIndex,0,49),textIndex=numeric(row.textIndex,0,9999),height=numeric(row.height,.001,100000);
  if(!Number.isInteger(pageIndex)||!Number.isInteger(textIndex))throw new TypeError('Invalid rendered typography measurement');
  return {pageIndex,textIndex,height};
 });
 return {passed:value.passed,paragraphs:counts.paragraphs??0,missing:counts.missing??0,overflow:counts.overflow??0,collisions:counts.collisions??0,
  order:counts.order??0,unverified:counts.unverified??0,ambiguous:counts.ambiguous??0,measurements};
}
/** @param {string} s */
function decode(s){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/giu,(_,entity)=>{
 const known={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
 if(entity in known)return known[/** @type {keyof typeof known} */(entity)];
 const n=entity.startsWith("#x")?parseInt(entity.slice(2),16):Number(entity.slice(1));
 if(!Number.isInteger(n)||n<32||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw new TypeError("Invalid rendered text entity");return String.fromCodePoint(n);
});}
/** @param {string} s */
function census(s){/** @type {Map<string,number>} */const counts=new Map();for(const c of s.normalize("NFC"))if(!/\s/u.test(c))counts.set(c,(counts.get(c)??0)+1);return counts;}
/** Pure bounded parser for Poppler's fixed bbox output. Text never enters logs.
 * @param {unknown} input @param {unknown} xml */
function auditRenderedTypography(input,xml){
 const deck=parseTypographyDeck(input);
 if(typeof xml!=="string"||xml.length>8000000||/<!(?:ENTITY|\[)/iu.test(xml))throw new TypeError("Invalid rendered typography evidence");
 const pages=[...xml.matchAll(/<page\s+width="([\d.]+)"\s+height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/gu)];
 if(pages.length!==deck.pages.length)throw new TypeError("Rendered typography page count differs");
 let paragraphs=0,missing=0,overflow=0,collisions=0,order=0,unverified=0,ambiguous=0;
 /** @type {{pageIndex:number,textIndex:number,height:number}[]} */const measurements=[];
 for(const [i,page] of deck.pages.entries()){
  const p=pages[i];if(!p)throw new TypeError("Rendered typography page missing");
  const sx=deck.slideSize.widthPt/numeric(Number(p[1]),1,100000),sy=deck.slideSize.heightPt/numeric(Number(p[2]),1,100000);
  const words=[...(p[3]??"").matchAll(/<word\s+xMin="([\d.-]+)"\s+yMin="([\d.-]+)"\s+xMax="([\d.-]+)"\s+yMax="([\d.-]+)"[^>]*>([^<]*)<\/word>/gu)];
  if(words.length!==[...(p[3]??"").matchAll(/<word\b/gu)].length)throw new TypeError("Malformed rendered word evidence");
  if(words.length>100000)throw new RangeError("Rendered typography evidence exceeds capacity");
  const observed=words.map(w=>({x:numeric(Number(w[1]),-100000,100000)*sx,y:numeric(Number(w[2]),-100000,100000)*sy,
   right:numeric(Number(w[3]),-100000,100000)*sx,bottom:numeric(Number(w[4]),-100000,100000)*sy,text:decode(w[5]??"")}));
  if(observed.some(w=>w.right<w.x||w.bottom<w.y))throw new TypeError("Invalid rendered word frame");
  // Each PDF word must have a unique physical owner. Overlapping frames cannot
  // borrow the same rendered characters to certify two editable paragraphs.
  if(observed.length*page.textBoxes.length>2000000)throw new RangeError("Rendered text ownership capacity exceeded");
  const owners=observed.map(w=>page.textBoxes.flatMap((t,index)=>{
   const b=t.box;return !t.rotation&&w.x>=b.x-2&&w.x<=b.x+b.w+2&&w.y>=b.y-2&&w.y<=b.y+b.h+2?[index]:[];
  }));
  const ownership=new Map(observed.map((w,index)=>[w,owners[index]??[]]));
  const relevant=new Set();
  for(const [textIndex,t] of page.textBoxes.entries()){if(t.style?.textLayout!=="paragraph")continue;paragraphs++;
   // Axis-aligned PDF boxes cannot establish rotated paragraph containment.
   // Record the unsupported audit explicitly; it must never silently pass.
   if(t.rotation){unverified++;continue;}
   const b=t.box,near=observed.filter((w,index)=>owners[index]?.includes(textIndex));
   ambiguous+=near.filter(w=>(ownership.get(w)?.length??0)>1).length;
   for(const w of near)relevant.add(w);
   const unique=near.filter(w=>ownership.get(w)?.length===1);
   const content=unique.map(w=>w.text).join("").normalize("NFC").replace(/\s/gu,"");
   const actual=census(content);
   // Poppler bbox-layout preserves physical reading order within its blocks.
   // A character census alone would incorrectly accept AB rendered as BA.
   if(content!==t.text.normalize("NFC").replace(/\s/gu,""))order++;
   // The first physical line supplies a renderer measurement, rather than a guessed font ratio.
   const top=Math.min(...unique.map(w=>w.y)),firstLine=unique.filter(w=>w.y<top+Math.max(1,t.font.sizePt*.25));
   if(firstLine.length){const height=Math.max(...firstLine.map(w=>w.bottom))-Math.min(...firstLine.map(w=>w.y));
    if(Number.isFinite(height)&&height>0)measurements.push({pageIndex:i,textIndex,height});}
   for(const [c,count] of census(t.text))missing+=Math.max(0,count-(actual.get(c)??0));
   overflow+=near.filter(w=>w.right>b.x+b.w+2||w.bottom>b.y+b.h+2||w.right<w.x||w.bottom<w.y).length;
  }
  // Ink-facing PDF word boxes, rather than padded OCR frames, detect actual collisions.
  const sorted=observed.slice().sort((a,b)=>a.x-b.x);
  let comparisons=0;
  for(let a=0;a<sorted.length;a++){const left=sorted[a];if(!left)continue;
   for(let b=a+1;b<sorted.length;b++){const right=sorted[b];if(!right||right.x>=left.right)break;
    if(++comparisons>2000000)throw new RangeError("Rendered text collision capacity exceeded");
    if(!relevant.has(left)&&!relevant.has(right))continue;
    const overlap=Math.max(0,Math.min(left.right,right.right)-right.x)*Math.max(0,Math.min(left.bottom,right.bottom)-Math.max(left.y,right.y));
    const area=Math.min((left.right-left.x)*(left.bottom-left.y),(right.right-right.x)*(right.bottom-right.y));
    if(area>0&&overlap>area*.2)collisions++;
   }
  }
 }
 return {passed:missing===0&&overflow===0&&collisions===0&&order===0&&unverified===0&&ambiguous===0,
  paragraphs,missing,overflow,collisions,order,unverified,ambiguous,measurements};
}
/** @param {{deck:unknown,rendered:{pdf?:unknown,data?:{pdf?:unknown}},root:string,isCancellationRequested?:()=>Promise<boolean>}} request */
async function verifyRenderedTypography(request){
 const deck=parseTypographyDeck(request.deck);
 if(!deck.pages.some(p=>p.textBoxes.some(t=>t.style?.textLayout==="paragraph")))return null;
 const pdf=request.rendered.pdf??request.rendered.data?.pdf;
 if(typeof pdf!=="string"||!path.isAbsolute(pdf))throw new TypeError("Rendered typography PDF missing");
 const root=fs.realpathSync(request.root),real=fs.realpathSync(pdf),relative=path.relative(root,real),info=fs.lstatSync(pdf);
 if(!relative||relative.startsWith("..")||path.isAbsolute(relative)||info.isSymbolicLink()||!info.isFile()||info.size>256*1024*1024)
  throw new TypeError("Invalid rendered typography PDF");
 const command=resolvePdfToText();
 const result=await run(command,["-bbox-layout",pdf,"-"],{timeout:60000,maxBuffer:8000000,...(request.isCancellationRequested?{isCancellationRequested:request.isCancellationRequested}:{})});
 return auditRenderedTypography(deck,result.stdout);
}
module.exports={auditRenderedTypography,verifyRenderedTypography,parseRenderedTypographyAudit};
