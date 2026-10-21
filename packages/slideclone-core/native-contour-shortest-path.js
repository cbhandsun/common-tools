// @ts-check
"use strict";
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{start:Point,end:Point,corner?:Point}} Step */
/** Find the least-segment closed polyline in the same bounded 64-vertex
 * neighborhood as the existing greedy pass. Angular constraints prove that
 * every intervening source vertex remains within the unchanged fit error.
 * Geometry work shares the original simplifier's remaining 4M checks.
 * @param {Point[]} input @param {number} tolerance
 * @param {{checks:number,exhausted:boolean}} state @returns {Point[]|null} */
function shortestContourLoop(input,tolerance,state){
 return shortestPath(input,tolerance,state,false)?.map(step=>step.start)??null;
}
/** Small exact orthogonal source corners can use a cubic with both controls
 * at the source corner. Its symmetric Hausdorff bound is (L1+L2)/8, without
 * composing a second approximation onto an already simplified polyline.
 * @param {Point[]} input @param {number} tolerance
 * @param {{checks:number,exhausted:boolean}} state */
function shortestCurvedContourLoop(input,tolerance,state){
 const steps=shortestPath(input,tolerance,state,true);if(!steps?.length)return null;
 const first=steps[0];if(!first)return null;
 return [{type:"moveTo",points:[first.start]},...steps.flatMap((step,index)=>step.corner
  ?[{type:"cubicBezTo",points:[step.corner,step.corner,step.end]}]
  :index===steps.length-1?[]:[{type:"lnTo",points:[step.end]}]),{type:"close",points:[]}];
}
/** @param {Point[]} input @param {number} tolerance
 * @param {{checks:number,exhausted:boolean}} state @param {boolean} curved @returns {Step[]|null} */
function shortestPath(input,tolerance,state,curved){
 if(input.length<3||input.length>262144||state.exhausted||tolerance<=0)return null;
 // Removing a point on an unchanged straight source edge is exact.
 const loop=input.filter((p,i)=>{
  const a=input[(i+input.length-1)%input.length],b=input[(i+1)%input.length];
  return !!a&&!!b&&(p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);
 });
 const n=loop.length;if(n<3)return null;
 const anchors=new Set([0]);
 for(const axis of ["x","y"]){
  let low=0,high=0;
  for(let index=1;index<n;index++){
   if(++state.checks>4000000){state.exhausted=true;return null;}
   const p=loop[index],a=loop[low],b=loop[high];if(!p||!a||!b)return null;
   if((axis==="x"?p.x:p.y)<(axis==="x"?a.x:a.y))low=index;
   if((axis==="x"?p.x:p.y)>(axis==="x"?b.x:b.y))high=index;
  }
  anchors.add(low);anchors.add(high);
 }
 // A closed curve has no privileged raster seed. Search the remaining source
 // anchors while sharing the same 4M allowance; keep only complete proofs.
 for(let index=0;index<n;index++)anchors.add(index);
 /** @type {Step[]|null} */let best=null;
 // Anchor searches revisit the same directed source edges. Keep only their
 // arithmetic, never a visibility decision, accepted path or proof charge.
 // The table is local to this exact loop/tolerance and bounded to 262144
 // triples (6 MiB); larger loops use the original arithmetic directly.
 const metrics=n*64<=262144?new Float64Array(n*64*3):null;
 /** @param {Step[]} steps */const operations=steps=>steps.length+1+(steps[steps.length-1]?.corner?1:0);
 for(const anchor of anchors){
  const rotated=anchor?[...loop.slice(anchor),...loop.slice(0,anchor)]:loop;
  const candidate=fromAnchor(rotated,tolerance,state,curved,metrics,anchor);
  if(candidate&&(!best||operations(candidate)<operations(best)))best=candidate;
  if(state.exhausted)break;
 }
 return best;
}
/** @param {Point[]} loop @param {number} tolerance
 * @param {{checks:number,exhausted:boolean}} state @param {boolean} curved
 * @param {Float64Array|null} metrics @param {number} anchor @returns {Step[]|null} */
