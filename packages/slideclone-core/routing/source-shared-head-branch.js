// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
/** The shared prefix from one measured terminal to ALL other terminals ends
 * at its first source branch. An arbitrary other endpoint can place a width
 * sample on a different arm or on a junction. This observes existing cells
 * only; full head, tree, crossing and ink-coverage checks still run afterward.
 * @param {unknown} input @returns {{x:number,y:number}[]|null} */
function sourceSharedHeadBranch(input){
 if(!record(input)||![input.width,input.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(input.width)*Number(input.height)>262144||types.isProxy(input.mask)||!types.isUint8Array(input.mask)
  ||!list(input.terminals)||input.terminals.length<3||input.terminals.length>32
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000000)
  throw new TypeError('Shared head branch input is invalid');
 const width=Number(input.width),height=Number(input.height),area=width*height,work=input.work;
 const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,'buffer',input.mask);
 if(!types.isArrayBuffer(buffer)||Reflect.get(prototype,'length',input.mask)!==area)throw new TypeError('Shared head branch mask is invalid');
 const mask=new Uint8Array(buffer,Reflect.get(prototype,'byteOffset',input.mask),area);
 const terminals=input.terminals;
 if(terminals.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>=area||!mask[n])
  ||new Set(terminals).size!==terminals.length||typeof input.start!=='number'||!terminals.includes(input.start))
  throw new TypeError('Shared head branch terminals are invalid');
 const start=input.start,others=/** @type {number[]} */(terminals.filter(n=>n!==start)),pending=new Set(others);
 work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
 const previous=new Map(),queue=[start],counts=new Map();
 previous.set(start,start);
 let head=0;
 while(head<queue.length&&pending.size){
  const at=queue[head++]??0;pending.delete(at);const x=at%width,y=Math.floor(at/width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
   const xx=x+dx,yy=y+dy,n=yy*width+xx;
   if((dx||dy)&&xx>=0&&yy>=0&&xx<width&&yy<height&&mask[n]&&!previous.has(n)){previous.set(n,at);queue.push(n);}
  }
 }
 if(pending.size)return null;
 for(const terminal of others){
  for(let at=terminal;;at=previous.get(at)??-1){
   work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000||at<0)return null;
   counts.set(at,(counts.get(at)??0)+1);if(at===start)break;
  }
 }
 const branch=[];let at=Math.min(...others);
 for(;;at=previous.get(at)??-1){
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000||at<0)return null;
  if(counts.get(at)===others.length)branch.push({x:at%width,y:Math.floor(at/width)});
  if(at===start)break;
 }
 return branch.length>=2&&branch.length<=512?branch.reverse():null;
}
module.exports={sourceSharedHeadBranch};
