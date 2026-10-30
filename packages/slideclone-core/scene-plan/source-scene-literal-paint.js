// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
const {parseBandBackground}=require('./source-scene-band-geometry');
const {primitiveSourceRaster}=require('./source-scene-primitive-raster');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{type:string,points:{x:number,y:number}[]}} Segment */
/** @typedef {{id:string,type:string,box:Box,style:Record<string,unknown>,source:Record<string,unknown>}} Shape */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,cells:Set<number>,parts:Shape[],snapshots:(string|null)[]}>} */
const observations=new WeakMap();
/** @param {unknown} value */
function snapshot(value){return record(value)&&record(value.source)&&record(value.style)
 ?sceneGroupSnapshot({...value,style:{paint:value.style,source:value.source}}):null;}
/** Preserve selected ACTUALLY observed cells as editable, unclassified paint.
 * No adjacency, blend, dilation, object removal or inferred fringe is used.
 * This is NOT a whole-region or semantic ownership receipt. A complete-source
 * consumer must independently derive and exhaust its full source census.
 * Every palette error is <=18 per channel; contour tolerance is ZERO.
 * Closing actual cell contours never closes a semantic owner, nor grants an
 * opaque body, port, erase mask, physical group or completion permission.
 * @param {unknown} request */
function observeSceneLiteralPaint(request){
 if(!record(request)||Reflect.ownKeys(request).some(k=>typeof k!=='string'||!['image','window','cells','budget','slideSize','id'].includes(k))
  ||typeof request.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(request.id)||!record(request.slideSize)
  ||![request.slideSize.widthPt,request.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=20000)
  ||!types.isSet(request.cells)||types.isProxy(request.cells)||Object.getPrototypeOf(request.cells)!==Set.prototype
  ||Reflect.ownKeys(request.cells).length||request.cells.size>262144)
  throw new TypeError('Literal source paint controls are invalid');
 const parsed=parseBandBackground({image:request.image,hint:request.window,budget:request.budget,textMasks:[],owners:[]});
 const {image,budget}=parsed;
 if(!Buffer.isBuffer(image.rgba)||!record(request.window)
  ||![request.window.x,request.window.y,request.window.w,request.window.h].every(Number.isSafeInteger))
  throw new TypeError('Literal source paint frame is invalid');
 const window=/** @type {Box} */(request.window);
 /** @type {Set<number>} */const cells=new Set();
 for(const cell of Set.prototype.values.call(request.cells)){
  if(!Number.isSafeInteger(cell)||cell<0||cell>=image.width*image.height)throw new TypeError('Literal source paint cell is invalid');
  const x=cell%image.width,y=Math.floor(cell/image.width);
  if(x<window.x||x>=window.x+window.w||y<window.y||y>=window.y+window.h)throw new TypeError('Literal source paint cell is outside its observation');
  cells.add(cell);
 }
 if(!cells.size)return {failure:'literal-paint-empty'};
 const raster=primitiveSourceRaster(image,window,budget);if(!raster)return {failure:'literal-paint-source-budget'};
 const work={checks:0,exhausted:false};
 const sortedCells=[...cells].sort((a,b)=>{work.checks++;return a-b;});
 if(work.checks>4000000)return {failure:'literal-paint-geometry-budget'};
 cells.clear();for(const cell of sortedCells)cells.add(cell);
 /** @type {Map<string,{color:number[],cells:number[]}>} */const colors=new Map();
 for(const cell of cells){
  const color=raster.pixel(cell%image.width,Math.floor(cell/image.width));if(!color)return {failure:'literal-paint-source-alpha'};
  const key=color.join(','),row=colors.get(key)??{color,cells:[]};row.cells.push(cell);colors.set(key,row);
 }
 const ordered=[...colors.values()].sort((a,b)=>{work.checks++;return b.cells.length-a.cells.length||a.color.join(',').localeCompare(b.color.join(','));});
 if(work.checks>4000000)return {failure:'literal-paint-geometry-budget'};
 /** @type {{color:number[],cells:Set<number>}[]} */const palette=[];
 let maxColorError=0;
 for(const row of ordered){
  let group=palette.find(p=>{work.checks+=3;return row.color.every((v,c)=>Math.abs(v-(p.color[c]??0))<=18);});
  if(work.checks>4000000)return {failure:'literal-paint-geometry-budget'};
  if(!group){if(palette.length===32)return {failure:'literal-paint-native-capacity'};group={color:row.color,cells:new Set()};palette.push(group);}
  maxColorError=Math.max(maxColorError,...row.color.map((v,c)=>Math.abs(v-(group.color[c]??0))));
  for(const cell of row.cells)group.cells.add(cell);
 }
 const sx=Number(request.slideSize.widthPt)/image.width,sy=Number(request.slideSize.heightPt)/image.height;
 /** @type {Shape[]} */const parts=[];
 for(const group of palette){
  const pending=new Set(group.cells);
  /** @type {Segment[]} */let segments=[];
  const flush=()=>{
   if(!segments.length)return;
   parts.push({id:request.id+'-literal-'+parts.length,type:'freeform',
    box:{x:window.x*sx,y:window.y*sy,w:window.w*sx,h:window.h*sy},
    style:{fill:'#'+group.color.map(c=>c.toString(16).padStart(2,'0')).join(''),stroke:'none',strokeWidthPt:0,freeformSegments:segments},
    source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'unclassified-source-paint',detector:'source-scene-literal-paint'}});
   segments=[];
  };
  while(pending.size){
   const seed=pending.values().next().value;if(seed===undefined)throw new TypeError('Literal source component is invalid');
   const component=[seed];pending.delete(seed);
   for(let i=0;i<component.length;i++){
    const cell=component[i];if(cell===undefined)throw new TypeError('Literal source component is invalid');
    const x=cell%image.width,y=Math.floor(cell/image.width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     if(++work.checks>4000000)return {failure:'literal-paint-geometry-budget'};
     const nx=x+dx,ny=y+dy;
     if(nx>=window.x&&nx<window.x+window.w&&ny>=window.y&&ny<window.y+window.h&&pending.delete(ny*image.width+nx))component.push(ny*image.width+nx);
    }
   }
   const points=component.map(cell=>({x:cell%image.width,y:Math.floor(cell/image.width)}));
   let x=Infinity,y=Infinity,right=0,bottom=0;
   for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x+1);bottom=Math.max(bottom,p.y+1);}
   const bounds={x,y,w:right-x,h:bottom-y};
   if(bounds.w*bounds.h>1000000)return {failure:'literal-paint-native-capacity'};
   const traced=traceNativeMaskContours(points,bounds,{tolerancePx:0,fastFail:true,workState:work});
   if(!traced)return {failure:work.exhausted?'literal-paint-geometry-budget':'literal-paint-native-capacity'};
   if(segments.length+traced.length>120)flush();
   segments.push(...traced.map(s=>({...s,points:s.points.map(p=>({x:(bounds.x+p.x*bounds.w-window.x)/window.w,y:(bounds.y+p.y*bounds.h-window.y)/window.h}))})));
   if(parts.length>=32)return {failure:'literal-paint-native-capacity'};
  }
  flush();if(parts.length>32)return {failure:'literal-paint-native-capacity'};
 }
 const snapshots=parts.map(snapshot);if(snapshots.some(s=>s===null))return {failure:'literal-paint-snapshot'};
 const receipt=Object.freeze({});observations.set(receipt,{pixels:image.rgba,width:image.width,height:image.height,cells,parts,snapshots});
 return {failure:/** @type {null} */(null),receipt,parts,cells:cells.size,maxColorError,geometryChecks:work.checks,
  ownerCompleted:false,portsAuthorized:false,opaqueBodyAuthorized:false,erasureAuthorized:false};
}
/** @param {unknown} image @param {unknown} receipt @param {unknown} parts */
function retainedSceneLiteralPaint(image,receipt,parts){
 const proof=receipt!==null&&typeof receipt==='object'?observations.get(receipt):undefined;
 if(!proof||!record(image)||image.rgba!==proof.pixels||image.width!==proof.width||image.height!==proof.height
  ||!list(parts)||parts.length!==proof.parts.length||parts.some((p,i)=>p!==proof.parts[i]||snapshot(p)!==proof.snapshots[i]))return null;
 return {cells:new Set(proof.cells),ownerCompleted:false,portsAuthorized:false,opaqueBodyAuthorized:false,erasureAuthorized:false};
}
module.exports={observeSceneLiteralPaint,retainedSceneLiteralPaint};
