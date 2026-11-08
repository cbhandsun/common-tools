// @ts-check
'use strict';
const {sourceObliqueDashFootprint}=require('./source-oblique-dash-footprint');
const {sourceArrowCoveragePaint}=require('./source-arrow-coverage-paint');
/** Complete dash centroids nominate a common line; they never grant paint.
 * Geometry is certified separately for every original foreground/background
 * cell, with the same .75px bound and one common 1..25px width.
 * @param {import('./source-visible-diagonal-dash-profile').DashInput} input
 * @param {{slope:number,intercept:number}} [axis] */
function sourceObliqueDashProfile({components,width,rgba,horizontal,increasing,sign,background,work},axis){
 if(components.length<2||components.length>128)return null;
 const parts=components.filter(c=>c.bounded&&c.cells.length>=16&&c.cells.length<=32768).map(component=>{
  work.checks+=component.cells.length;if(work.checks>4000000)return null;
  let a=0,c=0;for(const n of component.cells){a+=horizontal?n%width:Math.floor(n/width);c+=horizontal?Math.floor(n/width):n%width;}
  return {component,a:a/component.cells.length,c:c/component.cells.length};
 }).filter(p=>p!==null);
 /** @type {Map<string,typeof parts>} */const groups=new Map();
 if(axis)groups.set('independent-axis',parts);
 for(let i=0;!axis&&i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  const a=parts[i],b=parts[j];if(!a||!b)continue;
  const slope=(b.c-a.c)/(b.a-a.a),scale=Math.hypot(1,slope),intercept=a.c-slope*a.a;
  if(!Number.isFinite(slope)||Math.abs(slope)<.05||Math.abs(slope)>1||slope*sign<=0)continue;
  const group=parts.filter(p=>{if(++work.checks>4000000)return false;return Math.abs(p.c-slope*p.a-intercept)/scale<=.75;});
  if(work.checks>4000000)return null;
  if(group.length>=2&&group.length<=16)groups.set(group.map(p=>parts.indexOf(p)).join(','),group);
 }
 const fitted=[];
 for(const group of groups.values()){
  const meanA=group.reduce((s,p)=>s+p.a,0)/group.length,meanC=group.reduce((s,p)=>s+p.c,0)/group.length;
  let aa=0,ac=0,cc=0;for(const p of group){aa+=(p.a-meanA)**2;ac+=(p.a-meanA)*(p.c-meanC);cc+=(p.c-meanC)**2;}
  const eigen=(aa+cc+Math.hypot(aa-cc,2*ac))/2,slope=axis?.slope??ac/(eigen-cc),scale=Math.hypot(1,slope),intercept=axis?.intercept??meanC-slope*meanA;
  if(!Number.isFinite(slope)||Math.abs(slope)>1||slope*sign<=0)continue;
  const runs=group.map(p=>sourceObliqueDashFootprint({cells:p.component.cells,width,horizontal,slope,intercept,work}));
  if(work.checks>4000000)return null;
  if(runs.some(r=>!r))continue;
  const complete=runs.filter(r=>r!==null).sort((a,b)=>a.lo-b.lo),first=complete[0],last=complete.at(-1);if(!first||!last||last.hi-first.lo>512)continue;
  const lower=Math.max(...complete.map(r=>r.lower)),upper=Math.min(...complete.map(r=>r.upper));if(lower>upper)continue;
  const widthPx=Math.max(lower,Math.min(upper,complete.reduce((s,r)=>s+r.areaWidth,0)/complete.length));
  const cells=group.flatMap(p=>p.component.cells),selected=new Set(cells);let foreign=false;
  for(const component of components)if(!group.some(p=>p.component===component))for(const n of component.cells){
   if(++work.checks>4000000)return null;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   if(Math.abs(c-slope*a-intercept)/scale<=widthPx/2+.75){foreign=true;break;}
  }
  if(foreign)continue;
  const paints=group.map(p=>{
   /** @type {Map<number,number[]>} */const columns=new Map();
   for(const n of p.component.cells){const a=horizontal?n%width:Math.floor(n/width),v=columns.get(a)??[];v.push(n);columns.set(a,v);}
   const colors=[...columns.entries()].sort((a,b)=>a[0]-b[0]).map(([,ns])=>ns.sort((a,b)=>horizontal?Math.floor(a/width)-Math.floor(b/width):a%width-b%width)
    .map(n=>[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]));
   return sourceArrowCoveragePaint({columns:colors,background,firstBody:Math.floor(colors.length*.3),lastBody:Math.ceil(colors.length*.7)-1,work,colorMode:'contrast'});
  });
  if(work.checks>4000000)return null;
  const rgb=paints[0];if(!rgb||paints.some(p=>!p||p.some((v,c)=>Math.abs(v-(rgb[c]??0))>18)))continue;
  const color='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
  const ordered=increasing?complete:[...complete].reverse(),pattern=[];let invalid=false;
  for(let i=0;i<ordered.length;i++){
   const run=ordered[i],next=ordered[i+1];if(!run){invalid=true;break;}
   const gap=next?(increasing?next.lo-run.hi:run.lo-next.hi):1;if(gap<1){invalid=true;break;}
   pattern.push([(run.hi-run.lo)/widthPx,gap/widthPx]);
  }
  if(invalid||selected.size!==cells.length)continue;
  fitted.push({lo:first.lo/scale,hi:last.hi/scale,slope,intercept,widthPx,color,rgb,support:1,cells,strokeDashPattern:JSON.stringify(pattern)});
 }
 return fitted.length===1?fitted[0]:null;
}
module.exports={sourceObliqueDashProfile};
