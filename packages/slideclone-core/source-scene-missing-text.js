// @ts-check
"use strict";
const {types}=require("node:util");
const {sourceBox2D}=require("./source-scene-coordinate-frame");
/** @typedef {import("./ocr-result-admission").OcrLine} OcrLine */
/** @typedef {{index:number,text:string|null,confidence:number,box:OcrLine["box"],objectId?:string,labelCandidate?:true}} Proposal */
/** @typedef {{index:number,text:string|null,confidence:number,box?:OcrLine["box"],contextBox?:OcrLine["box"],color?:string,rejection?:"source-unit"}} Observation */
/** @typedef {{width:number,height:number,sourceTargets:{index:number,cropBox:OcrLine["box"]}[],sheetTargets:{index:number,cropBox:OcrLine["box"]}[]}} CropFrame */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>"value" in d);}
/** @param {unknown} value @returns {unknown[]} */
function list(value){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>32
 ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!("value" in d)))throw new TypeError("Scene missing text collection is invalid");return value;}
/** @param {unknown} value @returns {value is string} */
function text(value){return typeof value==="string"&&value.length>0&&value.length<=256&&value.trim()===value&&!/[\p{Cc}\p{Cf}]/u.test(value);}
/** @param {unknown} value @returns {value is number} */
function confidence(value){return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1;}
/** @param {OcrLine["box"]} a @param {OcrLine["box"]} b */
function duplicate(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))
 *Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))>=Math.min(a.w*a.h,b.w*b.h)*.2;}
/** Global text is a proposal only. No existing OCR text is rewritten.
 * @param {unknown} response @param {readonly OcrLine[]} lines
 * @param {{width:number,height:number}} image @returns {Proposal[]} */
function proposeMissingSceneText(response,lines,image){
 const result=partitionMissingSceneText(response,lines,image);
 if(result.rejected.length)throw new TypeError("Scene missing text overlaps existing evidence");
 return result.proposals;
}
/** Validate syntax strictly, then reject each conflicting optional proposal
 * without discarding independently validated structure. Rejections retain no
 * provider text and must remain visible to the final completion gate.
 * @param {unknown} response @param {readonly OcrLine[]} lines
 * @param {{width:number,height:number}} image */
function partitionMissingSceneText(response,lines,image){
 if(!record(response))throw new TypeError("Scene missing text response is invalid");
 if(response.missingText===undefined)return {proposals:[],rejected:[]};
 /** @type {Proposal[]} */const result=[];
 /** @type {{index:number,reason:string}[]} */const rejected=[];
 for(const [index,raw] of list(response.missingText).entries()){
  if(!record(raw)||!text(raw.text)||!confidence(raw.confidence))throw new TypeError("Scene missing text item is invalid");
  const b=list(raw.box_2d);
  if(b.length!==4||!b.every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1000)
   ||Number(b[0])>=Number(b[2])||Number(b[1])>=Number(b[3]))throw new TypeError("Scene missing text coordinates are invalid");
  const box={x:Number(b[1])*image.width/1000,y:Number(b[0])*image.height/1000,
   w:(Number(b[3])-Number(b[1]))*image.width/1000,h:(Number(b[2])-Number(b[0]))*image.height/1000};
  const conflict=lines.some(l=>duplicate(l.box,box))?"existing-evidence-overlap":result.some(l=>duplicate(l.box,box))?"proposal-overlap":null;
  if(conflict){rejected.push({index,reason:conflict});continue;}
  if(lines.length+result.length>=512)throw new RangeError("Scene OCR context exceeds boundary");
  result.push({index:lines.length+result.length,text:raw.text,confidence:raw.confidence,box});
 }
 return {proposals:result,rejected};
}
/** A global graphic label is not proof that its region has no glyphs. Inspect
 * uncovered physical units in the SAME local batch and remaining target slots.
 * @param {import("./source-scene-plan").SceneObject[]} objects @param {readonly OcrLine[]} lines
 * @param {Proposal[]} existing @param {number} capacity @returns {Proposal[]} */
function discoverMissingSceneText(objects,lines,existing,capacity){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError("Scene missing text target capacity is invalid");
 /** @type {Proposal[]} */const result=[];
 for(const object of objects){
  if(result.length>=capacity||lines.length+existing.length+result.length>=512)break;
  // Correcting a badge from icon to container must not remove its omitted
  // glyphs from discovery. Kind proposes a physical unit, never text absence.
  if(!["icon","container"].includes(object.kind)||object.box.w*object.box.h>262144||object.box.w<6||object.box.h<6
   ||lines.some(l=>duplicate(l.box,object.box))||[...existing,...result].some(l=>duplicate(l.box,object.box)))continue;
  // A text-only physical unit without OCR needs its own label observation.
  // This is a scheduling hypothesis, not a transcription or source capability.
  // Keep it through the final pixel allocator; otherwise optional whole-region
  // inventories can silently consume both views before any labels are seen.
  result.push({index:lines.length+existing.length+result.length,text:null,confidence:0,box:object.box,objectId:object.id,
   ...(object.kind==='container'&&object.pictorialContent==='absent'?{labelCandidate:/** @type {const} */(true)}:{})});
 }
 return result;
}
/** Independent crop transcriptions contain no proposed text in their prompt.
 * @param {unknown} response @param {Proposal[]} proposals @param {CropFrame} [frame]
 * @returns {Observation[]} */
