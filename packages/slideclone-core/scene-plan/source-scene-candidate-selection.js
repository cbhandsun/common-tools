// @ts-check
'use strict';
const {list,box}=require('./source-scene-group-containment');
const {parseSceneCandidateCatalog}=require('./source-scene-visual-candidates');
/** @typedef {import('./source-scene-plan').Box} Box */
/** Fixed, source-independent constants (pre-registered; never tuned per image). */
const GRID=4,TEXT_COVERED_RATIO=.9,SCALE_EDGES=[24,64,160];
/** Spatially stratified, scale-aware candidate order for a bounded
 * classification budget. Area-first ranking lets a few large envelopes fill
 * every batch and starves small pictograms; here each grid cell and scale band
 * is visited round-robin. Candidates almost fully inside OCR line boxes are
 * deferred (never removed): OCR already proposes text, and the deferral cannot
 * erase or reclassify anything. Selection is a location priority only, never
 * ownership, class, completeness or native permission.
 * @param {unknown} catalogInput
 * @param {{budget:number,textBoxes:unknown}} options */
function selectSceneCandidates(catalogInput,{budget,textBoxes}){
 const catalog=parseSceneCandidateCatalog(catalogInput),{widthPx:width,heightPx:height}=catalog;
 if(!Number.isSafeInteger(budget)||budget<1||budget>256)throw new TypeError('Scene candidate selection budget is invalid');
 if(!list(textBoxes)||textBoxes.length>512)throw new TypeError('Scene candidate text boxes are invalid');
 const mask=new Uint8Array(width*height);
 for(const t of textBoxes){
  if(!box(t)||![t.x,t.y,t.w,t.h].every(Number.isSafeInteger)||t.x<0||t.y<0||t.w<1||t.h<1||t.x+t.w>width||t.y+t.h>height)
   throw new TypeError('Scene candidate text boxes are invalid');
  for(let y=t.y;y<t.y+t.h;y++)mask.fill(1,y*width+t.x,y*width+t.x+t.w);
 }
 // Summed-area table: O(1) covered-area query per candidate.
 const sat=new Float64Array((width+1)*(height+1));
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){row+=mask[y*width+x]??0;sat[(y+1)*(width+1)+x+1]=(sat[y*(width+1)+x+1]??0)+row;}}
 /** @param {Box} b */
 const covered=b=>(sat[(b.y+b.h)*(width+1)+b.x+b.w]??0)-(sat[b.y*(width+1)+b.x+b.w]??0)-(sat[(b.y+b.h)*(width+1)+b.x]??0)+(sat[b.y*(width+1)+b.x]??0);
 /** @param {Box} b */
 const band=b=>{const s=Math.sqrt(b.w*b.h);let i=0;while(i<SCALE_EDGES.length&&s>=(SCALE_EDGES[i]??Infinity))i++;return i;};
 const rows=catalog.candidates.map(c=>{
  const cx=c.box.x+c.box.w/2,cy=c.box.y+c.box.h/2;
  const tile=Math.min(GRID-1,Math.floor(cy*GRID/height))*GRID+Math.min(GRID-1,Math.floor(cx*GRID/width));
  return {c,tier:covered(c.box)>=TEXT_COVERED_RATIO*c.box.w*c.box.h?1:0,cell:(SCALE_EDGES.length-band(c.box))*GRID*GRID+tile};
 });
 /** @type {typeof catalog.candidates} */const ordered=[];
 for(const tier of [0,1]){
  /** @type {Map<number,typeof rows>} */const cells=new Map();
  for(const r of rows.filter(r=>r.tier===tier)){const queue=cells.get(r.cell)??[];queue.push(r);cells.set(r.cell,queue);}
  const queues=[...cells.entries()].sort((a,b)=>a[0]-b[0]).map(([,q])=>q.sort((a,b)=>b.c.inkPixels-a.c.inkPixels||a.c.box.y-b.c.box.y||a.c.box.x-b.c.box.x||(a.c.id<b.c.id?-1:1)));
  for(let round=0;queues.some(q=>q.length>round);round++)for(const q of queues){const r=q[round];if(r)ordered.push(r.c);}
 }
 const selected=ordered.slice(0,budget);
 return {catalog:{sourceHash:catalog.sourceHash,widthPx:width,heightPx:height,candidates:selected.map(c=>({...c,box:{...c.box}}))},
  evidence:{method:'stratified-grid-scale-v1',grid:GRID,scaleEdges:[...SCALE_EDGES],textCoveredRatio:TEXT_COVERED_RATIO,
   available:rows.length,textDeferred:rows.filter(r=>r.tier===1).length,selected:selected.length,sourceAuthorized:false}};
}
module.exports={selectSceneCandidates};
