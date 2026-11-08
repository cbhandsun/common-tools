// @ts-check
'use strict';
const {detectSceneVisualCandidates}=require('./source-scene-visual-candidates');
const {selectSceneCandidates}=require('./source-scene-candidate-selection');
const {record,list,box}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {import('./source-scene-visual-candidates').Candidate&{sourceAuthorized:false}} ResidualCandidate */
/** @typedef {[number,[number,number,number,number]]} ResidualLocator */
/** Fixed pre-registered bounds: at most 1 feedback round, min 36px ink area. */
const MAX_RESIDUAL_ROUNDS=1,MIN_RESIDUAL_AREA_PX=36,OWNED_OVERLAP_RATIO=0.5;
/** @param {Box} a @param {Box} b */
const overlapArea=(a,b)=>{
 const x0=Math.max(a.x,b.x),y0=Math.max(a.y,b.y),x1=Math.min(a.x+a.w,b.x+b.w),y1=Math.min(a.y+a.h,b.y+b.h);
 return x1>x0&&y1>y0?(x1-x0)*(y1-y0):0;
};
/** @param {Box} b @param {number} width @param {number} height */
const roundOutward=(b,width,height)=>{
 const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y)),r=Math.min(width,Math.ceil(b.x+b.w)),bottom=Math.min(height,Math.ceil(b.y+b.h));
 return {x,y,w:r-x,h:bottom-y};
};
/** Bounded 1-round compile/residual candidate extraction (L5). Identifies
 * salient foreground components not yet covered by compiled native objects or
 * admitted OCR boxes, returning untrusted proposals for at most one local
 * review round. Never grants source ownership or bypasses compiler gates.
 * @param {{image:{width:number,height:number,rgba:Uint8Array},sourceHash:string,ownedBoxes:unknown,textBoxes:unknown,round?:number,budget?:number}} input */
function extractSceneResidualCandidates({image,sourceHash,ownedBoxes,textBoxes,round=0,budget=16}){
 if(!record(image)||typeof image.width!=='number'||typeof image.height!=='number'||!(image.rgba instanceof Uint8Array))
  throw new TypeError('Scene residual image is invalid');
 if(typeof sourceHash!=='string'||!/^[0-9a-f]{64}$/u.test(sourceHash))throw new TypeError('Scene residual sourceHash is invalid');
 if(!list(ownedBoxes)||ownedBoxes.length>512||ownedBoxes.some(b=>!box(b)))throw new TypeError('Scene residual ownedBoxes are invalid');
 if(!list(textBoxes)||textBoxes.length>512||textBoxes.some(b=>!box(b)))throw new TypeError('Scene residual textBoxes are invalid');
 if(!Number.isSafeInteger(round)||round<0||round>MAX_RESIDUAL_ROUNDS+1)throw new RangeError('Scene residual round is invalid');
 if(!Number.isSafeInteger(budget)||budget<1||budget>32)throw new RangeError('Scene residual budget is invalid');
 if(round>=MAX_RESIDUAL_ROUNDS)return {candidates:/** @type {ResidualCandidate[]} */([]),locations:/** @type {ResidualLocator[]} */([]),
  evidence:{method:'residual-candidates-v1',round,maxRounds:MAX_RESIDUAL_ROUNDS,stopped:'round-limit',budget,sourceAuthorized:false}};
 const {width,height}=image;
 if(width*height>4000000)return {candidates:/** @type {ResidualCandidate[]} */([]),locations:/** @type {ResidualLocator[]} */([]),
  evidence:{method:'residual-candidates-v1',round,maxRounds:MAX_RESIDUAL_ROUNDS,omitted:'raster-capacity',budget,sourceAuthorized:false}};
 const owned=/** @type {Box[]} */(ownedBoxes).map(b=>roundOutward(b,width,height)).filter(b=>b.w>0&&b.h>0);
 const text=/** @type {Box[]} */(textBoxes).map(b=>roundOutward(b,width,height)).filter(b=>b.w>0&&b.h>0);
 let catalog;
 try{catalog=detectSceneVisualCandidates({image,sourceHash});}
 catch(error){
  if(error instanceof RangeError)return {candidates:/** @type {ResidualCandidate[]} */([]),locations:/** @type {ResidualLocator[]} */([]),
   evidence:{method:'residual-candidates-v1',round,maxRounds:MAX_RESIDUAL_ROUNDS,omitted:'detector-capacity',budget,sourceAuthorized:false}};
  throw error;
 }
 const unowned=catalog.candidates.filter(c=>{
  if(c.inkPixels<MIN_RESIDUAL_AREA_PX)return false;
  const area=c.box.w*c.box.h;
  if(owned.some(o=>overlapArea(c.box,o)/area>=OWNED_OVERLAP_RATIO))return false;
  if(text.some(t=>overlapArea(c.box,t)/area>=OWNED_OVERLAP_RATIO))return false;
  return true;
 });
 const selected=unowned.length?selectSceneCandidates({...catalog,candidates:unowned},{budget:Math.min(budget,unowned.length),textBoxes:text}).catalog.candidates:[];
 /** @type {ResidualLocator[]} */
 const locations=selected.map((c,index)=>[index,[Math.floor(c.box.y*1000/height),Math.floor(c.box.x*1000/width),
  Math.min(1000,Math.ceil((c.box.y+c.box.h)*1000/height)),Math.min(1000,Math.ceil((c.box.x+c.box.w)*1000/width))]]);
 return {candidates:selected.map(c=>({...c,sourceAuthorized:false})),locations,
  evidence:{method:'residual-candidates-v1',round,nextRound:round+1,maxRounds:MAX_RESIDUAL_ROUNDS,budget,
   totalDetected:catalog.candidates.length,unownedCount:unowned.length,offered:selected.length,sourceAuthorized:false}};
}
module.exports={extractSceneResidualCandidates,RESIDUAL_CANDIDATE_CONSTANTS:Object.freeze({MAX_RESIDUAL_ROUNDS,MIN_RESIDUAL_AREA_PX,OWNED_OVERLAP_RATIO})};