function readMissingSceneObservations(response,proposals,frame){
 if(!record(response))throw new TypeError("Scene missing text response is invalid");
 const rows=response.recoveredText===undefined?[]:list(response.recoveredText),seen=new Set();
 const result=rows.map(raw=>{
  if(!record(raw)||typeof raw.index!=="number"||!Number.isSafeInteger(raw.index)||!proposals.some(p=>p.index===raw.index)
   ||seen.has(raw.index)||!(raw.text===null||text(raw.text))||!confidence(raw.confidence))throw new TypeError("Scene missing text observation is invalid");
  seen.add(raw.index);
  // A zero-confidence transcription grants no text/geometry authority. Some
  // providers serialize an unreadable placeholder as a string instead of null.
  const observedText=raw.confidence===0?null:/** @type {string|null} */(raw.text);
  const proposal=proposals.find(p=>p.index===raw.index);
  /** @type {OcrLine["box"]|undefined} */let box;
  /** @type {OcrLine["box"]|undefined} */let contextBox;
  /** @type {string|undefined} */let color;
  if(observedText!==null&&proposal?.text===null){
   const b=list(raw.box_2d),source=frame?.sourceTargets.find(t=>t.index===raw.index),sheet=frame?.sheetTargets.find(t=>t.index===raw.index);
   if(!frame||!source||!sheet||b.length!==4||!b.every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1000))
    throw new TypeError("Scene missing text glyph coordinates are invalid");
   if(typeof raw.color!=="string"||!/^#[a-f0-9]{6}$/iu.test(raw.color))throw new TypeError("Scene missing text glyph color is invalid");
   // A bounded but reversed/empty rectangle cannot own pixels. Reject the
   // bound unit without reordering coordinates or discarding other targets;
   // the planner carries this failure into the final completion obligation.
   if(Number(b[0])>=Number(b[2])||Number(b[1])>=Number(b[3]))
    return {index:raw.index,text:observedText,confidence:raw.confidence,rejection:/** @type {const} */("source-unit")};
   // This observation cannot satisfy the unchanged admission confidence.
   // Validate its syntax, but grant no source geometry/color authority. A
   // low-confidence misplaced crop must reject that candidate rather than
   // invalidate independently checked topology or other OCR observations.
   if(raw.confidence<.9)return {index:raw.index,text:observedText,confidence:raw.confidence};
   color=raw.color.toUpperCase();contextBox=source.cropBox;
   box={x:Number(b[1])*frame.width/1000-sheet.cropBox.x+source.cropBox.x,y:Number(b[0])*frame.height/1000-sheet.cropBox.y+source.cropBox.y,
    w:(Number(b[3])-Number(b[1]))*frame.width/1000,h:(Number(b[2])-Number(b[0]))*frame.height/1000};
   const outer=proposal.box;
   // Compare in the exact transmitted frame. Its outward integer rounding
   // can encompass a fractional source edge; intersect that cell with the
   // original unit instead of expanding source authority by a pixel tolerance.
   const candidate=sourceBox2D({x:sheet.cropBox.x+outer.x-source.cropBox.x,y:sheet.cropBox.y+outer.y-source.cropBox.y,w:outer.w,h:outer.h},frame);
   // Valid syntax is only a proposal. Out-of-unit geometry rejects this unit
   // without aborting unrelated source structure or acquiring pixel authority.
   if(Number(b[0])<candidate[0]||Number(b[1])<candidate[1]||Number(b[2])>candidate[2]||Number(b[3])>candidate[3])
    return {index:raw.index,text:observedText,confidence:raw.confidence,rejection:/** @type {const} */("source-unit")};
   const right=Math.min(outer.x+outer.w,box.x+box.w),bottom=Math.min(outer.y+outer.h,box.y+box.h);
   box={x:Math.max(outer.x,box.x),y:Math.max(outer.y,box.y),w:right-Math.max(outer.x,box.x),h:bottom-Math.max(outer.y,box.y)};
  }
  return {index:raw.index,text:observedText,confidence:raw.confidence,
   ...(box?{box}:{}),...(contextBox?{contextBox}:{}),...(color?{color}:{})};
 });
 if(result.length!==proposals.length)throw new TypeError("Scene missing text crop binding is invalid");
 return result;
}
/** Source color variation is necessary, never sufficient, to prove a glyph.
 * Scan only confirmed candidates, charging every pixel to the crop budget.
 * @param {import("./png").PngImage} image @param {Proposal} proposal @param {{used:number}} budget */