function fromAnchor(loop,tolerance,state,curved,metrics,anchor){
 const n=loop.length;
 const cost=new Int32Array(n+1);cost.fill(0x7fffffff);cost[0]=0;
 const previous=new Int32Array(n+1);previous.fill(-1);
 const curve=new Uint8Array(n+1);
 for(let from=0;from<n;from++){
  if((cost[from]??0x7fffffff)===0x7fffffff)continue;
  const a=loop[from];if(!a)return null;
  let minAngle=-Infinity,maxAngle=Infinity,firstAngle=0,maxDistance=0;
  for(let to=from+1;to<=Math.min(n,from+64);to++){
   if(++state.checks>4000000){state.exhausted=true;return null;}
   const b=loop[to%n];if(!b)return null;const dx=b.x-a.x,dy=b.y-a.y;
   const key=(((from+anchor)%n)*64+to-from-1)*3;
   let d=metrics?.[key]??0,angle=0,allowance=0;
   if(d===0){
    d=Math.hypot(dx,dy);
    if(d){angle=Math.atan2(dy,dx);if(d>tolerance)allowance=Math.asin(tolerance/d);}
    if(metrics){metrics[key]=d||-1;metrics[key+1]=angle;metrics[key+2]=allowance;}
   }else{if(d===-1)d=0;angle=metrics?.[key+1]??0;allowance=metrics?.[key+2]??0;}
   if(!d)continue;
   if(to===from+1)firstAngle=angle;
   while(angle-firstAngle>Math.PI)angle-=2*Math.PI;
   while(angle-firstAngle< -Math.PI)angle+=2*Math.PI;
   if(angle>=minAngle&&angle<=maxAngle&&(cost[from]??0)+1<(cost[to]??0)){
    // The angular cone proves distance to the infinite line. Check source
    // vertices that could project beyond the endpoint against the finite
    // segment instead of rejecting a legal subpixel endpoint overshoot.
    let finite=true;
    if(d<maxDistance)for(let at=from+1;at<to;at++){
     if(++state.checks>4000000){state.exhausted=true;return null;}
     const p=loop[at%n];if(!p)return null;
     if((p.x-a.x)*dx+(p.y-a.y)*dy>d*d&&Math.hypot(p.x-b.x,p.y-b.y)>tolerance){finite=false;break;}
    }
    if(finite){cost[to]=(cost[from]??0)+1;previous[to]=from;curve[to]=0;}
   }
   if(curved&&to===from+2&&(cost[from]??0)+1<(cost[to]??0)){
    const corner=loop[(from+1)%n];if(!corner)return null;
    const ux=a.x-corner.x,uy=a.y-corner.y,vx=b.x-corner.x,vy=b.y-corner.y;
    if(ux*vx+uy*vy===0&&Math.hypot(ux,uy)<=4*tolerance&&Math.hypot(vx,vy)<=4*tolerance){
     cost[to]=(cost[from]??0)+1;previous[to]=from;curve[to]=1;
    }
   }
   if(d>tolerance){minAngle=Math.max(minAngle,angle-allowance);maxAngle=Math.min(maxAngle,angle+allowance);}
   maxDistance=Math.max(maxDistance,d);if(minAngle>maxAngle)break;
  }
 }
 if((previous[n]??-1)<0)return null;
 /** @type {Step[]} */const result=[];
 for(let at=n;at>0;){
  const from=previous[at]??-1;if(from<0)return null;const start=loop[from],end=loop[at%n],corner=curve[at]?loop[(from+1)%n]:undefined;
  if(!start||!end)return null;result.push({start,end,...(corner?{corner}:{})});at=from;
 }
 result.reverse();return result.length>=3?result:null;
}
module.exports={shortestContourLoop,shortestCurvedContourLoop};
