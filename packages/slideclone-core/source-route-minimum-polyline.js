// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** Find the fewest source vertices under the SAME finite-segment .75px
 * tolerance as simplifySourceRoute. No source sample is dropped from the
 * validation, no control point is invented and the existing work cap applies.
 * Used only when the greedy polyline exceeds the native-member capacity.
 * @param {unknown} input @returns {{x:number,y:number}[]|null} */
function minimumSourceRoutePolyline(input){
 if(!record(input)||!list(input.points)||input.points.length<2||input.points.length>512
  ||!input.points.every(p=>record(p)&&[p.x,p.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000))
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000000)
  throw new TypeError('Minimum source polyline controls are invalid');
 const points=/** @type {{x:number,y:number}[]} */(input.points),work=input.work;
 work.checks=Number(work.checks)+points.length*2;if(Number(work.checks)>4000000)return null;
 const count=new Uint16Array(points.length).fill(65535),previous=new Int32Array(points.length).fill(-1);count[0]=1;
 for(let hi=1;hi<points.length;hi++)for(let lo=0;lo<hi;lo++){
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
  if((count[lo]??65535)+1>=(count[hi]??65535))continue;
  const a=points[lo],b=points[hi];if(!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let valid=true;
  for(let i=lo+1;i<hi;i++){
   work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
   const p=points[i];if(!p)return null;
   const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
   if((p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2>.75*.75){valid=false;break;}
  }
  if(valid){count[hi]=(count[lo]??65535)+1;previous[hi]=lo;}
 }
 if((count[points.length-1]??65535)>16)return null;
 const result=[];
 for(let at=points.length-1;at>=0;at=previous[at]??-1){
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return null;
  const p=points[at];if(!p)return null;result.push({...p});if(at===0)return result.reverse();
 }
 return null;
}
module.exports={minimumSourceRoutePolyline};
