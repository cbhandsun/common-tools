// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {[number,number]|null} Interval */
/** @param {unknown} value @param {number} maximum @returns {value is Point[]} */
function pathPoints(value,maximum){return list(value)&&value.length>=2&&value.length<=maximum
 &&value.every(p=>record(p)&&Object.keys(p).length===2
  &&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=16384));}
/** Exact free interval on a segment inside a point's original 1.5px disk.
 * The cross product avoids subtracting two large squared projections at
 * distant coordinates. No numerical slack is added to the source tolerance.
 * @param {Point} p @param {Point} a @param {Point} b @returns {Interval} */
function freeInterval(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,x=a.x-p.x,y=a.y-p.y,length=dx*dx+dy*dy;
 if(!length)return x*x+y*y<=2.25?[0,1]:null;
 const cross=x*dy-y*dx,remaining=2.25-cross*cross/length;
 if(remaining<0)return null;
 const centre=-(x*dx+y*dy)/length,radius=Math.sqrt(remaining/length);
 const low=Math.max(0,centre-radius),high=Math.min(1,centre+radius);
 return low<=high?[low,high]:null;
}
/** Continuous Frechet decision for an ordered source path and proposal.
 * Reachable free-space intervals preserve both endpoints, every segment and
 * traversal order. Source subdivision adds no artificial point alignment.
 * At most 511*15 cells; two interval calculations per cell are debited to the
 * caller's EXISTING 4M geometry ledger. Two rows keep at most 30 right-boundary
 * intervals, plus constant state for the current cell.
 * No source search, resampling, simplification or path repair occurs here.
 * @param {unknown} source @param {unknown} proposal @param {{checks:number}} work */
function orderedScenePathsMatch(source,proposal,work){
 if(!pathPoints(source,512)||!pathPoints(proposal,16)||!record(work)
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000001)
  throw new TypeError('Scene ordered path controls are invalid');
 if(work.checks>4000000)return false;
 const first=source[0],second=proposal[0];
 if(!first||!second)throw new TypeError('Scene ordered path controls are invalid');
 if(++work.checks>4000000||Math.hypot(first.x-second.x,first.y-second.y)>1.5)return false;
 /** @type {Interval[]} */let previousRight=[];
 /** @type {Interval} */let lastTop=null;
 for(let i=0;i<source.length-1;i++){
  /** @type {Interval[]} */const right=[];
  /** @type {Interval} */let bottom=null;
  for(let j=0;j<proposal.length-1;j++){
   const left=previousRight[j]??null,start=i===0&&j===0;
   const a=source[i],b=source[i+1],c=proposal[j],d=proposal[j+1];
   if(!a||!b||!c||!d)throw new TypeError('Scene ordered path controls are invalid');
   if(++work.checks>4000000)return false;const r=freeInterval(b,c,d);
   if(++work.checks>4000000)return false;const t=freeInterval(d,a,b);
   /** @type {number|undefined} */const lowRight=bottom||start?0:left?.[0];
   /** @type {number|undefined} */const lowTop=left||start?0:bottom?.[0];
   right.push(r&&lowRight!==undefined&&Math.max(r[0],lowRight)<=r[1]?[Math.max(r[0],lowRight),r[1]]:null);
   bottom=t&&lowTop!==undefined&&Math.max(t[0],lowTop)<=t[1]?[Math.max(t[0],lowTop),t[1]]:null;
  }
  previousRight=right;lastTop=bottom;
 }
 return previousRight.at(-1)?.[1]===1||lastTop?.[1]===1;
}
module.exports={pathPoints,orderedScenePathsMatch};
