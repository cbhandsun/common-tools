// @ts-check
"use strict";
const fs=require('node:fs'),path=require('node:path'),{types}=require('node:util'),{createHash}=require('node:crypto');
const {readPngBuffer}=require('../png');
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {import('../ocr/ocr-source-deck').OcrLine} Line */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{bytes:Buffer,sourceHash:string,width:number,height:number,rgba:Uint8Array,decoded:Raster|null}} Session */
/** Only the later private decode is eligible; the initial public raster may be mutated.
 * @type {WeakMap<object,string>} */const sourceHashes=new WeakMap();
/** @typedef {{session:Session,text:string,pageImage:unknown,segment:unknown,color:string,line:Line,box:Box,neighbors:readonly Box[],ownIndex:number,rotated:boolean,budget:{remaining:number},materialized:Record<string,unknown>|null,jointTried:boolean,candidateTried?:boolean,sourceScale?:{x:number,y:number}}} Pending */
/** @type {WeakMap<object,Session>} */const sessions=new WeakMap();
/** @type {WeakMap<object,Pending>} */const pending=new WeakMap();
/** Shared immutable geometry avoids copying every neighboring OCR box once per
 * deferred row, before the source-analysis limit can stop observations.
 * @type {WeakMap<object,{input:readonly Box[],neighbors:readonly Box[]}>} */const geometrySnapshots=new WeakMap();
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** Preserve encoded source bytes as the identity of deferred observations.
 * Decoding follows the existing PNG bounds; no color/geometry scan occurs here.
 * The public initial raster can be mutated without changing the private source.
 * @param {unknown} file */
function createSourceWordLayoutSession(file){
 if(typeof file!=='string'||file.includes('\0')||!path.isAbsolute(file))throw new TypeError('source word session path is invalid');
 const fd=fs.openSync(file,'r');let bytes;
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size<8||stat.size>128*1024*1024)throw new RangeError('source word session file exceeds the processing boundary');
  bytes=Buffer.alloc(stat.size);let offset=0;
  while(offset<bytes.length){const read=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!read)throw new Error('source word session file changed during capture');offset+=read;}
  if(fs.fstatSync(fd).size!==stat.size)throw new Error('source word session file changed during capture');
 }finally{fs.closeSync(fd);}
 const image=readPngBuffer(bytes,{maxDimension:16384,maxPixels:40000000}),token=Object.freeze({});
 sessions.set(token,{bytes,sourceHash:createHash('sha256').update(bytes).digest('hex'),width:image.width,height:image.height,rgba:image.rgba,decoded:null});return {image,token};
}
/** A serialized option cannot request deferred work or substitute its raster.
 * @param {unknown} token @param {unknown} image */
function admittedSession(token,image){
 if(token===null||typeof token!=='object'||types.isProxy(token)||!record(image))throw new TypeError('source word session identity is invalid');
 const session=sessions.get(token);
 if(!session||image.width!==session.width||image.height!==session.height||image.rgba!==session.rgba)
  throw new TypeError('source word session identity is invalid');
 return session;
}
/** Validate without exposing private source bytes. @param {unknown} token @param {unknown} image */
function validateSourceWordLayoutSession(token,image){admittedSession(token,image);}
/** Internal admitted OCR factory registers geometry and identity only. No new
 * source-analysis allowance is created: every later measurement uses budget.
 * @param {unknown} token @param {Record<string,unknown>} text @param {Line} line
 * @param {Raster} image @param {{remaining:number}} budget @param {readonly Box[]} neighbors @param {boolean} rotated @param {{x:number,y:number}} [sourceScale] */
function deferSourceWordLayout(token,text,line,image,budget,neighbors,rotated,sourceScale){
 const session=admittedSession(token,image);
 if(!record(text.font)||typeof text.font.color!=='string'||!record(text.source)||!record(text.box))return;
 let geometry=geometrySnapshots.get(budget);
 if(!geometry||geometry.input!==neighbors){geometry={input:neighbors,neighbors:structuredClone(neighbors)};geometrySnapshots.set(budget,geometry);}
 const ownIndex=neighbors.indexOf(line.box),capturedLine=structuredClone(line),own=geometry.neighbors[ownIndex];
 if(own)capturedLine.box=own;
 pending.set(text,{session,text:line.text.trim(),pageImage:text.source.pageImage,segment:text.source.segmentedOcrLineId,color:text.font.color,
  line:capturedLine,box:/** @type {Box} */({...text.box}),neighbors:geometry.neighbors,ownIndex,rotated,budget,materialized:null,jointTried:false,...(sourceScale?{sourceScale:{...sourceScale}}:{})});
}
/** @param {string} color */
function light(color){return Math.min(...[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)))>190;}
/** Materialize at final paint, retaining original object identity. A second
 * application reuses the private measured request and charges ordinary recolor
 * measurements normally. Horizontal observations retain their prior priority.
 * @param {{textBoxes:Record<string,unknown>[]}} page @param {readonly Record<string,unknown>[]} originals
 * @param {(text:Record<string,unknown>,line:Line,image:Raster,budget:{remaining:number},neighbors:readonly Box[],rotated:boolean,session?:unknown,sourceScale?:{x:number,y:number})=>void} register
 * @param {(text:Record<string,unknown>,line:Line,image:Raster,budget:{remaining:number},neighbors:readonly Box[],rows:readonly {box:Box,color:string,confidence:number}[])=>void} registerJoint
 * @param {(text:Record<string,unknown>,line:Line,image:Raster,budget:{remaining:number},neighbors:readonly Box[],box:Box)=>void} [registerCandidate]
 * @returns {readonly Record<string,unknown>[]} */
