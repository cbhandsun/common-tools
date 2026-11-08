// @ts-check
"use strict";
const {types}=require('node:util');
const {createHash}=require('node:crypto');
const {sourceRaster}=require('../typography/residual-text-mask');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {hasMeasuredScenePortFrame,verifyMeasuredScenePort,measuredSceneContourPort,measuredScenePortBodyMask}=require('./source-scene-port-evidence');
const {thinSourceRoute,sourceRouteTerminalMask,sourceRouteConnectedPairs,sourceRoutePath,simplifySourceRoute,sourceRouteCoversComponent}=require('../routing/source-route-centerline');
const {parseScenePathProgram,sourceRouteMatchesProgram,sourceRouteComponentIsComplete}=require('./source-scene-path-program');
const {measureSourceRoutePaint}=require('../routing/source-route-paint');
const {sourceRouteCoverageWidth}=require('../routing/source-route-coverage-width');
const {centerSourceRoute}=require('../routing/source-route-source-centering');
const {sourceCompoundRouteGeometry}=require('../routing/source-compound-route-geometry');
const {sourceRouteObservationWindow}=require('../routing/source-route-observation-window');
const {bindSourceFilledRoute}=require('../routing/source-filled-route-binding');
const {sourceRouteContactCentres,sourceRouteContactsAgree}=require('../routing/source-route-contact-centres');
const {sourceRouteLocalBackground}=require('../routing/source-route-local-background');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,box:Box,portFrame?:unknown}} Node */
/** @typedef {{index:number,point:Point,side:string,position:number,offset:Point,distance:number}} Site */
/** @typedef {{shaft:number,support:number,nativePoints:Point[]|null,filledTerminals?:boolean,fixedHeadCuts?:boolean,
 * paintFit?:NonNullable<ReturnType<typeof measureSourceRoutePaint>>,filledBody?:import('../routing/source-filled-route-geometry').FilledBody,
 * terminalContacts?:{start?:Set<number>,end?:Set<number>}}} Geometry */
/** @typedef {{points:Point[],startSide:string,endSide:string,startPosition:number,endPosition:number,startOffset?:Point,endOffset?:Point,color:string,widthPx:number,support:number,
 * filledBody?:ReturnType<typeof bindSourceFilledRoute>,filledTerminals?:boolean,fixedHeadCuts?:boolean,paint?:{stops:{position:number,color:string}[],positions:number[],support:number,spatial?:import('../routing/source-route-spatial-paint').SpatialPaint}}} Route */
/** @type {WeakMap<object,{fromId:string,toId:string,direction:string,widthPx:number,heightPx:number,pixels:Uint8Array,digest:string,
 * checks:number,nodes:{id:string,box:Box}[]}>} */
const provenRoutes=new WeakMap();
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** @param {unknown} v @returns {v is Node} */
function node(v){return record(v)&&typeof v.id==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/u.test(v.id)&&box(v.box);}
/** @param {unknown} v @param {number} limit @returns {Box[]} */
function boxes(v,limit){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>limit
 ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!('value'in p))||!v.every(box))throw new TypeError('Scene route boxes are invalid');return v;}
/** Enumerate source cells touching one measured body within the unchanged 2px
 * allowance. A site remains a hypothesis until the private port verifies it.
 * @param {number} index @param {number} width @param {Box} window
 * @param {import('../png').PngImage} image @param {Node} node @param {{checks:number}} work @returns {Site|null} */
function site(index,width,window,image,node,work){
 const x=index%width+window.x,y=Math.floor(index/width)+window.y;
 const b=node.box;
 const candidates=['left','right','top','bottom'].flatMap(side=>{
  const horizontal=side==='left'||side==='right',point=measuredSceneContourPort(image,node.portFrame,b,horizontal?y:x,side,work);
  if(!point)return [];const position=horizontal?(y-b.y)/b.h:(x-b.x)/b.w;
  const base=horizontal?{x:side==='left'?b.x:b.x+b.w,y}:{x,y:side==='top'?b.y:b.y+b.h};
  return [{side,d:Math.hypot(point.x-x,point.y-y),point,position,offset:{x:point.x-base.x,y:point.y-base.y}}];
 })
  .filter(s=>s.d<=2&&s.position>0&&s.position<1).sort((a,b)=>a.d-b.d);
 const found=candidates[0];return found?{index,point:found.point,side:found.side,position:found.position,offset:found.offset,distance:found.d}:null;
}
/** Uniform paint from already observed source path cells, under the original
 * 18-color and .9 support rule. Sorting work shares the geometry allowance.
 * @param {Point[]} path @param {Uint8Array} rgba @param {number} width
 * @param {{checks:number}} work @returns {string|null} */
