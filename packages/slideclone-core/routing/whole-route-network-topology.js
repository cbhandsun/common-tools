// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {wholeRouteCurves}=require('./source-whole-route-geometry');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** Inspect the UNION of actual native stroke drawings, including unused arms.
 * Per-relation endpoints/counts cannot detect a collapsed physical cycle.
 * This is a bounded sampled-stroke diagnostic, not source-pixel ownership,
 * full graph/path equivalence, visual acceptance or Office behaviour proof.
 * Only opaque, solid, round-cap strokes are supported. Resolution is fixed
 * at three cells across the thinnest stroke. A window
 * which cannot fit the existing 262144-cell bound returns null, never a pass.
 * @param {unknown} input */
function inspectWholeRouteNetworkTopology(input){
 const invalid=()=>new TypeError('Native network topology drawing is invalid');
 if(!record(input)||!sharedOutputWork(input.work)||!list(input.parts)||input.parts.length>128)throw invalid();
 const {work}=input;
 /** @param {number} count */const charge=count=>{
  if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
 };
 /** @type {{curves:Point[][],width:number}[]} */const drawings=[];
 for(const part of input.parts){
  if(!record(part)||!record(part.box)||!record(part.style))throw invalid();const s=part.style;
  if(typeof s.strokeWidthPt!=='number'||!Number.isFinite(s.strokeWidthPt)||s.strokeWidthPt<=0||s.strokeWidthPt>100
   ||typeof s.stroke!=='string'||!/^#[a-f0-9]{6}$/iu.test(s.stroke)
   ||s.lineCap!=='round'||s.opacity!==undefined&&s.opacity!==1||s.strokeDashPattern!==undefined
   ||s.strokeDash!==undefined&&s.strokeDash!=='solid'||s.dash!==undefined&&s.dash!=='solid'
   ||s.freeformPath!==undefined&&(typeof s.freeformPath!=='string'||s.freeformPath.length>262144))throw invalid();
  if(s.strokeGradient!==undefined){
   const g=s.strokeGradient;
   if(!record(g)||g.type!=='linear'||!list(g.stops)||g.stops.length<2||g.stops.length>8
    ||g.stops.some(stop=>!record(stop)||stop.alpha!==undefined&&stop.alpha!==1
     ||typeof stop.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(stop.color)))throw invalid();
  }
  charge((typeof s.freeformPath==='string'?s.freeformPath.length:1920)+32);
  drawings.push({curves:wholeRouteCurves(/** @type {import('./source-shared-route-output-paint').Item} */(part)),width:s.strokeWidthPt});
 }
 const basis='sampled-native-stroke-mask-v1';
 if(!drawings.length)return {basis,connectedComponents:0,cycles:0,cellSizePt:null,cells:0,sourceOwnershipGranted:false,fullTopologyVerified:false};
 const cellSizePt=Math.min(...drawings.map(d=>d.width))/3,points=drawings.flatMap(d=>d.curves.flat());
 if(!points.length)throw invalid();charge(points.length*4);
 const margin=Math.max(...drawings.map(d=>d.width))/2+cellSizePt*3;
 const x=Math.floor((Math.min(...points.map(p=>p.x))-margin)/cellSizePt)*cellSizePt;
 const y=Math.floor((Math.min(...points.map(p=>p.y))-margin)/cellSizePt)*cellSizePt;
 const width=Math.ceil((Math.max(...points.map(p=>p.x))+margin-x)/cellSizePt)+1;
 const height=Math.ceil((Math.max(...points.map(p=>p.y))+margin-y)/cellSizePt)+1,cells=width*height;
 if(!Number.isSafeInteger(cells)||width<3||height<3||cells>262144)return null;
 charge(cells*3);const mask=new Uint8Array(cells),queue=new Uint32Array(cells);
 /** Rasterize a continuous chord using pixel-centre distance, not square
  * point stamps that can seal an empty hole just from sample placement.
  * @param {Point} a @param {Point} b @param {number} radius */
 const chord=(a,b,radius)=>{
  const ax=(a.x-x)/cellSizePt,ay=(a.y-y)/cellSizePt,bx=(b.x-x)/cellSizePt,by=(b.y-y)/cellSizePt;
  const left=Math.max(0,Math.floor(Math.min(ax,bx)-radius)),right=Math.min(width-1,Math.ceil(Math.max(ax,bx)+radius));
  const top=Math.max(0,Math.floor(Math.min(ay,by)-radius)),bottom=Math.min(height-1,Math.ceil(Math.max(ay,by)+radius));
  charge((right-left+1)*(bottom-top+1));const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
  for(let cy=top;cy<=bottom;cy++)for(let cx=left;cx<=right;cx++){
   const t=length?Math.max(0,Math.min(1,((cx-ax)*dx+(cy-ay)*dy)/length)):0;
   if(Math.hypot(cx-ax-t*dx,cy-ay-t*dy)<=radius)mask[cy*width+cx]=1;
  }
 };
 let sampleCount=0;
 for(const drawing of drawings)for(const curve of drawing.curves){
  charge(curve.length*4);const first=curve[0],last=curve.at(-1);if(!first||!last)throw invalid();
  const length=curve.slice(1).reduce((sum,p,i)=>{const a=curve[i];if(!a)throw invalid();return sum+Math.hypot(p.x-a.x,p.y-a.y);},0);
  const steps=Math.max(1,Math.ceil(length/cellSizePt*4));sampleCount+=steps;
  if(sampleCount>131072)return null;charge(steps*16);let before=first;
  for(let i=1;i<=steps;i++){
   const t=i/steps,u=1-t;let point;
   if(curve.length===2)point={x:u*first.x+t*last.x,y:u*first.y+t*last.y};
   else{const b=curve[1],c=curve[2];if(!b||!c)throw invalid();
    point={x:u*u*u*first.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*last.x,
     y:u*u*u*first.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*last.y};}
   chord(before,point,drawing.width/(cellSizePt*2));before=point;
  }
 }
 let connectedComponents=0,cycles=0;
 for(let start=0;start<cells;start++){
  charge(1);const ink=mask[start];if(ink!==0&&ink!==1)continue;
  let head=0,tail=1,border=false;queue[0]=start;mask[start]=ink+2;
  while(head<tail){
   const at=queue[head++];if(at===undefined)throw invalid();const cx=at%width,cy=Math.floor(at/width);
   border ||=cx===0||cy===0||cx===width-1||cy===height-1;
   charge(ink?8:4);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy||!ink&&dx&&dy||cx+dx<0||cx+dx>=width||cy+dy<0||cy+dy>=height)continue;
    const next=at+dy*width+dx;if(mask[next]!==ink)continue;mask[next]=ink+2;queue[tail++]=next;
   }
  }
  if(ink)connectedComponents++;else if(!border)cycles++;
 }
 return {basis,connectedComponents,cycles,cellSizePt,cells,sourceOwnershipGranted:false,fullTopologyVerified:false};
}
module.exports={inspectWholeRouteNetworkTopology};