function hasSourceContrast(image,proposal,budget,isolate=false,inkColor=/** @type {string|undefined} */(undefined),seedBox=proposal.box){
 const b=proposal.box,x0=Math.floor(b.x),y0=Math.floor(b.y),x1=Math.ceil(b.x+b.w),y1=Math.ceil(b.y+b.h),area=(x1-x0)*(y1-y0);
 if(area>262144)return null;
 const work=area*(isolate&&!inkColor?2:1);
 if(budget.used+work>4000000)throw new RangeError("Scene crop pixel budget exceeded");budget.used+=work;
 /** @type {Map<string,{count:number,r:number,g:number,b:number}>} */const colors=new Map();
 let opaque=0;
 if(!inkColor)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const i=(y*image.width+x)*4;if((image.rgba[i+3]??0)<240)continue;opaque++;
  const r=image.rgba[i]??0,g=image.rgba[i+1]??0,b=image.rgba[i+2]??0,key=`${Math.floor(r/16)},${Math.floor(g/16)},${Math.floor(b/16)}`;
  const entry=colors.get(key)||{count:0,r:0,g:0,b:0};entry.count++;entry.r+=r;entry.g+=g;entry.b+=b;colors.set(key,entry);
 }
 const dominant=[...colors.values()].sort((a,b)=>b.count-a.count)[0];if(!inkColor&&(!dominant||opaque!==area))return null;
 const background=dominant?[dominant.r,dominant.g,dominant.b].map(v=>v/dominant.count):[];
 const contrast=[...colors.values()].filter(c=>Math.max(...[c.r,c.g,c.b].map((v,i)=>Math.abs(v/c.count-(background[i]??0))))>=42)
  .reduce((sum,c)=>sum+c.count,0);
 if(!inkColor&&contrast<12)return null;
 if(!isolate)return b;
 const width=x1-x0,height=y1-y0,mask=new Uint8Array(area),queue=new Int32Array(area);
 const foreground=inkColor?[1,3,5].map(i=>Number.parseInt(inkColor.slice(i,i+2),16)):null;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const i=(y*image.width+x)*4;
  if((image.rgba[i+3]??0)<240)return null;
  if(foreground?foreground.every((v,c)=>Math.abs(v-(image.rgba[i+c]??0))<=18)
   :Math.max(...background.map((v,c)=>Math.abs(v-(image.rgba[i+c]??0))))>=42)mask[(y-y0)*width+x-x0]=1;
 }
 let minX=x1,minY=y1,maxX=x0,maxY=y0,owned=0,largestClipped=0;
 for(let seed=0;seed<area;seed++){
  if(!mask[seed])continue;mask[seed]=0;queue[0]=seed;let head=0,tail=1,boundary=false,seeded=false;
  while(head<tail){
   const n=queue[head++]??0,x=n%width,y=Math.floor(n/width);boundary ||= x===0||y===0||x===width-1||y===height-1;
   seeded ||= x+x0>=seedBox.x&&y+y0>=seedBox.y&&x+x0<seedBox.x+seedBox.w&&y+y0<seedBox.y+seedBox.h;
   for(const next of [x?n-1:-1,x<width-1?n+1:-1,y?n-width:-1,y<height-1?n+width:-1])if(next>=0&&mask[next]){mask[next]=0;queue[tail++]=next;}
  }
  if(boundary){largestClipped=Math.max(largestClipped,tail);continue;}
  if(tail<12||!seeded)continue;
  for(let i=0;i<tail;i++){const n=queue[i]??0,x=x0+n%width,y=y0+Math.floor(n/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}owned+=tail;
 }
 // A clipped dominant foreground can leave an enclosed counter/hole behind.
 // That hole is not a complete glyph, even when both models name its parent.
 return owned>=12&&(foreground||largestClipped<owned)?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null;
}
/** @param {Proposal[]} proposals
 * @param {Observation[][]} observations
 * @param {import("./png").PngImage} image @param {{used:number}} budget @param {readonly OcrLine[]} [existing] */