function routeInkColor(path,rgba,width,work){
 work.checks+=path.length*32;if(work.checks>4000000)return null;
 const colors=path.map(p=>[rgba[(p.y*width+p.x)*4]??0,rgba[(p.y*width+p.x)*4+1]??0,rgba[(p.y*width+p.x)*4+2]??0]);
 const rgb=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
 if(!colors.length||colors.filter(p=>p.every((v,c)=>Math.abs(v-(rgb[c]??0))<=18)).length/colors.length<.9)return null;
 return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}
/** Continuous source routes only: no inferred/dashed gap closing. A local
 * location hint restricts source observation, never supplies a path. Preserve
 * .9 support, 1..5px shaft, 12px head radius, 512-cell path, 2px private ports,
 * 262144 unit pixels, 4M source reads and 32 physical parts.
 * @param {unknown} input @returns {{fit:Route|null,reason:string}} */
function measureSourceSceneRoute(input){
 if(!record(input)||!node(input.from)||!node(input.to)||input.from.id===input.to.id
  ||!record(input.budget)||typeof input.budget.used!=='number'||!Number.isSafeInteger(input.budget.used)||input.budget.used<0||input.budget.used>4000000
  ||(typeof input.direction!=='string'||!['forward','backward','both','undirected'].includes(input.direction))||input.shaftBox!==undefined&&!box(input.shaftBox))throw new TypeError('Scene route input is invalid');
 const source=sourceRaster(input.image);
 if(!record(input.image)||!Buffer.isBuffer(input.image.rgba))throw new TypeError('Scene route source is invalid');
 // Preserve the validated source-buffer identity used by private port tokens.
 const image={...source,rgba:input.image.rgba},from=input.from,to=input.to,texts=boxes(input.textMasks,10000),others=boxes(input.otherNodes??[],88);
 const all=[from.box,to.box,...texts,...others,...(box(input.shaftBox)?[input.shaftBox]:[])];
 if(all.some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Scene route source is invalid');
 const budget=/** @type {{used:number}} */(input.budget);
 const program=parseScenePathProgram(input.visiblePath,{widthPx:image.width,heightPx:image.height,coordinateSpace:'compiled-source-pixels',
  owner:{x:0,y:0,w:image.width,h:image.height},...(box(input.shaftBox)?{shaftBox:input.shaftBox}:{})});
 /** @param {string} reason @returns {{fit:null,reason:string}} */const reject=reason=>({fit:null,reason});
 if(!hasMeasuredScenePortFrame(image,from.portFrame,from.box)||!hasMeasuredScenePortFrame(image,to.portFrame,to.box))return reject('route-private-ports');
 const px=program?.vertices.map(p=>p.x),py=program?.vertices.map(p=>p.y);
 const programBox=px&&py?{x:Math.min(...px),y:Math.min(...py),w:Math.max(1,Math.max(...px)-Math.min(...px)),h:Math.max(1,Math.max(...py)-Math.min(...py))}:undefined;
 const hint=box(input.shaftBox)?input.shaftBox:programBox??{x:Math.min(from.box.x,to.box.x),y:Math.min(from.box.y,to.box.y),
  w:Math.max(from.box.x+from.box.w,to.box.x+to.box.w)-Math.min(from.box.x,to.box.x),
  h:Math.max(from.box.y+from.box.h,to.box.y+to.box.h)-Math.min(from.box.y,to.box.y)};
 const window=sourceRouteObservationWindow({hint,from:from.box,to:to.box,width:image.width,height:image.height,
  anchored:!!input.shaftBox,programmed:!!program}),{x,y}=window;
 if(window.w*window.h>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return reject('route-source-budget');
 const raster=readSceneFillRaster(image,window,budget),area=window.w*window.h,mask=new Uint8Array(area);
 const excluded=[...texts,...others],blocked=new Uint8Array(area),endpointBodies=new Uint8Array(area),work={checks:0};
 /** @type {Map<Node,Uint8Array>} */const endpointBodyMasks=new Map();
 for(const node of [from,to]){
  const body=measuredScenePortBodyMask(image,node.portFrame,node.box,window,work);if(!body)return reject('route-geometry-budget');
  endpointBodyMasks.set(node,body);
  for(let i=0;i<area;i++){if(++work.checks>4000000)return reject('route-geometry-budget');blocked[i]=(blocked[i]??0)|(body[i]??0);endpointBodies[i]=blocked[i]??0;}
 }
 for(const b of excluded){
  const left=Math.max(0,Math.ceil(b.x-x-.5)),right=Math.min(window.w,Math.ceil(b.x+b.w-x-.5));
  const top=Math.max(0,Math.ceil(b.y-y-.5)),bottom=Math.min(window.h,Math.ceil(b.y+b.h-y-.5));
  if(left>=right||top>=bottom)continue;
  work.checks+=(right-left)*(bottom-top);if(work.checks>4000000)return reject('route-geometry-budget');
  for(let row=top;row<bottom;row++)blocked.fill(1,row*window.w+left,row*window.w+right);
 }
 /** @param {number} i */const foreign=i=>!!blocked[i];
 /** @type {number[][]} */const perimeter=[];
 for(let i=0;i<area;i++)if((i<window.w||i>=area-window.w||i%window.w===0||i%window.w===window.w-1)&&!foreign(i)){
  if((raster.rgba[i*4+3]??0)<240)return reject('route-alpha');
  perimeter.push([raster.rgba[i*4]??0,raster.rgba[i*4+1]??0,raster.rgba[i*4+2]??0]);
 }
 if(perimeter.length<8)return reject('route-background');
 const background=[0,1,2].map(c=>perimeter.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(perimeter.length/2)]??0);
 const needsLocalBackground=!!program||perimeter.some(p=>p.some((v,c)=>Math.abs(v-(background[c]??0))>18));
 const backgroundAt=sourceRouteLocalBackground({image:raster,body:endpointBodies,background,work});
 if(work.checks>4000000)return reject('route-geometry-budget');
 for(let i=0;i<area;i++)if(!foreign(i)){
  if((raster.rgba[i*4+3]??0)<240)return reject('route-alpha');
  mask[i]=Math.max(...backgroundAt(i).map((v,c)=>Math.abs(v-(raster.rgba[i*4+c]??0))))>=42?1:0;
 }
 // Thinning may retract a short thick tip from its actual body contact. Keep
 // only observed shaft cells already within the original 2px private contour
 // hypothesis. No empty cell is added; final physical attachment still proves
 // both selected sites and complete component coverage still rejects branches.
 let skeleton=thinSourceRoute(mask,window.w,window.h,work);if(!skeleton)return reject('route-geometry-budget');
 /** @type {Site[]} */const starts=[],ends=[];
 /** Prune source contact hypotheses before charging the unchanged 32-pair
  * capacity. This reads only an actual skeleton cell and the private port's
  * original attachment window; it supplies no new edge or inferred paint.
  * @param {Site|null} candidate @param {Node} endpoint */
 const attached=(candidate,endpoint)=>{
  if(!candidate)return false;
  const at=candidate.index*4;
  const color='#'+[0,1,2].map(c=>(raster.rgba[at+c]??0).toString(16).padStart(2,'0')).join('');
  return verifyMeasuredScenePort({image,token:endpoint.portFrame,box:endpoint.box,point:candidate.point,
   side:candidate.side,color,textMasks:texts,budget});
 };
 /** @type {{a:Site,b:Site,path:Point[]}[]} */const candidates=[];
 for(let attempt=0;attempt<2;attempt++){
  starts.length=0;ends.length=0;let shortPaths=0;
  for(let i=0;i<area;i++)if(skeleton[i]){const a=site(i,window.w,window,image,from,work),b=site(i,window.w,window,image,to,work);
   if(a&&attached(a,from))starts.push(a);if(b&&attached(b,to))ends.push(b);}
  // Multiple shaft cells can meet the exact same private contour point.
  // They are one attachment hypothesis, not additional endpoint pairs. Use
  // its closest observed cell to retain the longest source-contact section;
  // complete-component coverage must still reject a discarded branch/loop.
  for(const sites of [starts,ends]){
   sites.sort((a,b)=>a.side.localeCompare(b.side)||(a.point.x-b.point.x)||(a.point.y-b.point.y));
   /** @type {typeof sites[]} */const groups=[];
   for(const s of sites){
    const last=groups.at(-1);
    const previous=last?.at(-1);
    if(last&&previous&&last[0]?.side===s.side&&previous.point.x===s.point.x&&previous.point.y===s.point.y){
     last.push(s);
    }else groups.push([s]);
   }
   sites.splice(0,sites.length,...groups.flatMap(g=>{
    const distance=Math.min(...g.map(s=>s.distance)),closest=g.filter(s=>s.distance===distance);
    const selected=closest[Math.floor(closest.length/2)];return selected?[selected]:[];
   }));
   const centres=sourceRouteContactCentres({sites,mask,rgba:raster.rgba,width:window.w,background,work});
   if(!centres)return reject('route-geometry-budget');
   sites.splice(0,sites.length,...sites.filter(s=>centres.get(s)===s));
  }
  if(work.checks>4000000)return reject('route-geometry-budget');
  const pairs=sourceRouteConnectedPairs(skeleton,window.w,window.h,starts,ends,work);
  if(!pairs)return reject(work.checks>4000000?'route-geometry-budget':'route-ambiguous-ports');
  for(const [a,b] of pairs){const path=sourceRoutePath(skeleton,window.w,window.h,a.index,b.index,work);
   if(path&&path.length>=8)candidates.push({a,b,path:centerSourceRoute(path,mask,window.w,window.h,String(input.direction),work)??path});else if(path)shortPaths++;
  }
  if(work.checks>4000000)return reject('route-geometry-budget');
  if(candidates.length)break;
  if(attempt)return reject(!starts.length||!ends.length?'route-detached':shortPaths?'route-source-length':'route-discontinuity');
  const terminals=sourceRouteTerminalMask(mask,window.w,window.h,
   i=>site(i,window.w,window,image,from,work),i=>site(i,window.w,window,image,to,work),work);
  if(!terminals)return reject('route-geometry-budget');
  skeleton=thinSourceRoute(mask,window.w,window.h,work,terminals);if(!skeleton)return reject('route-geometry-budget');
 }
 // Contact alone cannot establish ambiguity. Validate each complete source
 // candidate against direction, coverage and background first, under the
 // same shared geometry counter and the unchanged 32-pair capacity.
 /** @type {Map<string,number>} */const coverageWidthCache=new Map();
 /** @param {typeof candidates[number]} candidate */
 const complete=candidate=>{
 const {path}=candidate;
 if(needsLocalBackground&&!sourceRouteComponentIsComplete(mask,window.w,window.h,path,work))
  return reject(work.checks>4000000?'route-geometry-budget':program?'route-program-clipped-component':'route-window-boundary');
 if(program){
  const globalPath=path.map(p=>({x:p.x+x,y:p.y+y}));
  if(!sourceRouteMatchesProgram(globalPath,program,work))return reject(work.checks>4000000?'route-geometry-budget':'route-program-mismatch');
 }
 /** @param {Point} p @param {Point} q */
 const widthAt=(p,q)=>{
  const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(!length)return 0;
  const nx=-dy/length,ny=dx/length;
  /** @param {number} d */const ink=d=>{const px=Math.round(p.x+nx*d),py=Math.round(p.y+ny*d);return px>=0&&py>=0&&px<window.w&&py<window.h&&!!mask[py*window.w+px];};
  if(!ink(0))return 0;
  let low=0,high=0;while(low>-12&&ink(low-1))low--;while(high<12&&ink(high+1))high++;
  return low===-12||high===12?0:high-low+1;
 };
 const widths=path.map((p,i)=>{
  // A skeleton can turn into the broad base of a filled head. Measure that
  // head normal to its observed incoming shaft, rather than mistaking a
  // one-cell terminal spur for a change in the arrow's direction.
  const start=i<12&&['backward','both'].includes(String(input.direction));
  const end=i>=path.length-12&&['forward','both'].includes(String(input.direction));
  const a=start?path[12]:end?path[path.length-17]:undefined;
  const b=start?path[16]:end?path[path.length-13]:undefined;
  return widthAt(p,a&&b?{x:p.x+b.x-a.x,y:p.y+b.y-a.y}:path[i+2]??path[i-2]??p);
 });
 const central=widths.slice(Math.floor(widths.length*.3),Math.ceil(widths.length*.7)).sort((a,b)=>a-b);
 let shaft=central[Math.floor(central.length/2)]??0;
 if(shaft>5)shaft=sourceRouteCoverageWidth({path,rgba:raster.rgba,width:window.w,height:window.h,background,work,cache:coverageWidthCache})??0;
 const support=widths.filter(w=>w>0).length/widths.length;
 if(shaft<1||shaft>5||support<.9)return reject('route-shaft-support');
 if(needsLocalBackground){
  // Replace a whole-window negative assumption with positive source flanks
  // of the COMPLETE verified route. Preserve the original 18-color, 240-alpha
  // and .9-support bounds; unrelated perimeter marks grant no ownership.
  let observed=0,matching=0;
  for(let i=12;i<path.length-12;i++){
   const p=path[i],a=path[i-2],b=path[i+2];if(!p||!a||!b)return reject(program?'route-program-background':'route-source-background');
   const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
   for(const sign of [-1,1]){
    if(++work.checks>4000000)return reject('route-geometry-budget');
    const xx=Math.round(p.x-sign*dy/length*(shaft/2+4)),yy=Math.round(p.y+sign*dx/length*(shaft/2+4));observed++;
    if(xx<0||yy<0||xx>=window.w||yy>=window.h)continue;
    const at=(yy*window.w+xx)*4;
    if((raster.rgba[at+3]??0)>=240&&backgroundAt(yy*window.w+xx).every((v,c)=>Math.abs(v-(raster.rgba[at+c]??0))<=18))matching++;
   }
  }
  if(!observed||matching/observed<.9)return reject(program?'route-program-background':'route-source-background');
 }
 /** @param {boolean} end */const arrow=end=>{
  const section=(end?[...widths].reverse():widths).slice(0,Math.min(12,Math.floor(widths.length/2)));
  const peak=Math.max(...section),base=section.indexOf(peak);
  if(peak<shaft*2+2||base<2||base>9||(section[0]??0)>shaft+2)return false;
  for(let i=1;i<=base;i++)if((section[i]??0)+1<(section[i-1]??0))return false;
  return true;
 };
 if(arrow(false)!==(input.direction==='backward'||input.direction==='both')||arrow(true)!==(input.direction==='forward'||input.direction==='both'))return reject('route-arrow-direction');
 if(!sourceRouteCoversComponent(mask,window.w,window.h,path,shaft,input.direction==='backward'||input.direction==='both',input.direction==='forward'||input.direction==='both',work))
  return reject(work.checks>4000000?'route-geometry-budget':'route-unrepresented-branch');
 return {shaft,support,nativePoints:/** @type {Point[]|null} */(null)};
 };
 const startCentres=sourceRouteContactCentres({sites:candidates.map(c=>c.a),mask,rgba:raster.rgba,width:window.w,background,work});
 const endCentres=sourceRouteContactCentres({sites:candidates.map(c=>c.b),mask,rgba:raster.rgba,width:window.w,background,work});
 if(!startCentres||!endCentres)return reject('route-geometry-budget');
 const centredCandidates=candidates.filter(c=>startCentres.get(c.a)===c.a&&endCentres.get(c.b)===c.b);
 if(centredCandidates.length)candidates.splice(0,candidates.length,...centredCandidates);
 candidates.sort((a,b)=>b.path.length-a.path.length);
 /** @type {string|undefined} */let failure;
 /** @type {{position:number,color:string}[]|undefined} */let paintModel;
 const completed=[];
 for(const candidate of candidates){
  /** @type {Geometry|{fit:null,reason:string}} */
  let geometry=complete(candidate);
  if('reason' in geometry&&!program&&['route-source-background','route-shaft-support','route-arrow-direction','route-unrepresented-branch'].includes(geometry.reason)){
   const startBody=endpointBodyMasks.get(from),endBody=endpointBodyMasks.get(to);if(!startBody||!endBody)return reject('route-private-ports');
   const compound=sourceCompoundRouteGeometry({mask,width:window.w,height:window.h,rgba:raster.rgba,path:candidate.path,
    direction:String(input.direction),background,work,headContacts:{
     start:{point:{x:candidate.a.point.x-x,y:candidate.a.point.y-y},body:startBody},
     end:{point:{x:candidate.b.point.x-x,y:candidate.b.point.y-y},body:endBody}}});
   if(compound)geometry=compound;
  }
  if('reason' in geometry){failure??=geometry.reason;continue;}
  // Fit paint only after complete geometry succeeds. Neighboring invalid
  // paths must not consume the page's budget in repeated color regressions.
  const paint=geometry.paintFit??measureSourceRoutePaint(candidate.path,raster.rgba,window.w,work,paintModel);
  if(!paint){failure??='route-ink-color';continue;}paintModel??=paint.stops;
  completed.push({...candidate,geometry,paint});
  // A full contour certifies its entire component, independently of which
  // neighbouring skeleton pixel proposed the same two physical ports. Once
  // every candidate has the same sites under the original 2px rule OR all
  // suppressed tips belong to that same independently certified head taper,
  // repeating the complete proof cannot reveal a distinct physical arrow.
  if(geometry.filledBody&&candidates.every(c=>sourceRouteContactsAgree(candidate.a,c.a,geometry.terminalContacts?.start)
   &&sourceRouteContactsAgree(candidate.b,c.b,geometry.terminalContacts?.end)))break;
 }
 if(work.checks>4000000)return reject('route-geometry-budget');
 const first=completed[0];if(!first)return reject(failure??'route-discontinuity');
 // Several neighboring source cells can represent one physical tip. Distinct
 // complete, source-proven attachments retain the original ambiguity rule.
 if(completed.some(c=>c.a.side!==first.a.side||c.b.side!==first.b.side||Math.hypot(c.a.point.x-first.a.point.x,c.a.point.y-first.a.point.y)>2
  ||Math.hypot(c.b.point.x-first.b.point.x,c.b.point.y-first.b.point.y)>2))return reject('route-ambiguous-ports');
 completed.sort((a,b)=>b.path.length-a.path.length);const selected=completed[0];if(!selected)return reject('route-discontinuity');
 const {a,b,path,paint,geometry:{shaft,support}}=selected,color=paint.color;
 const filledBody=selected.geometry.filledBody?bindSourceFilledRoute(selected.geometry.filledBody,{x,y}):undefined;
 const simplified=selected.geometry.nativePoints??simplifySourceRoute(path,work);
 if(!simplified)return reject('route-parts-budget');
 if(!filledBody)work.checks+=path.length*simplified.length;if(work.checks>4000000)return reject('route-geometry-budget');
 const points=simplified.map(p=>({x:p.x+x,y:p.y+y}));points[0]=a.point;points[points.length-1]=b.point;
 const spatial=paint.spatial?{...paint.spatial,origin:paint.spatial.origin+(paint.spatial.axis==='x'?x:y)}:undefined;
 const gradient=!filledBody&&paint.stops&&paint.positions?{stops:paint.stops,positions:simplified.map(p=>paint.positions?.[path.findIndex(q=>q.x===p.x&&q.y===p.y)]??NaN),support:paint.support,...(spatial?{spatial}: {})}:undefined;
 if(gradient){
  if(gradient.positions.some((p,i)=>!Number.isFinite(p)||i>0&&p<=(gradient.positions[i-1]??0)))return reject('route-paint-binding');
  for(const stop of gradient.stops)Object.freeze(stop);Object.freeze(gradient.stops);Object.freeze(gradient.positions);Object.freeze(gradient);
  if(spatial){
   if('stops' in spatial){for(const stop of spatial.stops)Object.freeze(stop);Object.freeze(spatial.stops);}
   else{Object.freeze(spatial.color);Object.freeze(spatial.step);}
   Object.freeze(spatial);
  }
 }
 const fit=Object.freeze({points:Object.freeze(points.map(p=>Object.freeze(p))),startSide:a.side,endSide:b.side,startPosition:a.position,endPosition:b.position,
  ...(Math.abs(a.offset.x)+Math.abs(a.offset.y)>1e-9?{startOffset:Object.freeze(a.offset)}:{}),
  ...(Math.abs(b.offset.x)+Math.abs(b.offset.y)>1e-9?{endOffset:Object.freeze(b.offset)}:{}),color,widthPx:shaft,support,
  ...('filledTerminals' in selected.geometry&&selected.geometry.filledTerminals?{filledTerminals:true}:{}),
  ...(selected.geometry.fixedHeadCuts?{fixedHeadCuts:true}:{}),...(gradient?{paint:gradient}:{}),...(filledBody?{filledBody}:{})});
 provenRoutes.set(fit,{fromId:from.id,toId:to.id,direction:String(input.direction),widthPx:image.width,heightPx:image.height,
  pixels:source.rgba,digest:createHash('sha256').update(source.rgba).digest('hex'),checks:work.checks,
  nodes:[from,to].map(n=>({id:n.id,box:{...n.box}}))});
 return {fit:/** @type {Route} */(fit),reason:'source-route-confirmed'};
}
/** @param {unknown} fit @param {unknown} controls */
function isMeasuredSourceRoute(fit,controls){
 const proof=fit!==null&&typeof fit==='object'?provenRoutes.get(fit):undefined;
 if(!proof||!record(controls)||!['fromId','toId','direction','widthPx','heightPx'].every(key=>proof[/** @type {keyof typeof proof} */(key)]===controls[key]))return false;
 // Keep a canonical view of the original buffer, never a caller-supplied
 // snapshot or typed-array accessor. Aliases may change or detach those
 // bytes after measurement; neither native nor filled writers may then
 // compile the stale geometry/paint proof. Identity grants no extra ink.
 let source;
 try{source=sourceRaster({width:proof.widthPx,height:proof.heightPx,rgba:proof.pixels});}
 catch(error){if(error instanceof TypeError)return false;throw error;}
 return createHash('sha256').update(source.rgba).digest('hex')===proof.digest;
}
/** Read-only grouping context from the actual route measurement. A different
 * raster allocation, changed bytes or copied fit grants nothing. This exposes
 * only endpoint frames and the original terminal ledger, never ink ownership.
 * @param {unknown} fit @param {unknown} [image] */
function measuredSourceRouteGroupContext(fit,image){
 const proof=fit!==null&&typeof fit==='object'?provenRoutes.get(fit):undefined;
 if(!proof||!isMeasuredSourceRoute(fit,{fromId:proof.fromId,toId:proof.toId,direction:proof.direction,
  widthPx:proof.widthPx,heightPx:proof.heightPx}))return null;
 if(image!==undefined){
  const source=sourceRaster(image);
  if(source.width!==proof.widthPx||source.height!==proof.heightPx||source.rgba.buffer!==proof.pixels.buffer
   ||source.rgba.byteOffset!==proof.pixels.byteOffset||source.rgba.byteLength!==proof.pixels.byteLength)return null;
 }
 return {checks:proof.checks,widthPx:proof.widthPx,heightPx:proof.heightPx,nodes:proof.nodes.map(n=>({id:n.id,box:{...n.box}}))};
}
module.exports={measureSourceSceneRoute,isMeasuredSourceRoute,measuredSourceRouteGroupContext,sourceSceneRouteSite:site,sourceRouteInkColor:routeInkColor};
