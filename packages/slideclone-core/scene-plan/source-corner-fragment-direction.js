// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** A compact slanted dash can have a small axis-aligned box even when its
 * source cells establish a diagonal. Direction alone grants no enclosure or
 * source paint: the caller still proves the full quarter-circle corridor,
 * both tangencies, bounded gaps, unique inventory and text ownership.
 * @param {unknown} input @returns {boolean} */
function sourceCornerFragmentDirection(input){
 const invalid=()=>{throw new TypeError('Scene corner direction controls are invalid');};
 if(!record(input)||Reflect.ownKeys(input).length!==5||!['points','sx','sy','thickness','work'].every(k=>Object.hasOwn(input,k))
  ||!list(input.points)||input.points.length>4096||!record(input.work)
  ||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000001
  ||typeof input.work.exhausted!=='boolean'||!['checks','exhausted'].every(k=>Object.getOwnPropertyDescriptor(input.work,k)?.writable===true)
  ||input.sx!==-1&&input.sx!==1||input.sy!==-1&&input.sy!==1
  ||typeof input.thickness!=='number'||!Number.isFinite(input.thickness)||input.thickness<=0||input.thickness>12)return invalid();
 const unique=new Set();
 for(const p of input.points){
  if(!record(p)||![p.x,p.y].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<16384))return invalid();
  const key=`${p.x},${p.y}`;if(unique.has(key))return invalid();unique.add(key);
 }
 const points=/** @type {{x:number,y:number}[]} */(input.points),n=points.length;
 const work=/** @type {{checks:number,exhausted:boolean}} */(input.work);
 if(work.exhausted||n<8)return false;
 const charge=()=>{if(work.exhausted)return false;if(++work.checks>4000000){work.exhausted=true;return false;}return true;};
 let mx=0,my=0;
 for(const p of points){if(!charge())return false;mx+=p.x;my+=p.y;}mx/=n;my/=n;
 let xx=0,yy=0,xy=0;
 for(const p of points){if(!charge())return false;const x=p.x-mx,y=p.y-my;xx+=x*x;yy+=y*y;xy+=x*y;}
 // The principal direction must turn toward the other rail, remain at least
 // 22.5 degrees from either axis and have four times the transverse variance.
 // The correlation bound is the corresponding 4:1 diagonal covariance bound.
 if(!xx||!yy||xy*input.sx*input.sy>=0||xy*xy<.36*xx*yy)return false;
 const spread=Math.hypot(xx-yy,2*xy),major=xx+yy+spread,minor=xx+yy-spread;
 if(major<=0||major<4*minor)return false;
 const angle=Math.atan2(2*xy,xx-yy)/2,dx=Math.cos(angle),dy=Math.sin(angle);
 if(Math.min(Math.abs(dx),Math.abs(dy))<Math.sin(Math.PI/8))return false;
 let low=Infinity,high=-Infinity;
 for(const p of points){if(!charge())return false;const projection=(p.x-mx)*dx+(p.y-my)*dy;low=Math.min(low,projection);high=Math.max(high,projection);}
 // Source pixels occupy unit cells, rather than just their centers. Retain
 // the existing 1.5px contour allowance along the actually measured direction.
 return high-low+Math.abs(dx)+Math.abs(dy)>input.thickness+1.5;
}
module.exports={sourceCornerFragmentDirection};
