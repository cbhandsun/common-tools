// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {thinSourceRoute}=require('./source-route-centerline');
/** Map already verified contact spans to existing skeleton endpoints. This
 * module grants topology correspondence only, never port/paint authority.
 * Fixed arrow/gap tips keep their original cells. A physical non-head contact
 * must contain exactly one natural leaf; no pixels or branches are removed.
 * @param {unknown} input @returns {number[]|null} */
function sourceSharedContactTerminals(input){
 if(!record(input)||![input.width,input.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=3&&n<=16384)
  ||Number(input.width)*Number(input.height)>262144||types.isProxy(input.skeleton)||!types.isUint8Array(input.skeleton)
  ||!list(input.contacts)||input.contacts.length<3||input.contacts.length>32
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000000)
  throw new TypeError('Shared contact topology input is invalid');
 const width=Number(input.width),height=Number(input.height),area=width*height,work=/** @type {{checks:number}} */(input.work);
 const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,'buffer',input.skeleton);
 if(!types.isArrayBuffer(buffer)||Reflect.get(prototype,'length',input.skeleton)!==area)throw new TypeError('Shared contact topology mask is invalid');
 const skeleton=new Uint8Array(buffer,Reflect.get(prototype,'byteOffset',input.skeleton),area);
 /** @type {{index:number,alternatives:number[],fixed:boolean}[]} */const contacts=[];
 for(const row of input.contacts){
  if(!record(row)||typeof row.index!=='number'||!Number.isSafeInteger(row.index)||row.index<0||row.index>=area
   ||typeof row.fixed!=='boolean'||!list(row.alternatives)||!row.alternatives.length||row.alternatives.length>area
   ||row.alternatives.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>=area))
   throw new TypeError('Shared contact topology span is invalid');
  contacts.push({index:row.index,alternatives:/** @type {number[]} */(row.alternatives),fixed:row.fixed});
 }
 const selected=[],claimed=new Set();
 for(const contact of contacts){
  let found=-1,containsRepresentative=false;
  for(const at of contact.alternatives){
   work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
   if(claimed.has(at))return null;claimed.add(at);containsRepresentative ||=at===contact.index;
   if(contact.fixed||!skeleton[at])continue;
   if(contactDegree(skeleton,at,width,height,work)===1){if(found>=0)return null;found=at;}
   if(Number(work.checks)>4000000)return null;
  }
  if(!containsRepresentative)return null;
  if(contact.fixed)found=skeleton[contact.index]?contact.index:-1;
  if(found<0)return null;selected.push(found);
 }
 return new Set(selected).size===selected.length?selected:null;
}
/** The first pass nominates physical tips without assuming entity-wide arrow
 * state. After source head profiles are proven, rethin the unchanged complete
 * ink with only those heads/gaps fixed. Plain shaft contacts then bind their
 * natural leaf instead of a forced off-centre representative. All work uses
 * the original geometry ledger; no source cell is erased.
 * @param {{component:Uint8Array,width:number,height:number,
 * contacts:{index:number,alternatives:number[],fixed:boolean}[],work:{checks:number}}} input */
function refineSharedContactTerminals({component,width,height,contacts,work}){
 const protectedCells=new Uint8Array(component.length);
 for(const contact of contacts)if(contact.fixed)protectedCells[contact.index]=1;
 let skeleton=thinSourceRoute(component,width,height,work,protectedCells);if(!skeleton)return null;
 const refined=contacts.map(contact=>{
  if(contact.fixed)return contact;
  const natural=contact.alternatives.some(at=>skeleton?.[at]&&contactDegree(skeleton,at,width,height,work)===1);
  // Thinning may retract a flat cap beyond the original 2px port envelope.
  // Keep its original privately verified representative as a topology
  // candidate; never project the retracted leaf into an unverified port.
  return natural?contact:{...contact,fixed:true};
 });
 if(work.checks>4000000)return null;
 if(refined.some((contact,i)=>contact.fixed!==contacts[i]?.fixed)){
  for(const contact of refined)if(contact.fixed)protectedCells[contact.index]=1;
  skeleton=thinSourceRoute(component,width,height,work,protectedCells);if(!skeleton)return null;
 }
 return sourceSharedContactTerminals({skeleton,width,height,contacts:refined,work});
}
/** @param {Uint8Array} skeleton @param {number} at @param {number} width @param {number} height @param {{checks:number}} work */
function contactDegree(skeleton,at,width,height,work){
 const x=at%width,y=Math.floor(at/width);let degree=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(++work.checks>4000000)return -1;
  if(!dx&&!dy||x+dx<0||y+dy<0||x+dx>=width||y+dy>=height)continue;
  if(dx&&dy&&(skeleton[at+dx]||skeleton[at+dy*width]))continue;
  if(skeleton[at+dy*width+dx])degree++;
 }
 return degree;
}
module.exports={sourceSharedContactTerminals,refineSharedContactTerminals};
