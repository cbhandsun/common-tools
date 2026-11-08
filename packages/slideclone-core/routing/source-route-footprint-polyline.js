// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {simplifySourceRoute,SOURCE_ROUTE_VERTEX_LIMIT}=require('./source-route-centerline');
/** @typedef {{x:number,y:number}} Point */
/** Preserve both the original .75px centreline error and EVERY source shaft
 * cell at the unchanged calibrated radius. A centreline-only shortcut may
 * move a valid outer fringe outside that radius. If that happens, search only
 * original vertices for a complete bounded polyline; no width, source cell,
 * endpoint, part limit or shared geometry allowance changes.
 * @param {unknown} input @returns {Point[]|null} */
function sourceRouteFootprintPolyline(input){
 if(!record(input)||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0
  ||Number(input.work.checks)>4000000||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true
  ||![input.width,input.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(input.width)*Number(input.height)>262144||typeof input.shaft!=='number'||!Number.isFinite(input.shaft)||input.shaft<1||input.shaft>5
  ||!list(input.points)||input.points.length<2||input.points.length>512||!list(input.cells)||!input.cells.length||input.cells.length>32768)
  throw new TypeError('Source footprint polyline controls are invalid');
 const width=Number(input.width),height=Number(input.height),work=/** @type {{checks:number}} */(input.work);
 if(!input.points.every(p=>record(p)&&Reflect.ownKeys(p).length===2&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isSafeInteger(n))
  &&Number(p.x)>=0&&Number(p.x)<width&&Number(p.y)>=0&&Number(p.y)<height)
  ||input.cells.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>=width*height)
  ||new Set(input.cells).size!==input.cells.length)throw new TypeError('Source footprint polyline source is invalid');
 const points=/** @type {Point[]} */(input.points),cells=/** @type {number[]} */(input.cells),radius=input.shaft/2+.75;
 work.checks+=points.length+cells.length;if(work.checks>4000000)return null;
 if(new Set(points.map(p=>p.y*width+p.x)).size!==points.length)return null;
 const simple=simplifySourceRoute(points,work);if(!simple)return null;
 /** @param {Point} p @param {Point} a @param {Point} b */
 const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
  return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;};
 /** @param {Point[]} path */
 const covers=path=>{for(const n of cells){const p={x:n%width,y:Math.floor(n/width)};let nearest=Infinity;
  for(let i=1;i<path.length;i++){if(++work.checks>4000000)return false;const a=path[i-1],b=path[i];if(!a||!b)return false;
   nearest=Math.min(nearest,distance(p,a,b));}if(nearest>radius*radius)return false;}return true;};
 if(covers(simple))return simple;if(work.checks>4000000)return null;
 // Canonical nearest original segments partition the complete source ledger.
 // Each candidate chord must cover every cell assigned to its replaced run.
 // Raw-path outliers stay outliers: a pale shoulder cannot inflate the shaft.
 /** @type {Point[][]} */const owned=Array.from({length:points.length},/** @returns {Point[]} */()=>[]);
 for(const n of cells){const p={x:n%width,y:Math.floor(n/width)};let nearest=Infinity,segment=-1;
  for(let i=1;i<points.length;i++){if(++work.checks>4000000)return null;const a=points[i-1],b=points[i];if(!a||!b)return null;
   const d=distance(p,a,b);if(d<nearest){nearest=d;segment=i;}}
  if(nearest>radius*radius||segment<0)return null;owned[segment]?.push(p);
 }
 const count=new Uint16Array(points.length).fill(65535),previous=new Int32Array(points.length).fill(-1);count[0]=1;
 for(let hi=1;hi<points.length;hi++)for(let lo=0;lo<hi;lo++){
  if(++work.checks>4000000)return null;const before=count[lo]??65535;
  if(before>=SOURCE_ROUTE_VERTEX_LIMIT||before+1>=(count[hi]??65535))continue;
  const a=points[lo],b=points[hi];if(!a||!b)return null;let valid=true;
  for(let i=lo+1;i<hi;i++){
   if(++work.checks>4000000)return null;const p=points[i];if(!p)return null;
   if(distance(p,a,b)>.75*.75){valid=false;break;}
  }
  if(!valid)continue;
  for(let i=lo+1;i<=hi&&valid;i++)for(const p of owned[i]??[]){
   if(++work.checks>4000000)return null;if(distance(p,a,b)>radius*radius){valid=false;break;}
  }
  if(valid){count[hi]=before+1;previous[hi]=lo;}
 }
 if((count[points.length-1]??65535)>SOURCE_ROUTE_VERTEX_LIMIT)return null;
 const result=[];
 for(let at=points.length-1;at>=0;at=previous[at]??-1){
  if(++work.checks>4000000)return null;const p=points[at];if(!p)return null;result.push({...p});if(at===0)break;
 }
 result.reverse();return result.length>=2&&covers(result)?result:null;
}
module.exports={sourceRouteFootprintPolyline};
