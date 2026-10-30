// @ts-check
"use strict";
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {readPngBuffer}=require('../png');
const {sourceRaster}=require('../typography/residual-text-mask');
const {record,list,box}=require('./source-scene-group-containment');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
const {measureLeadingSceneIconFootprint}=require('./source-scene-icon-semantic-footprint');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{widthPt:number,heightPt:number}} SlideSize */
/** @typedef {import('../png').PngImage} Image */
/** @typedef {{sourceFile:string,sourceHash:string,pixelHash:string,width:number,height:number,planRevision:string,textRevision:string,textBox:Box,textStartBox:Box,expectedComponents:number,objectId:string,regionId:string,seed:Box,window:Box,slideSize:SlideSize,transcript:string,expires:number}} Review */
/** Controls belong to the trusted host review adapter. Serialized review
 * documents, VLM output and caller acceptance/provenance flags are inert.
 * @type {WeakMap<object,Review>} */const controls=new WeakMap();
/** @type {WeakMap<object,{review:Review,budget?:{used:number},receipt?:object}>} */const confirmations=new WeakMap();
/** @type {WeakMap<object,{review:Review,pixels:Uint8Array,plan:unknown,textBoxes:unknown,budget:{used:number},minimumUsed:number,cells:Set<number>}>} */const receipts=new WeakMap();
/** @param {Uint8Array|string} bytes */
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
/** Read a fixed, bounded ordinary file. Decode and PNG digest use these SAME
 * bytes; errors contain no source path, transcript or underlying OS detail.
 * @param {string} file @returns {Buffer} */
function sourceBytes(file){
 let fd;
 try{
  const before=fs.statSync(file);
  if(!before.isFile()||before.size<8||before.size>12*1024*1024)throw new TypeError('source-boundary');
  fd=fs.openSync(file,'r');const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.size!==before.size)throw new TypeError('source-changed');
  const bytes=Buffer.alloc(opened.size);let read=0;
  while(read<bytes.length){const count=fs.readSync(fd,bytes,read,bytes.length-read,read);if(!count)throw new TypeError('source-short');read+=count;}
  if(fs.fstatSync(fd).size!==opened.size)throw new TypeError('source-changed');
  return bytes;
 }catch{throw new TypeError('Scene icon review source file is unavailable');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
/** Bounded snapshots reject accessors, proxies, symbols, sparse arrays and
 * cycles before traversing an untrusted plan or OCR tree.
 * @param {unknown} input @returns {string} */
function snapshot(input){
 let remaining=100000;const active=new Set();
 /** @param {unknown} value @param {number} depth @returns {boolean} */
 const safe=(value,depth)=>{
  if(--remaining<0||depth>24)return false;
  if(value===null||value===undefined||typeof value==='boolean')return true;
  if(typeof value==='string')return value.length<=32000;
  if(typeof value==='number')return Number.isFinite(value);
  if(!record(value)&&!list(value)||active.has(value)||Object.getOwnPropertySymbols(value).length)return false;
  if(!Array.isArray(value)&&Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!d.enumerable))return false;
  if(Array.isArray(value)&&Object.entries(Object.getOwnPropertyDescriptors(value)).some(([key,d])=>key!=='length'&&!d.enumerable))return false;
  active.add(value);const valid=Object.values(value).every(child=>safe(child,depth+1));active.delete(value);return valid;
 };
 if(!safe(input,0))throw new TypeError('Scene icon review snapshot is invalid');
 const text=JSON.stringify(input);if(typeof text!=='string'||text.length>2000000)throw new TypeError('Scene icon review snapshot exceeds its bound');
 return hash(text);
}
/** Canonicalize only subpixel arithmetic roundoff in source coordinates.
 * Output boxes, positioned runs, styling and fonts grant no source identity.
 * @param {unknown} texts @param {Image} image @param {SlideSize} size */
