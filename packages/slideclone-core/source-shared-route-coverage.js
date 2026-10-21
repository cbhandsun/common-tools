// @ts-check
'use strict';
/** Every remaining original shaft cell must be represented by a measured
 * edge at its OWN width.
 *
 * Core rule: a cell is represented when it lies within width/2+.75px of an
 * edge centreline. Two bounded allowances describe real stroke rendering
 * rather than missing topology:
 * - joint wedge & terminal cap: rounded/filleted T-joints carry ink between the
 *   arms (cells within 2.5x widest stroke of joint); terminal sections (within
 *   16px of endpoints) carry arrowheads or contact flares up to 8.5px;
 * - anti-alias halo: at most 2% of the cells may lie in the band up to
 *   width/2+2px of a centreline.
 * Any other cell (an unrepresented branch, stub or blob) still fails, so the
 * rule cannot absorb missing topology. Work ledger unchanged.
 * @param {{mask:Uint8Array,width:number,height:number,edges:{cells:number[],widthPx:number,from?:number,to?:number}[],
 *  joints?:number[],work:{checks:number}}} input */
function sourceSharedRouteCoverage({mask,width,height,edges,joints=[],work}){
 const span=16,columns=Math.ceil(width/span),buckets=new Map();
 /** @param {number} x @param {number} y @param {number} radius @param {number} halo */
 const add=(x,y,radius,halo)=>{const key=Math.floor(y/span)*columns+Math.floor(x/span);
  const rows=buckets.get(key)??[];rows.push({x,y,radius,halo});buckets.set(key,rows);};
 for(const edge of edges){
  const len=edge.cells.length;
  for(let i=0;i<len;i++){
   if(++work.checks>4000000)return false;
   const term=i<16||i>=len-16;
   const radius=term?Math.max(8.5,edge.widthPx/2+.75):edge.widthPx/2+.75;
   const halo=term?Math.max(10,edge.widthPx/2+2):edge.widthPx/2+2;
   const n=edge.cells[i];if(n===undefined)continue;
   add(n%width,Math.floor(n/width),radius,halo);
  }
 }
 for(const joint of joints){
  const incident=edges.filter(e=>e.from===joint||e.to===joint);if(!incident.length)continue;
  const widest=Math.max(...incident.map(e=>e.widthPx));work.checks+=incident.length;if(work.checks>4000000)return false;
  const radius=Math.min(span-1,Math.max(8.5,widest*2.5+.75));add(joint%width,Math.floor(joint/width),radius,radius);
 }
 let ink=0,halo=0;
 for(let n=0;n<mask.length;n++){
  if(!mask[n])continue;if(++work.checks>4000000)return false;ink++;
  const x=n%width,y=Math.floor(n/width),bx=Math.floor(x/span),by=Math.floor(y/span);let covered=false,near=false;
  search: for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=bx+dx,yy=by+dy;if(xx<0||yy<0||xx>=columns||yy>=Math.ceil(height/span))continue;
   for(const point of buckets.get(yy*columns+xx)??[]){
    const d2=(x-point.x)**2+(y-point.y)**2;
    if(d2<=point.radius**2){covered=true;break search;}
    if(d2<=point.halo**2)near=true;
   }
  }
  if(covered)continue;
  if(!near){
    
    return false;
  }
  halo++;
 }
 
 return ink>0&&halo<=ink*.02;
}
module.exports={sourceSharedRouteCoverage};
