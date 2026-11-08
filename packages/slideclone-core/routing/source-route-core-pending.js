// @ts-check
'use strict';
const LIMIT=4000000;
/** Index only the already eligible pending core cells. It grants no evidence
 * or ownership. All queries retain the caller's complete field validation.
 * @param {ReadonlySet<number>} pending @param {number} width @param {{checks:number}} work */
function createCorePendingIndex(pending,width,work){
 if(!Number.isSafeInteger(width)||width<1)throw new RangeError('Core pending width is invalid');
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>LIMIT)return null;
 /** @param {number} count */const charge=count=>{work.checks+=count;return work.checks<=LIMIT;};
 const columns=Math.ceil(width/8);
 /** @type {Map<number,number[]>} */const rows=new Map();
 /** @type {Map<number,number[]>} */const buckets=new Map();
 for(const n of pending){
  if(!charge(1))return null;
  if(!Number.isSafeInteger(n)||n<0)throw new RangeError('Core pending cell is invalid');
  const y=Math.floor(n/width),xs=rows.get(y)??[];xs.push(n%width);rows.set(y,xs);
  const key=y*columns+Math.floor(n%width/8),bucket=buckets.get(key)??[];bucket.push(n);buckets.set(key,bucket);
 }
 for(const xs of rows.values())xs.sort((a,b)=>{charge(1);return a-b;});
 for(const cells of buckets.values())cells.sort((a,b)=>{charge(1);return a-b;});
 if(work.checks>LIMIT)return null;
 /** @param {number[]} xs @param {number} limit */
 function upperBound(xs,limit){let first=0,last=xs.length;while(first<last){
  if(!charge(1))return 0;const middle=Math.floor((first+last)/2);
  if((xs[middle]??Infinity)<=limit)first=middle+1;else last=middle;
 }return first;}
 /** Prefer the orientation with more measured cores inside the eight-cell
  * context margin. Ties preserve both orientations; no source fit is assumed.
  * @param {number} cx @param {number} cy @returns {number[][]} */
 function rectanglesAt(cx,cy){
  let horizontal=0,vertical=0;
  for(let y=cy-16;y<=cy+16;y++){
   if(!charge(1))return [];
   const xs=rows.get(y);if(!xs)continue;
   if(Math.abs(y-cy)<=4)horizontal+=upperBound(xs,cx+16)-upperBound(xs,cx-17);
   vertical+=upperBound(xs,cx+4)-upperBound(xs,cx-5);
  }
  return horizontal===vertical?(horizontal?[[24,12],[12,24]]:[]):horizontal>vertical?[[24,12]]:[[12,24]];
 }
 /** @param {number} left @param {number} top @param {number} right @param {number} bottom */
 function* within(left,top,right,bottom){
  left=Math.max(0,left);right=Math.min(width-1,right);
  for(let y=top;y<=bottom;y++)for(let tile=Math.floor(left/8);tile<=Math.floor(right/8);tile++){
   if(!charge(1))return;
   for(const n of buckets.get(y*columns+tile)??[]){
    if(!charge(1))return;const x=n%width;if(x>=left&&x<=right)yield n;
   }
  }
 }
 return {rectanglesAt,within};
}
module.exports={createCorePendingIndex};
