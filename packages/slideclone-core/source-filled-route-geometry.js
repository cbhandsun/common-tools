// @ts-check
'use strict';
const {sourceRouteShaftTopology}=require('./source-route-shaft-topology');
const {sourceRouteContourParts}=require('./source-route-contour-parts');
const {measureSourceOutlinePaint}=require('./source-outline-paint');
const {measureSourceRoutePaint}=require('./source-route-paint');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{box:{x:number,y:number,w:number,h:number},segments:NonNullable<ReturnType<typeof import('./native-mask-contours').traceNativeMaskContours>>,color:string}} BodyPart */
/** @typedef {{from:number,to:number,a:Point,b:Point,color:string}} Link */
/** @typedef {{parts:BodyPart[],links:Link[]}} FilledBody */
/** Compile the full source footprint instead of approximating it by a thin
 * stroke. Independent head, shaft coverage, whole-shaft topology, source
 * flanks and paint proofs remain mandatory. Visible source-backed short
 * connectors bind the real bodies; no hidden control shapes are introduced.
 * @param {Parameters<typeof import('./source-compound-route-partition').partitionSourceCompoundRoute>[0]} input
 * @param {NonNullable<ReturnType<typeof import('./source-compound-route-partition').partitionSourceCompoundRoute>>} partition */
function sourceFilledRouteGeometry(input,partition){
 const {width,height,rgba,path,background,work}=input,{cells,remaining,trimmed,shaft,startHead,endHead}=partition;
 const paintPath=sourceRouteShaftTopology({mask:remaining,width,height,work});if(!paintPath)return null;
 const paintFit=measureSourceRoutePaint(paintPath,rgba,width,work);if(!paintFit)return null;
 let matching=0,observed=0;
 for(let i=2;i<trimmed.length-2;i++){
  const p=trimmed[i],a=trimmed[i-2],b=trimmed[i+2];if(!p||!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return null;
  for(const sign of [-1,1]){
   if(++work.checks>4000000)return null;
   const x=Math.round(p.x-sign*dy/length*(shaft/2+4)),y=Math.round(p.y+sign*dx/length*(shaft/2+4));
   if(x<0||x>=width||y<0||y>=height)return null;const n=y*width+x;
   if(startHead?.selected.has(n)||endHead?.selected.has(n))continue;
   observed++;const at=n*4;
   if((rgba[at+3]??0)>=240&&background.every((v,k)=>Math.abs(v-(rgba[at+k]??0))<=18))matching++;
  }
 }
 if(!observed||matching/observed<.9)return null;
 const contours=sourceRouteContourParts({cells,width,height,work});if(!contours)return null;
 work.checks+=cells.length*8;if(work.checks>4000000)return null;
 const points=cells.map(n=>({x:n%width,y:Math.floor(n/width)}));
 const colors=new Map(cells.map(n=>[n,[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]]));
 const state={checks:work.checks,exhausted:false},paint=measureSourceOutlinePaint({points,colors,width},state);work.checks=state.checks;
 if(state.exhausted||work.checks>4000000)return null;
 if(!paint&&paintFit.stops)return null;
 // A uniform source needs no fringe overlay. Nonuniform paint uses the
 // existing complete-source outline paint expression, then the whole page's
 // unchanged render gates decide whether this native candidate is acceptable.
 /** @type {BodyPart[]} */const parts=contours.map(p=>({box:p.box,segments:p.segments,color:paint?.baseColor??paintFit.color}));
 if(paint)parts.push(...paint.parts);
 const owner=new Map();
 for(const [index,part]of contours.entries())for(const n of part.cells){if(++work.checks>4000000)return null;owner.set(n,index);}
 /** @param {Point} p */const partAt=p=>owner.get(p.y*width+p.x);
 /** @param {Point} p */const colorAt=p=>'#'+[0,1,2].map(k=>(rgba[(p.y*width+p.x)*4+k]??0).toString(16).padStart(2,'0')).join('');
 /** @type {Link[]} */const links=[];
 // Adjacent source-cell centres supply real short visible lines. Their
 // round 1px paint stays within the original cells' .75px contour allowance.
 const entry=path[1],exit=path.at(-2),first=path[0],last=path.at(-1);
 if(!entry||!exit||!first||!last)return null;
 const entryPart=partAt(entry),exitPart=partAt(exit);if(entryPart===undefined||exitPart===undefined)return null;
 links.push({from:-1,to:entryPart,a:first,b:entry,color:colorAt(entry)});
 for(let i=1;i<path.length;i++){
  if(++work.checks>4000000)return null;const a=path[i-1],b=path[i];if(!a||!b)return null;
  const from=partAt(a),to=partAt(b);if(from===undefined||to===undefined)return null;
  if(from!==to)links.push({from,to,a,b,color:colorAt(a)});
 }
 links.push({from:exitPart,to:-2,a:exit,b:last,color:colorAt(exit)});
 if(parts.length+links.length>32)return null;
 return {shaft,support:matching/observed,filledTerminals:true,nativePoints:/** @type {Point[]|null} */(null),paintPath,paintFit,
  filledBody:/** @type {FilledBody} */({parts,links})};
}
module.exports={sourceFilledRouteGeometry};
