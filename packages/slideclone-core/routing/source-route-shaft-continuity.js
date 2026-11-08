// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,sharedOutputList,sharedOutputRecord,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const typedLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length')?.get;
/** Detached geometric reader for a caller's live, complete measured shaft.
 * Only actual interior path cells within their OWN width/2+.75 can witness
 * continuity. Both four-step source arms must extend at least three pixels
 * and point into opposite half-planes. Heads, caps and 2% halo allowances are
 * excluded. This reader never grants foreground, background or erase rights.
 * @param {unknown} input @returns {((cell:unknown)=>boolean)|null} */
function createMeasuredShaftContinuity(input){
 if(!record(input)||!sharedOutputWork(input.work))throw new TypeError('Measured shaft continuity controls are invalid');
 const work=input.work,shaft=input.shaft,width=input.width,height=input.height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||typeof width!=='number'||typeof height!=='number'
  ||width<1||height<1||width*height>262144||!types.isUint8Array(shaft)||!typedLength||typedLength.call(shaft)!==width*height)
  throw new TypeError('Measured shaft continuity frame is invalid');
 if(!sharedOutputList(input.edges,work)){
  if(work.checks>4000000)return null;throw new TypeError('Measured shaft continuity edges are invalid');
 }
 if(input.edges.length>1024)throw new TypeError('Measured shaft continuity edges are invalid');
 /** @type {Map<string,{x:number,y:number,radiusSquared:number}[]>} */const buckets=new Map();
 const span=8;
 /** @param {number} x @param {number} y */const key=(x,y)=>x+','+y;
 for(const edge of input.edges){
  if(!sharedOutputRecord(edge,work)||typeof edge.widthPx!=='number'||!Number.isFinite(edge.widthPx)||edge.widthPx<=0||edge.widthPx>5
   ||!sharedOutputList(edge.cells,work)){
   if(work.checks>4000000)return null;throw new TypeError('Measured shaft continuity edge is invalid');
  }
  if(edge.cells.length>262144)throw new TypeError('Measured shaft continuity path is invalid');
  /** @type {number[]} */const cells=[];
  const seen=new Set();
  for(const cell of edge.cells){
   if(!chargeSharedOutput(work,4))return null;
   if(typeof cell!=='number'||!Number.isSafeInteger(cell)||cell<0||cell>=width*height||!shaft[cell]||seen.has(cell))
    throw new TypeError('Measured shaft continuity path is invalid');
   const previous=cells.at(-1);
   if(previous!==undefined&&(Math.abs(cell%width-previous%width)>1||Math.abs(Math.floor(cell/width)-Math.floor(previous/width))>1))
    throw new TypeError('Measured shaft continuity path is invalid');
   seen.add(cell);cells.push(cell);
  }
  for(let i=4;i+4<cells.length;i++){
   if(!chargeSharedOutput(work,16))return null;
   const cell=cells[i],before=cells[i-4],after=cells[i+4];if(cell===undefined||before===undefined||after===undefined)continue;
   const x=cell%width,y=Math.floor(cell/width),ax=before%width-x,ay=Math.floor(before/width)-y,bx=after%width-x,by=Math.floor(after/width)-y;
   if(ax*ax+ay*ay<9||bx*bx+by*by<9||ax*bx+ay*by>0)continue;
   const bucket=key(Math.floor(x/span),Math.floor(y/span)),rows=buckets.get(bucket)??[];
   rows.push({x,y,radiusSquared:(edge.widthPx/2+.75)**2});buckets.set(bucket,rows);
  }
 }
 /** No typed-array metadata or path supplied by a serialized IR is read here.
  * Source identity and complete output/erase membership remain the issuer's
  * responsibility; the real issuer closes this reader over its private mask. */
 return cell=>{
  if(!chargeSharedOutput(work,1))return false;
  if(typeof cell!=='number'||!Number.isSafeInteger(cell)||cell<0||cell>=width*height||!shaft[cell])return false;
  const x=cell%width,y=Math.floor(cell/width),cx=Math.floor(x/span),cy=Math.floor(y/span);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!chargeSharedOutput(work,1))return false;
   for(const point of buckets.get(key(cx+dx,cy+dy))??[]){
    if(!chargeSharedOutput(work,4))return false;
    if((x-point.x)**2+(y-point.y)**2<=point.radiusSquared)return true;
   }
  }
  return false;
 };
}
module.exports={createMeasuredShaftContinuity};