function acceptMissingSceneText(proposals,observations,image,budget,existing=[]){
 if(observations.length!==2)throw new TypeError("Scene missing text requires two observations");
 /** @type {OcrLine[]} */const lines=[];
 /** @type {{index:number,reason:string}[]} */const rejected=[];
 for(const proposal of proposals){
  const a=observations[0]?.find(o=>o.index===proposal.index),b=observations[1]?.find(o=>o.index===proposal.index);
  if(!a||!b)throw new TypeError("Scene missing text crop binding is invalid");
  if(a.rejection||b.rejection){rejected.push({index:proposal.index,reason:"glyph-source-unit"});continue;}
  const confidence=Math.min(...(proposal.text===null?[a.confidence,b.confidence]:[proposal.confidence,a.confidence,b.confidence]));
  if(confidence<.9){rejected.push({index:proposal.index,reason:"recognition-confidence"});continue;}
  let box=proposal.box,geometrySupported=true;
  if(proposal.text===null){
   if(!a.box||!b.box)geometrySupported=false;
   else{
    const colorCandidates=[...new Set([a.color,b.color].filter(c=>typeof c==="string"))];
    /** @type {{a:OcrLine["box"],b:OcrLine["box"]}[]} */const fits=[];
    for(const color of colorCandidates.length?colorCandidates:[undefined]){
     const first=hasSourceContrast(image,{...proposal,box:color&&a.contextBox||a.box},budget,true,color,a.box);
     const second=hasSourceContrast(image,{...proposal,box:color&&b.contextBox||b.box},budget,true,color,b.box);
     const localizedArea=Math.max(a.box.w*a.box.h,b.box.w*b.box.h);
     if(first&&second&&first.w*first.h<=localizedArea&&second.w*second.h<=localizedArea
      &&!fits.some(fit=>["x","y","w","h"].every(k=>fit.a[/** @type {keyof OcrLine["box"]} */(k)]===first[/** @type {keyof OcrLine["box"]} */(k)]
       &&fit.b[/** @type {keyof OcrLine["box"]} */(k)]===second[/** @type {keyof OcrLine["box"]} */(k)])))fits.push({a:first,b:second});
    }
    // Provider colors propose pixel classes only. A backdrop surrounding a
    // smaller independently measured glyph cannot replace that inner glyph.
    const inner=fits.filter(fit=>!fits.some(other=>other!==fit&&other.a.x>=fit.a.x&&other.a.y>=fit.a.y
     &&other.a.x+other.a.w<=fit.a.x+fit.a.w&&other.a.y+other.a.h<=fit.a.y+fit.a.h
     &&other.a.w*other.a.h<fit.a.w*fit.a.h));
    const sourceA=inner.length===1?inner[0]?.a:null,sourceB=inner.length===1?inner[0]?.b:null;
    if(!sourceA||!sourceB)geometrySupported=false;
    else{
     const x=Math.max(sourceA.x,sourceB.x),y=Math.max(sourceA.y,sourceB.y),w=Math.max(0,Math.min(sourceA.x+sourceA.w,sourceB.x+sourceB.w)-x),h=Math.max(0,Math.min(sourceA.y+sourceA.h,sourceB.y+sourceB.h)-y);
     geometrySupported=w*h/(sourceA.w*sourceA.h+sourceB.w*sourceB.h-w*h)>=.85;
     const left=Math.min(sourceA.x,sourceB.x),top=Math.min(sourceA.y,sourceB.y);
     box={x:left,y:top,w:Math.max(sourceA.x+sourceA.w,sourceB.x+sourceB.w)-left,h:Math.max(sourceA.y+sourceA.h,sourceB.y+sourceB.h)-top};
    }
   }
  }
  const reason=a.text===null||a.text!==b.text||proposal.text!==null&&a.text!==proposal.text?"transcription-disagreement"
   :!geometrySupported?"glyph-geometry-disagreement":[...existing,...lines].some(line=>duplicate(line.box,box))?"existing-ocr-overlap":confidence<.9?"recognition-confidence"
   :proposal.text!==null&&!hasSourceContrast(image,{...proposal,box},budget)?"source-contrast":null;
  if(reason){rejected.push({index:proposal.index,reason});continue;}
  lines.push({text:/** @type {string} */(a.text),confidence,box});
 }
 return {lines,rejected};
}
/** Rejected source geometry is a failed completion obligation, even if other
 * independent glyphs or relations can still be measured. Null/unreadable
 * speculative units do not assert text existence and stay ordinary rejections.
 * @param {import('./source-scene-plan').ScenePlan|undefined} plan
 * @param {{index:number,reason:string}[]} rejected */
function bindMissingSceneTextRejections(plan,rejected){
 const failures=rejected.filter(item=>item.reason==='glyph-source-unit');
 if(!plan||!failures.length)return plan;
 return {...plan,admission:{...plan.admission,complete:false,rejections:[...(plan.admission?.rejections??[]),
  ...failures.map(item=>({collection:'missingText',index:item.index,reason:item.reason}))]}};
}
module.exports={proposeMissingSceneText,partitionMissingSceneText,discoverMissingSceneText,readMissingSceneObservations,acceptMissingSceneText,bindMissingSceneTextRejections};
