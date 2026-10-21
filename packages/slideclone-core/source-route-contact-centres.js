// @ts-check
'use strict';
/** @typedef {{index:number,point:{x:number,y:number},side:string}} Contact */
/** Recognize one observed contact cross-section, rather than giving every
 * antialias fringe pixel its own physical port. Every returned centre is an
 * ORIGINAL privately checked contact. Blank gaps, different sides and opaque
 * equivalent spans >5 remain distinct hypotheses. No new point or attachment
 * allowance is created; final direction, whole-component and 2px private-port
 * checks still apply.
 * @template {Contact} T
 * @param {{sites:T[],mask:Uint8Array,rgba:Uint8Array,width:number,background:number[],work:{checks:number}}} input
 * @returns {Map<T,T>|null} */
function sourceRouteContactCentres({sites,mask,rgba,width,background,work}){
 const unique=[...new Set(sites)],result=new Map(unique.map(s=>[s,s]));
 /** @param {T} s */const along=s=>s.side==='left'||s.side==='right'?Math.floor(s.index/width):s.index%width;
 unique.sort((a,b)=>a.side.localeCompare(b.side)||along(a)-along(b));
 /** @type {T[][]} */const groups=[];
 for(const site of unique){
  const group=groups.at(-1),prior=group?.at(-1);
  if(prior&&prior.side===site.side&&connected(prior.index,site.index))group?.push(site);else groups.push([site]);
  if(work.checks>4000000)return null;
 }
 for(const group of groups){
  if(group.length<2)continue;
  const vertical=group[0]?.side==='left'||group[0]?.side==='right';
  let x=width,y=mask.length/width,right=0,bottom=0;
  for(const s of group){const xx=s.index%width,yy=Math.floor(s.index/width);x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
  let strongest=-1,reference=[0,0,0];
  for(let yy=y;yy<=bottom;yy++)for(let xx=x;xx<=right;xx++){
   if(++work.checks>4000000)return null;const n=yy*width+xx;if(!mask[n])continue;
   const delta=background.map((v,k)=>(rgba[n*4+k]??0)-v),norm=delta.reduce((sum,v)=>sum+v*v,0);
   if(norm>strongest){strongest=norm;reference=delta;}
  }
  if(strongest<=0)continue;
  let coverage=0,moment=0,complete=true;
  const first=vertical?y:x,last=vertical?bottom:right;
  for(let a=first;a<=last;a++){
   let weight=0;
   for(let c=vertical?x:y;c<=(vertical?right:bottom);c++){
    if(++work.checks>4000000)return null;const n=vertical?a*width+c:c*width+a;if(!mask[n])continue;
    const projection=background.reduce((sum,v,k)=>sum+((rgba[n*4+k]??0)-v)*(reference[k]??0),0)/strongest;
    weight=Math.max(weight,Math.max(0,Math.min(1,projection)));
   }
   if(!weight){complete=false;break;}coverage+=weight;moment+=a*weight;
  }
  if(!complete||coverage<1||coverage>5)continue;
  const centre=moment/coverage;
  const selected=[...group].sort((a,b)=>Math.abs(along(a)-centre)-Math.abs(along(b)-centre))[0];
  if(selected)for(const s of group)result.set(s,selected);
 }
 return result;
 /** Only original ink inside the two contacts' own bounding cell rectangle
  * can establish continuity; a remote loop cannot bridge an empty port gap.
  * @param {number} from @param {number} to */
 function connected(from,to){
  const x=Math.min(from%width,to%width),right=Math.max(from%width,to%width);
  const y=Math.min(Math.floor(from/width),Math.floor(to/width)),bottom=Math.max(Math.floor(from/width),Math.floor(to/width));
  const queue=[from],seen=new Set(queue);
  for(const n of queue){
   if(n===to)return true;
   const xx=n%width,yy=Math.floor(n/width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(++work.checks>4000000)return false;const px=xx+dx,py=yy+dy,k=py*width+px;
    if(px>=x&&px<=right&&py>=y&&py<=bottom&&mask[k]&&!seen.has(k)){seen.add(k);queue.push(k);}
   }
  }
  return false;
 }
}
module.exports={sourceRouteContactCentres};
