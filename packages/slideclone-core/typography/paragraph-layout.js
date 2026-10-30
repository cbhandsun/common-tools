// @ts-check
"use strict";
/** Complete runs are measured in their real loaded font; no per-letter scale or textLength.
 * Unicode grapheme boundaries are emergency break opportunities, never independent glyph boxes.
 * @param {unknown} input
 * @param {(text:string,font:Record<string,unknown>)=>{width:number,height:number}} measure */
function layoutParagraph(input,measure) {
  if(typeof measure!=="function")throw new TypeError("Invalid paragraph layout");
  // Node admission also rejects proxies. Browser admission inspects data descriptors before any read.
  let nodes=0;const ancestors=new Set();
  /** @param {unknown} value @param {number} depth */
  function scan(value,depth){if(++nodes>10000||depth>12)throw new RangeError("Paragraph input exceeds capacity");
   if(value===null||value===undefined||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))return;
   if(typeof value==="string"){if(value.length>16000)throw new RangeError("Paragraph input exceeds capacity");return;}
   if(typeof value!=="object"||ancestors.has(value)||Object.getOwnPropertySymbols(value).length
    ||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))throw new TypeError("Invalid paragraph data");
   const properties=Object.getOwnPropertyDescriptors(value);
   if(Object.values(properties).some(p=>!("value" in p))||Array.isArray(value)&&Reflect.ownKeys(value).length!==value.length+1)throw new TypeError("Invalid paragraph data");
   ancestors.add(value);for(const p of Object.values(properties))scan(p.value,depth+1);ancestors.delete(value);
  }
  const snapshot=typeof module!=="undefined"&&typeof require==="function"?require("./typography-contract").jsonSnapshot(input):(scan(input,0),structuredClone(input));
  if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))throw new TypeError("Invalid paragraph layout");
  const v=/** @type {{text?:unknown,font?:Record<string,unknown>,box?:{x:number,y:number,w:number,h:number},runs?:{text:string,font:Record<string,unknown>}[]}} */(snapshot);
  const b=v.box,f=v.font;
  if(typeof v.text!=="string"||v.text.length>16000||[...v.text].some(c=>{const n=c.codePointAt(0)??0;return n<9||n>10&&n<32||n===127;})||!b||!f
    ||![b.x,b.y,b.w,b.h,f.sizePt].every(n=>typeof n==="number"&&Number.isFinite(n))||b.w<=0||b.h<=0||Number(f.sizePt)<1)
    throw new TypeError("Invalid paragraph layout");
  const height=Number(f.sizePt)*Number(f.lineHeightMultiple??1.15);
  if(!Number.isFinite(height)||height<Number(f.sizePt)*.5||height>Number(f.sizePt)*4)throw new TypeError("Invalid paragraph leading");
  const runs=v.runs??[{text:v.text,font:f}];
  if(!Array.isArray(runs)||runs.length>512||runs.some(r=>!r||typeof r.text!=="string"||!r.font)||runs.map(r=>r.text).join("")!==v.text)
    throw new TypeError("Invalid paragraph runs");
  const frame=b,baseFont=f;
  /** @type {{text:string,x:number,y:number,w:number,h:number,fragments:{text:string,font:Record<string,unknown>}[]}[]} */const lines=[];
  /** @param {string} s @param {number} offset */
  function fragments(s,offset){let at=0;const end=offset+s.length;
    /** @type {{text:string,font:Record<string,unknown>}[]} */
    const parts=[];
    for(const r of runs){const left=Math.max(offset,at),right=Math.min(end,at+r.text.length);
      if(right>left){const piece=r.text.slice(left-at,right-at),last=parts.at(-1);
        if(last&&JSON.stringify(last.font)===JSON.stringify(r.font))last.text+=piece;else parts.push({text:piece,font:r.font});}at+=r.text.length;
    }return parts;}
  let calls=0;
  /** @param {string} s @param {number} offset */
  function width(s,offset){let total=0;for(const part of fragments(s,offset)){
    if(++calls>40000)throw new RangeError("Paragraph measurement capacity exceeded");const m=measure(part.text,part.font);
    scan(m,0);
    if(!m||![m.width,m.height].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0))throw new TypeError("Invalid paragraph measurement");total+=m.width;
  }return total;}
  /** @param {string} s @param {number} start */
  function append(s,start){const w=width(s,start);const offset=baseFont.align==="center"?(frame.w-w)/2:baseFont.align==="right"?frame.w-w:0;
    lines.push({text:s,x:frame.x+offset,y:frame.y+lines.length*height,w,h:height,fragments:fragments(s,start)});}
  const segmenter=new Intl.Segmenter(undefined,{granularity:"grapheme"});
  let start=0;
  for(const paragraph of v.text.split("\n")){
    let line="",offset=start;
    for(const token of paragraph.match(/\S+\s*|\s+/gu)??[]){
      if(width(line+token,offset)<=b.w){line+=token;continue;}
      if(line){append(line,offset);offset+=line.length;line="";}
      if(width(token,offset)<=b.w){line=token;continue;}
      for(const {segment} of segmenter.segment(token)){
        if(line&&width(line+segment,offset)>b.w){append(line,offset);offset+=line.length;line="";}line+=segment;
      }
    }
    append(line,offset);start+=paragraph.length+1;
  }
  return {lines,overflow:lines.some(l=>l.w>b.w+.01)||lines.length*height>b.h+.01,measurementCalls:calls};
}
if(typeof module!=="undefined")module.exports={layoutParagraph};