function textState(texts,image,size){
 snapshot(texts);
 if(!list(texts)||texts.length>10000)throw new TypeError('Scene icon review OCR is invalid');
 const mapped=sourceSceneTextBoxes(/** @type {{text:string,box:Box,source?:Record<string,unknown>,id?:string}[]} */(texts),image,size);
 const sx=image.width/size.widthPt,sy=image.height/size.heightPt;
 /** @param {number} n */const scalar=n=>Math.round(n*1e8)/1e8;
 /** @param {Box} b */const pixels=b=>({x:scalar(b.x*sx),y:scalar(b.y*sy),w:scalar(b.w*sx),h:scalar(b.h*sy)});
 const entries=mapped.map(t=>{
  const source=t.source;
  if(typeof t.id!=='string'||!record(source)||!box(source.evidenceBox)||typeof source.ocrLabelRef!=='string'
   ||!source.ocrLabelRef||typeof t.text!=='string')throw new TypeError('Scene icon review OCR provenance is invalid');
  return {id:t.id,text:t.text,box:pixels(t.box),evidenceBox:pixels(source.evidenceBox),label:source.ocrLabelRef,
   polygon:source.ocrPolygonPt===undefined?null:/** @type {number[][]} */(source.ocrPolygonPt).map(p=>[scalar(Number(p[0])*sx),scalar(Number(p[1])*sy)]),
   provider:source.ocrProvider??null,confidence:source.confidence??null};
 });
 if(new Set(entries.map(t=>t.id)).size!==entries.length)throw new TypeError('Scene icon review OCR identity conflicts');
 return {entries,revision:snapshot(entries)};
}
/** @param {unknown} value @returns {SlideSize} */
function size(value){
 if(!record(value)||typeof value.widthPt!=='number'||typeof value.heightPt!=='number'
  ||![value.widthPt,value.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('Scene icon review slide frame is invalid');
 return {widthPt:value.widthPt,heightPt:value.heightPt};
}
/** @param {Box} a @param {Box} b */
function contains(a,b){return b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;}
/** Capture the actual original source and complete human observation. The
 * trusted host may restore a retained, hash-verified observation after its
 * recorded human reply. A new control must never imply an earlier timestamp.
 * A capture alone grants nothing.
 * @param {unknown} input @returns {object} */
function captureSceneIconSemanticReview(input){
 if(!record(input)||typeof input.sourceFile!=='string'||!path.isAbsolute(input.sourceFile))throw new TypeError('Scene icon review source is invalid');
 const planRevision=snapshot(input.plan),plan=input.plan;
 if(!record(plan)||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)||!list(plan.objects)||!list(plan.regions)
  ||typeof input.objectId!=='string'||typeof input.textId!=='string')throw new TypeError('Scene icon review plan is invalid');
 const bytes=sourceBytes(input.sourceFile),sourceHash=hash(bytes),image=readPngBuffer(bytes,{maxFileBytes:12*1024*1024,maxPixels:40000000});
 if(sourceHash!==plan.sourceHash||image.width!==plan.widthPx||image.height!==plan.heightPx)throw new TypeError('Scene icon review source binding is invalid');
 const slideSize=size(input.slideSize),ocr=textState(input.textBoxes,image,slideSize);
 const objects=plan.objects.filter(o=>record(o)&&o.id===input.objectId),object=objects[0],text=ocr.entries.find(t=>t.id===input.textId);
 if(objects.length!==1||!record(object)||object.kind!=='icon'||!box(object.box)||typeof object.regionId!=='string'||!text||!text.text.trim())throw new TypeError('Scene icon review identity is invalid');
 const owners=plan.regions.filter(r=>record(r)&&r.id===object.regionId),owner=owners[0];
 if(owners.length!==1||!record(owner)||!box(owner.box)||!contains(owner.box,object.box))throw new TypeError('Scene icon review owner is invalid');
 if(!box(input.textStartBox)||!Object.values(input.textStartBox).every(Number.isSafeInteger)||!contains(text.box,input.textStartBox))throw new TypeError('Scene icon review body anchor is invalid');
 if(!box(input.observationWindow)||!Object.values(input.observationWindow).every(Number.isSafeInteger)
  ||input.observationWindow.w*input.observationWindow.h>262144||!contains({x:0,y:0,w:image.width,h:image.height},input.observationWindow)
  ||!contains(input.observationWindow,text.box)||!contains(input.observationWindow,sceneIconSearchWindow(image,object.box,undefined)))throw new TypeError('Scene icon review observation is incomplete');
 const token=Object.freeze({});controls.set(token,{sourceFile:input.sourceFile,sourceHash,pixelHash:hash(sourceRaster(image).rgba),width:image.width,height:image.height,planRevision,
  textRevision:ocr.revision,textBox:{...text.box},textStartBox:{...input.textStartBox},expectedComponents:0,objectId:input.objectId,regionId:object.regionId,seed:{...object.box},window:{...input.observationWindow},slideSize,
  transcript:text.text,expires:Date.now()+30*60*1000});return token;
}
/** Only the host handling an actual human selection calls this method with
 * the original in-memory control. It is deliberately not a JSON review parser.
 * A consumed, expired, copied or reconstructed control grants nothing.
 * @param {unknown} control @param {unknown} selection @returns {object} */
function confirmSceneIconSemanticReview(control,selection){
 const review=control!==null&&typeof control==='object'?controls.get(control):undefined;
 if(!review||Date.now()>review.expires||!record(selection)||Reflect.ownKeys(selection).length!==3
  ||selection.choice!=='independent-leading-icon'||typeof selection.textStartsWith!=='string'||!selection.textStartsWith.trim()
  ||selection.textStartsWith.length>32||!review.transcript.startsWith(selection.textStartsWith)||typeof selection.expectedComponents!=='number'
  ||!Number.isSafeInteger(selection.expectedComponents)||selection.expectedComponents<1||selection.expectedComponents>32)throw new TypeError('Scene icon human selection is invalid');
 controls.delete(/** @type {object} */(control));const token=Object.freeze({});confirmations.set(token,{review:{...review,expectedComponents:selection.expectedComponents}});return token;
}
/** Bind the human identity to this unchanged compilation and its ORIGINAL
 * shared scan allowance. A proof cannot migrate into another budget/session.
 * Source components and AA fringe are measured again; the OCR is untouched.
 * @param {unknown} token @param {{image:Image,sourceHash:string,plan:unknown,textBoxes:unknown,slideSize:SlideSize,budget:{used:number}}} input
 * @returns {object|null} */
function bindSceneIconSemanticReview(token,input){
 if(token===undefined)return null;
 const state=token!==null&&typeof token==='object'?confirmations.get(token):undefined;
 if(!state||!record(input)||!record(input.budget)||!Number.isSafeInteger(input.budget.used)||input.budget.used<0||input.budget.used>4000000)throw new TypeError('Scene icon human review capability is invalid');
 const {review}=state,image=sourceRaster(input.image),slideSize=size(input.slideSize);
 if(Date.now()>review.expires||input.sourceHash!==review.sourceHash||hash(sourceBytes(review.sourceFile))!==review.sourceHash||image.width!==review.width||image.height!==review.height
  ||hash(image.rgba)!==review.pixelHash||snapshot(input.plan)!==review.planRevision||snapshot(slideSize)!==snapshot(review.slideSize)
  ||textState(input.textBoxes,input.image,slideSize).revision!==review.textRevision||state.budget&&state.budget!==input.budget)throw new TypeError('Scene icon human review binding changed');
 if(state.receipt){const bound=receipts.get(state.receipt);if(!bound||input.budget.used<bound.minimumUsed)throw new TypeError('Scene icon review budget changed');return state.receipt;}
 state.budget=input.budget;
 const cells=measureLeadingSceneIconFootprint(input.image,review.seed,review.window,review.textBox,review.textStartBox,review.expectedComponents,input.budget);
 if(!cells)return null;
 const receipt=Object.freeze({});receipts.set(receipt,{review,pixels:image.rgba,plan:input.plan,textBoxes:input.textBoxes,budget:input.budget,minimumUsed:input.budget.used,cells});state.receipt=receipt;return receipt;
}
/** @param {unknown} token @param {string} id @param {string} regionId @param {unknown} seed */
function sceneIconSemanticObjectMatches(token,id,regionId,seed){
 if(!box(seed))return false;
 const state=token!==null&&typeof token==='object'?receipts.get(token):undefined,r=state?.review;
 return !!r&&r.objectId===id&&r.regionId===regionId&&['x','y','w','h'].every(k=>seed[/** @type {keyof Box} */(k)]===r.seed[/** @type {keyof Box} */(k)]);
}
/** The narrow query can only exclude measured icon cells from ONE original
 * OCR frame. All body text, unrelated OCR and unmeasured cells stay protected.
 * It never exports a mutable mask or confers residual erasure permissions.
 * @param {unknown} token @param {unknown} image @param {unknown} budget @param {unknown} textBox
 * @param {unknown} points @param {unknown} objectId @param {unknown} regionId @param {unknown} seed @returns {boolean} */
function sceneIconSemanticPointsSeparate(token,image,budget,textBox,points,objectId,regionId,seed){
 const state=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!state)return false;
 const r=state.review;
 if(!record(image)||!record(budget)||budget!==state.budget||!Number.isSafeInteger(budget.used)||Number(budget.used)<state.minimumUsed||Number(budget.used)>4000000
  ||objectId!==r.objectId||regionId!==r.regionId||Date.now()>r.expires||!box(textBox)||!box(seed)||!list(points)||!points.length||points.length>262144
  ||!sceneIconSemanticObjectMatches(token,/** @type {string} */(objectId),/** @type {string} */(regionId),seed))return false;
 const source=sourceRaster(image);
 if(source.width!==r.width||source.height!==r.height||source.rgba.buffer!==state.pixels.buffer||source.rgba.byteOffset!==state.pixels.byteOffset||hash(source.rgba)!==r.pixelHash||hash(sourceBytes(r.sourceFile))!==r.sourceHash
  ||snapshot(state.plan)!==r.planRevision||textState(state.textBoxes,/** @type {Image} */(image),r.slideSize).revision!==r.textRevision)return false;
 if(['x','y','w','h'].some(k=>Math.abs(Number(textBox[/** @type {keyof Box} */(k)])-Number(r.textBox[/** @type {keyof Box} */(k)]))>1e-8))return false;
 state.minimumUsed=Number(budget.used);
 return points.every(p=>record(p)&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)
  &&p.x>=0&&p.x<r.width&&p.y>=0&&p.y<r.height&&state.cells.has(p.y*r.width+p.x));
}
module.exports={captureSceneIconSemanticReview,confirmSceneIconSemanticReview,bindSceneIconSemanticReview,sceneIconSemanticPointsSeparate,sceneIconSemanticObjectMatches};