function materializeDeferredSourceWordLayouts(page,originals,register,registerJoint,registerCandidate){
 const current=new Map(page.textBoxes.filter(t=>record(t)&&typeof t.id==='string').map(t=>[t.id,t]));
 const selected=originals.flatMap(original=>{const plan=pending.get(original);return plan&&record(original)&&typeof original.id==='string'?[{original,plan}]:[];});
 if(!selected.length)return originals;
 selected.sort((a,b)=>Number(a.plan.rotated)-Number(b.plan.rotated));
 for(const {original,plan} of selected){
  if(plan.materialized)continue;
  const text=current.get(original.id);
  if(!text||!record(text.source)||text.source.segmentedOcrLineId!==plan.segment||text.text!==plan.text||text.source.pageImage!==plan.pageImage
   ||!record(text.font)||typeof text.font.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(text.font.color))continue;
  const session=plan.session;if(!session.decoded){session.decoded=readPngBuffer(session.bytes,{maxDimension:16384,maxPixels:40000000});sourceHashes.set(session.decoded,session.sourceHash);}
  if(light(text.font.color)!==light(plan.color)){
   // Final paint may reveal the opposite glyph polarity. Keep the ordinary
   // layout unchanged; offer only a separately observed/rendered alternative.
   if(!plan.rotated&&!plan.candidateTried&&registerCandidate){
    plan.candidateTried=true;registerCandidate(text,plan.line,session.decoded,plan.budget,plan.neighbors,plan.box);
   }
   continue;
  }
  const measured={id:original.id,text:plan.text,box:{...plan.box},font:{color:text.font.color},source:{pageImage:plan.pageImage}};
  // The line's own box must remain the identical seed in the neighbor list;
  // separate overlapping boxes continue to act as real foreign evidence.
  register(measured,plan.line,session.decoded,plan.budget,plan.neighbors,plan.rotated,undefined,plan.sourceScale);plan.materialized=measured;
 }
 /** @type {Map<object,{box:Box,color:string,confidence:number}[]>} */const contexts=new Map();
 // Preserve the prior rotated review priority. Failed horizontal observations
 // use only the remainder of the same source allowance and joint target cap.
 for(const {plan} of [...selected.filter(item=>item.plan.rotated),...selected.filter(item=>!item.plan.rotated)]){
  if(!plan.materialized||plan.jointTried||!plan.session.decoded)continue;plan.jointTried=true;
  const related=selected.filter(r=>r.plan.budget===plan.budget&&r.plan.session===plan.session);
  const byIndex=new Map(related.map(r=>[r.plan.ownIndex,r.plan]));
  let rows=contexts.get(plan.budget);
  if(!rows){rows=plan.neighbors.map((box,index)=>{
   const row=byIndex.get(index);
   const font=row?.materialized?.font;
   return row&&record(font)&&typeof font.color==='string'?{box:row.line.box,color:font.color,confidence:row.line.confidence}:{box:{...box},color:'#111111',confidence:0};
  });contexts.set(plan.budget,rows);}
  const neighbors=rows.map(r=>r.box);
  registerJoint(plan.materialized,plan.line,plan.session.decoded,plan.budget,neighbors,rows);
 }
 return originals.map(original=>pending.get(original)?.materialized??original);
}
/** No JSON or initial raster can impersonate the immutable measured source.
 * @param {unknown} image */
function sourceWordRasterSourceHash(image){return image!==null&&typeof image==='object'&&!types.isProxy(image)?sourceHashes.get(image)??null:null;}
module.exports={createSourceWordLayoutSession,validateSourceWordLayoutSession,deferSourceWordLayout,materializeDeferredSourceWordLayouts,sourceWordRasterSourceHash};
