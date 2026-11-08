// @ts-check
'use strict';
const {measuredSharedSceneRouteResidualPaintGroups}=require('../routing/source-shared-route-compiler');
const {record}=require('./source-scene-group-containment');
const {chargeSharedOutput,sharedOutputList,sharedOutputRecord}=require('../routing/source-shared-route-output-snapshot');
const {createHash}=require('node:crypto');
const {sourceRaster}=require('../typography/residual-text-mask');
const {recordSharedResidualChecks}=require('./approved-backdrop-budget');
/** @typedef {{x:number,y:number,w:number,h:number,sourceRouteInk?:true}} Mask */
/** @type {WeakMap<object,{box:Mask,digest:string,width:number,height:number,rows:{cell:number,color:number[]}[]}>} */const backdrops=new WeakMap();
/** Use privately measured shared ink instead of padded member corridors.
 * Full real output membership and the complete erasure roster are separate
 * requirements; a public box, partial member list or serialized copy grants
 * no new source cells. Independently witnessed fringe gets a private backdrop
 * receipt, never a padded transparent hole or a serialized paint instruction.
 * @param {import('../png').PngImage} image @param {unknown} shapes
 * @param {unknown} objects @param {unknown} size
 * @returns {{masks:Mask[],members:Set<object>}} */
function sourceSharedResidualErasurePlan(image,shapes,objects,size){
 if(shapes===undefined)return {masks:[],members:new Set()};
 const work={checks:0};
 try{
 if(!sharedOutputList(objects,work)||objects.length>30000||!objects.every(row=>sharedOutputRecord(row,work))||!record(size)
  ||typeof size.w!=='number'||typeof size.h!=='number'||![size.w,size.h].every(value=>Number.isFinite(value)&&value>0))
  throw new TypeError('Shared residual union controls are invalid');
 const proofs=measuredSharedSceneRouteResidualPaintGroups(image,shapes,work);
 if(work.checks>4000000)throw new RangeError('Shared residual union proof budget exceeded');
 const erased=new Set(objects),seen=new Set(),members=new Set();
 /** @type {Mask[]} */const masks=[];
 /** @type {{cell:number,color:number[]}[]} */const backgrounds=[];
 for(const proof of proofs){
  if(!proof.members||!proof.slideSize||proof.slideSize.widthPt!==size.w||proof.slideSize.heightPt!==size.h)
   throw new TypeError('Shared residual union frame is invalid');
  work.checks+=proof.members.length;
  if(work.checks>4000000)throw new RangeError('Shared residual union proof budget exceeded');
  if(!proof.members.every(member=>erased.has(member)))continue;
  // Reserve the union traversal before insertion. Sorting is charged below
  // for actual comparisons, not 32 hypothetical comparisons for every cell.
  work.checks+=proof.cells.size;
  if(work.checks>4000000)throw new RangeError('Shared residual union proof budget exceeded');
  for(const cell of proof.cells)seen.add(cell);
  for(const member of proof.members)members.add(member);
  if(proof.backgrounds)backgrounds.push(...proof.backgrounds);
 }
 if(!chargeSharedOutput(work,seen.size))throw new RangeError('Shared residual union proof budget exceeded');
 const ordered=[...seen];
 ordered.sort((a,b)=>{
  if(!chargeSharedOutput(work,1))throw new RangeError('Shared residual union proof budget exceeded');
  return a-b;
 });
 for(const cell of ordered){
  if(++work.checks>4000000)throw new RangeError('Shared residual union proof budget exceeded');
  const x=cell%image.width,y=Math.floor(cell/image.width),last=masks.at(-1);
  if(last&&last.y===y&&last.x+last.w===x)last.w++;
  else{if(masks.length>=30000)throw new RangeError('Shared residual union mask count exceeded');masks.push({x,y,w:1,h:1});}
 }
 if(backgrounds.length){
  work.checks+=backgrounds.length*4;if(work.checks>4000000)throw new RangeError('Shared residual union proof budget exceeded');
  let x=image.width,y=image.height,right=0,bottom=0;
  for(const row of backgrounds){const px=row.cell%image.width,py=Math.floor(row.cell/image.width);x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px+1);bottom=Math.max(bottom,py+1);}
  const mask={x,y,w:right-x,h:bottom-y,sourceRouteInk:/** @type {true} */(true)};
  backdrops.set(mask,{box:{...mask},digest:createHash('sha256').update(sourceRaster(image).rgba).digest('hex'),width:image.width,height:image.height,
   rows:backgrounds.map(row=>({cell:row.cell,color:row.color.slice()}))});masks.push(mask);
 }
 return {masks,members};
 }finally{recordSharedResidualChecks(work.checks);}
}
/** Resolve only live private receipts after rechecking the source and geometry.
 * Both the eraser and the independent ownership audit use this reader. Public
 * fields, cloned masks and caller supplied color arrays cannot grant paint.
 * @param {unknown} image @param {unknown} masks */
function sharedResidualBackdropPlans(image,masks){
 const work={checks:0};
 if(!sharedOutputList(masks,work)||masks.length>30000)throw new TypeError('Shared route backdrop masks are invalid');
 /** @type {{cell:number,color:number[]}[]} */const rows=[];
 let source=null,digest=null;
 for(const mask of masks){
  if(!sharedOutputRecord(mask,work))throw new TypeError('Shared route backdrop mask is invalid');
  if(mask.sourceRouteInk===undefined)continue;
  const proof=backdrops.get(mask);
  if(!proof||Reflect.ownKeys(mask).length!==5||['x','y','w','h','sourceRouteInk'].some(key=>mask[key]!==proof.box[/** @type {keyof Mask} */(key)]))throw new TypeError('Shared route backdrop proof is invalid');
  if(!source){source=sourceRaster(image);digest=createHash('sha256').update(source.rgba).digest('hex');}
  if(source.width!==proof.width||source.height!==proof.height||digest!==proof.digest)throw new TypeError('Shared route backdrop source proof is invalid');
  work.checks+=proof.rows.length;if(work.checks>4000000)throw new RangeError('Shared route backdrop proof budget exceeded');
  for(const row of proof.rows)rows.push({cell:row.cell,color:row.color.slice()});
 }
 return rows;
}
/** Compatibility reader for callers that only need the exact union runs.
 * @param {import('../png').PngImage} image @param {unknown} shapes
 * @param {unknown} objects @param {unknown} size */
function sourceSharedResidualUnionMasks(image,shapes,objects,size){
 return sourceSharedResidualErasurePlan(image,shapes,objects,size).masks;
}
module.exports={sourceSharedResidualUnionMasks,sourceSharedResidualErasurePlan,sharedResidualBackdropPlans};
