// @ts-check
'use strict';
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {measuredScenePortBodyMask}=require('./source-scene-port-evidence');
const {sourceVisibleGapDiagonalProfile}=require('./source-visible-gap-diagonal-profile');
const {sourceFilledArrowProfile}=require('./source-filled-arrow-profile');
const {makeEdgeConnectedBackgroundTransparent}=require('./edge-background-alpha');
const {residualInkFringe}=require('./residual-ink-components');
const {sceneTextEndpointObservationMask,hasSceneTextEndpoint,sceneTextEndpointHasMemberBox}=require('./source-scene-text-endpoints');
const {createSourceObstacleProbe}=require('./source-obstacle-probe');
const {sourceVisibleDiagonalDashProfile,sourceVisibleShearedDashProfile}=require('./source-visible-diagonal-dash-profile');
const {sourceVisibleCrossingDashProfile}=require('./source-visible-crossing-dash-profile');
/** Internal observer, called only after the public boundary parsed all inputs.
 * The proposal selects a bounded source window, never paint or attachment.
 * Diagonal logical sites require a whole original component and blank rays
 * ending on BOTH private source bodies. No bounding-box port is sufficient.
 * @param {{image:import('./png').PngImage,from:import('./source-scene-visible-gap').Node,to:import('./source-scene-visible-gap').Node,
 * direction:string,texts:import('./source-scene-plan').Box[],others:import('./source-scene-plan').Box[],budget:{used:number},shaft:import('./source-scene-plan').Box,sourceInk?:boolean}} input
 * @returns {{fit:import('./source-scene-visible-gap').Fit,cells:number[],work:{checks:number}}|null} */
function measureDiagonalVisibleGap({image,from,to,direction,texts,others,budget,shaft,sourceInk=false}){
 const a=from.box,b=to.box,dx=b.x+b.w/2-a.x-a.w/2,dy=b.y+b.h/2-a.y-a.h/2;
 if(sourceInk?Math.max(Math.abs(dx),Math.abs(dy))<8:Math.abs(dx)<8||Math.abs(dy)<8)return null;
 let horizontal=Math.abs(dx)>=Math.abs(dy);
 const x=Math.floor(Math.min(a.x,b.x,shaft.x-12)),y=Math.floor(Math.min(a.y,b.y,shaft.y-12));
 const right=Math.ceil(Math.max(a.x+a.w,b.x+b.w,shaft.x+shaft.w+12)),bottom=Math.ceil(Math.max(a.y+a.h,b.y+b.h,shaft.y+shaft.h+12));
 const window={x,y,w:right-x,h:bottom-y},area=window.w*window.h,work={checks:0};
 if(x<0||y<0||right>image.width||bottom>image.height||area>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const logical=hasSceneTextEndpoint(image,from.portFrame,a)||hasSceneTextEndpoint(image,to.portFrame,b);
 const ownA=measuredScenePortBodyMask(image,from.portFrame,a,window,work)??sceneTextEndpointObservationMask(image,from.portFrame,a,window,work);
 const ownB=measuredScenePortBodyMask(image,to.portFrame,b,window,work)??sceneTextEndpointObservationMask(image,to.portFrame,b,window,work);
 if(!ownA||!ownB)return null;
 const raster=readSceneFillRaster(image,window,budget),owned=new Uint8Array(area),mask=new Uint8Array(area);
 for(let i=0;i<area;i++){
  if((raster.rgba[i*4+3]??0)<240)return null;
  owned[i]=ownA[i]||ownB[i]?1:0;
 }
 // Four distinct, original exterior pixels on BOTH sides of the proposed
 // diagonal. Rectangle corners can lie on the endpoint icons themselves.
 // Keep the existing 18-channel agreement, no inferred background or search
 // for a convenient color. The proposal still grants no foreground cells.
 // A model's oversized shaft envelope can extend through an admitted end
 // body. It cannot turn that body's interior into a background sample. For
 // aligned disjoint endpoints, nominate the four exterior probes on the
 // actual gap interval instead. Observation, component discovery, body masks
 // and the complete original source certificate below remain unchanged.
 let probe=shaft;
 /** @type {boolean|undefined} */let aligned;
 if(sourceInk){
  const x0=Math.max(a.x,b.x),x1=Math.min(a.x+a.w,b.x+b.w),y0=Math.max(a.y,b.y),y1=Math.min(a.y+a.h,b.y+b.h);
  if(x1>x0&&(a.y+a.h<b.y||b.y+b.h<a.y)){
   const low=Math.max(shaft.y,a.y<b.y?a.y+a.h:b.y+b.h),high=Math.min(shaft.y+shaft.h,a.y<b.y?b.y:a.y);
   if(high>low){probe={...shaft,y:low,h:high-low};aligned=false;}
  }else if(y1>y0&&(a.x+a.w<b.x||b.x+b.w<a.x)){
   const low=Math.max(shaft.x,a.x<b.x?a.x+a.w:b.x+b.w),high=Math.min(shaft.x+shaft.w,a.x<b.x?b.x:a.x);
   if(high>low){probe={...shaft,x:low,w:high-low};aligned=true;}
  }
 }
 const sign=dx*dy>0?1:-1,hypotenuse=Math.hypot(probe.w,probe.h);
 /** @type {number[]} */const samples=[];
 for(const fraction of [.35,.65])for(const side of [-1,1]){
  const bx=probe.x+probe.w*fraction,by=probe.y+probe.h*(sign>0?fraction:1-fraction);
  const nx=-side*sign*probe.h/hypotenuse,ny=side*probe.w/hypotenuse;
  // A wide filled head can cover the old fixed offset. For joint source-ink
  // observation place samples beyond the COMPLETE proposed shaft envelope,
  // along the same four normals. There is no search by observed color.
  const outside=sourceInk?Math.min((nx>0?probe.x+probe.w-bx:probe.x-bx)/nx,(ny>0?probe.y+probe.h-by:probe.y-by)/ny):0;
  // A half-open raster's last positive padding cell is ceil(end)+11.
  // Sampling end+12 would leave the ORIGINAL 12px observation altogether.
  const px=Math.round(aligned===undefined?bx+nx*(outside+12):aligned?probe.x+probe.w*fraction:side>0?Math.ceil(probe.x+probe.w)+11:Math.floor(probe.x)-12);
  const py=Math.round(aligned===undefined?by+ny*(outside+12):aligned?side>0?Math.ceil(probe.y+probe.h)+11:Math.floor(probe.y)-12:probe.y+probe.h*fraction);
  if(px<x||py<y||px>=right||py>=bottom)return null;
  const n=(py-y)*window.w+px-x;if(owned[n]||samples.includes(n))return null;samples.push(n);
 }
 const colors=samples.map(n=>[raster.rgba[n*4]??0,raster.rgba[n*4+1]??0,raster.rgba[n*4+2]??0]);
 const background=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 if(colors.some(p=>p.some((v,c)=>Math.abs(v-(background[c]??0))>18)))return null;
 // Keep the original contrast core for geometry. A crop's soft matte can
 // include node/background fringes as new connector branches. Antialiased
 // paint is assigned separately below, by the original multi-owner fringe
 // observer, and cannot change the component's structural certificate.
 work.checks+=sourceInk?area*8:0;if(work.checks>4000000)return null;
 const matte=sourceInk?makeEdgeConnectedBackgroundTransparent(raster):null;
 for(let i=0;i<area;i++)mask[i]=!owned[i]&&background.some((v,c)=>Math.abs(v-(raster.rgba[i*4+c]??0))>=42)?1:0;
 /** @param {number} n */const point=n=>({x:n%window.w+window.x,y:Math.floor(n/window.w)+window.y});
 /** @param {number} n */const inProposal=n=>{const p=point(n);return p.x>=shaft.x-12&&p.x<=shaft.x+shaft.w+12&&p.y>=shaft.y-12&&p.y<=shaft.y+shaft.h+12;};
 /** The original shaft hint selects identity; padded scanning space must not
  * nominate a neighboring detached icon detail as a second connector.
  * @param {number} n */const seedProposal=n=>{const p=point(n);return !sourceInk?inProposal(n):p.x>=shaft.x&&p.x<=shaft.x+shaft.w&&p.y>=shaft.y&&p.y<=shaft.y+shaft.h;};
 // The already bound endpoint's OCR rectangle is its logical destination,
 // not an unrelated caption obstruction. It remains excluded from shaft ink;
 // no other text rectangle, including an overlapping label, is removed.
 const obstacles=[...texts,...others].filter(t=>![from,to].some(n=>sceneTextEndpointHasMemberBox(image,n.portFrame,n.box,t)));
 const obstructed=createSourceObstacleProbe(obstacles,window,work);
 const seen=new Uint8Array(area),candidates=[];
 for(let seed=0;seed<area;seed++)if(mask[seed]&&!seen[seed]&&seedProposal(seed)){
  const cells=[seed];seen[seed]=1;let bounded=true;
  for(let k=0;k<cells.length;k++){
   const n=cells[k]??0,xx=n%window.w,yy=Math.floor(n/window.w);
    // A proposal seeds discovery; it cannot clip an observed component. The
    // joint path audits the WHOLE component inside the bounded source window,
    // then proves its profile, blank corridors and both private endpoints.
    if(!sourceInk&&!inProposal(n)||xx===0||yy===0||xx===window.w-1||yy===window.h-1||obstructed(point(n)))bounded=false;
   for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    if(++work.checks>4000000)return null;const nx=xx+ox,ny=yy+oy,index=ny*window.w+nx;
    if(nx>=0&&ny>=0&&nx<window.w&&ny<window.h&&mask[index]&&!seen[index]){seen[index]=1;cells.push(index);}
   }
  }
  if(cells.length>32768)return null;
  const along=cells.map(n=>horizontal?n%window.w:Math.floor(n/window.w));
  if(Math.max(...along)-Math.min(...along)<8)continue;
  // Only a COMPLETE component contained in this observation can nominate a
  // connector. All other original ink remains in mask and must still pass
  // the blank-corridor audit; it receives no exclusion or paint receipt.
  // Two complete components (including a broken shaft) remain ambiguous.
  if(bounded)candidates.push({cells,bounded});
 }
 /** @type {ReturnType<typeof sourceVisibleDiagonalDashProfile>} */
 let dash=direction==='undirected'?sourceVisibleShearedDashProfile({components:candidates,width:window.w,rgba:raster.rgba,horizontal,
  increasing:horizontal?dx>0:dy>0,sign:dx*dy,background,work}):null;
 if(!dash&&direction==='undirected'&&candidates.length>1){
  const axis=!horizontal;
  dash=sourceVisibleShearedDashProfile({components:candidates,width:window.w,rgba:raster.rgba,horizontal:axis,
   increasing:axis?dx>0:dy>0,sign:dx*dy,background,work});
  if(dash)horizontal=axis;
 }
 if(!dash&&direction==='undirected')for(const axis of [horizontal,!horizontal]){
  dash=sourceVisibleDiagonalDashProfile({components:candidates,width:window.w,rgba:raster.rgba,horizontal:axis,
   increasing:axis?dx>0:dy>0,sign:dx*dy,background,work});
  if(dash){horizontal=axis;break;}
 }
 if(!dash&&direction==='undirected')dash=sourceVisibleCrossingDashProfile({components:candidates,width:window.w,rgba:raster.rgba,horizontal,
  increasing:horizontal?dx>0:dy>0,sign:dx*dy,background,work});
 if(!dash&&(candidates.length!==1||!candidates[0]?.bounded))return null;
 const cells=dash?.cells??candidates[0]?.cells;if(!cells)return null;
 /** @type {ReturnType<typeof sourceVisibleGapDiagonalProfile>|ReturnType<typeof sourceFilledArrowProfile>|typeof dash} */
 let profile=dash??sourceVisibleGapDiagonalProfile({cells,width:window.w,rgba:raster.rgba,horizontal,direction,increasing:horizontal?dx>0:dy>0,work});
 // Node centers do not determine the shaft tangent. Test both ORIGINAL
 // column systems on the same whole component, sharing the work cap.
 if(!profile){
  horizontal=!horizontal;
  profile=sourceVisibleGapDiagonalProfile({cells,width:window.w,rgba:raster.rgba,horizontal,direction,increasing:horizontal?dx>0:dy>0,work});
 }
 /** @type {ReturnType<typeof sourceFilledArrowProfile>} */let filled=null;
 if(!profile){
  // Endpoint fringe can affect classification only within the existing 2px
  // attachment distance. It remains in the native path and exact paint
  // receipt; no branch is erased, repaired or assigned a fabricated owner.
  const geometryCells=cells.filter(n=>{
   const xx=n%window.w,yy=Math.floor(n/window.w);
   for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
    if(++work.checks>4000000)return false;
    if(ox*ox+oy*oy>4)continue;const nx=xx+ox,ny=yy+oy,index=ny*window.w+nx;
    if(nx>=0&&ny>=0&&nx<window.w&&ny<window.h&&owned[index])return false;
   }
   return true;
  });
  if(work.checks>4000000)return null;
  for(const axis of [horizontal,!horizontal]){
   filled=sourceFilledArrowProfile({cells,geometryCells,width:window.w,rgba:raster.rgba,horizontal:axis,direction,increasing:axis?dx>0:dy>0,work});
   if(filled){horizontal=axis;break;}
  }
  profile=filled;
 }
 if(!profile)return null;
 const increasing=horizontal?dx>0:dy>0;
 const local=(/** @type {number} */along)=>horizontal?{x:along,y:profile.slope*along+profile.intercept}:{x:profile.slope*along+profile.intercept,y:along};
 const startAlong=increasing?profile.lo:profile.hi,endAlong=increasing?profile.hi:profile.lo;
 const selected=new Set(cells),radius=Math.ceil(profile.widthPx/2);
 /** @param {number} along @param {number} sign @param {Uint8Array} target */
 const corridor=(along,sign,target)=>{
  for(let step=1;step<=512;step++){
   const p=local(along+step*sign),xx=Math.round(p.x),yy=Math.round(p.y),index=yy*window.w+xx;
   if(xx<0||yy<0||xx>=window.w||yy>=window.h)return null;
   for(let d=-radius;d<=radius;d++)if(obstructed({x:xx+window.x+(horizontal?0:d),y:yy+window.y+(horizontal?d:0)}))return null;
   if(target[index])return {point:{x:xx+window.x,y:yy+window.y},gap:step};
   // The same 2px source attachment allowance applies to a rasterized
   // oblique contour. Find an ACTUAL private body cell, never a box edge.
   if(filled)for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
    if(++work.checks>4000000)return null;
    if(ox*ox+oy*oy>4)continue;const nx=xx+ox,ny=yy+oy;
    if(nx>=0&&ny>=0&&nx<window.w&&ny<window.h&&target[ny*window.w+nx])
     return {point:{x:nx+window.x,y:ny+window.y},gap:step};
   }
   for(let offset=-radius;offset<=radius;offset++){
    if(++work.checks>4000000)return null;
    const tx=xx+(horizontal?0:offset),ty=yy+(horizontal?offset:0),n=ty*window.w+tx;
    if(tx<0||ty<0||tx>=window.w||ty>=window.h||obstructed({x:tx+window.x,y:ty+window.y})||owned[n]&&!target[n]||mask[n]&&!selected.has(n))return null;
   }
  }
  return null;
 };
 const startContact=corridor(startAlong,increasing?-1:1,ownA),endContact=corridor(endAlong,increasing?1:-1,ownB);
 if(!startContact||!endContact||!sourceInk&&Math.max(startContact.gap,endContact.gap)<=2)return null;
 const sp=local(startAlong),ep=local(endAlong),start={x:sp.x+window.x,y:sp.y+window.y},end={x:ep.x+window.x,y:ep.y+window.y};
 /** @param {typeof a} box @param {{x:number,y:number}} p @param {string} fallback */
 const side=(box,p,fallback)=>!filled?fallback:p.x<box.x?'left':p.x>box.x+box.w?'right':p.y<box.y?'top':p.y>box.y+box.h?'bottom':fallback;
 const startSide=side(a,start,horizontal?(increasing?'right':'left'):(increasing?'bottom':'top'));
 const endSide=side(b,end,horizontal?(increasing?'left':'right'):(increasing?'top':'bottom'));
 /** @param {typeof a} box @param {{x:number,y:number}} contact @param {string} selected */
 const site=(box,contact,selected)=>selected==='left'||selected==='right'
  ?{position:(contact.y-box.y)/box.h,point:{x:selected==='right'?box.x+box.w:box.x,y:contact.y}}
  :{position:(contact.x-box.x)/box.w,point:{x:contact.x,y:selected==='bottom'?box.y+box.h:box.y}};
 const sa=site(a,startContact.point,startSide),sb=site(b,endContact.point,endSide);
 const startPosition=sa.position,endPosition=sb.position,anchorA=sa.point,anchorB=sb.point;
 if([startPosition,endPosition].some(p=>p<0||p>1))return null;
 // The native external-site contract has an outward normal. A concave
 // source body may contact a ray inside its envelope; do not emit a site
 // that the writer would reject or silently turn into another attachment.
 const startInternal=Boolean(filled&&start.x>=a.x&&start.y>=a.y&&start.x<=a.x+a.w&&start.y<=a.y+a.h);
 const endInternal=Boolean(filled&&end.x>=b.x&&end.y>=b.y&&end.x<=b.x+b.w&&end.y<=b.y+b.h);
 /** @param {{x:number,y:number}} p @param {{x:number,y:number}} anchor @param {string} selected */
 const outward=(p,anchor,selected)=>selected==='right'?p.x>=anchor.x:selected==='left'?p.x<=anchor.x:selected==='bottom'?p.y>=anchor.y:p.y<=anchor.y;
 if(!startInternal&&!outward(start,anchorA,startSide)||!endInternal&&!outward(end,anchorB,endSide))return null;
 const fit={start,end,startSide,endSide,startPosition,endPosition,startOffset:{x:start.x-anchorA.x,y:start.y-anchorA.y},endOffset:{x:end.x-anchorB.x,y:end.y-anchorB.y},
  color:profile.color,widthPx:profile.widthPx,support:profile.support,diagonal:true,
  ...('strokeDashPattern' in profile&&typeof profile.strokeDashPattern==='string'?{strokeDashPattern:profile.strokeDashPattern}:{}),
  ...(!logical&&sourceInk&&Math.max(startContact.gap,endContact.gap)<=2?{physical:true}:{}),
  ...(filled?{startInternal,endInternal,sourcePath:{...filled.sourcePath,box:{...filled.sourcePath.box,x:filled.sourcePath.box.x+window.x,y:filled.sourcePath.box.y+window.y}}}:{})};
 let paintCells=cells;
 if(matte){
  work.checks+=area*8;if(work.checks>4000000)return null;
  const candidates=new Uint8Array(area),solid=new Uint8Array(area),selectedInk=new Uint8Array(area);
  for(let i=0;i<area;i++){candidates[i]=(matte.rgba[i*4+3]??0)>=32?1:0;solid[i]=background.some((v,c)=>Math.abs(v-(raster.rgba[i*4+c]??0))>=42)?1:0;}
  for(const cell of cells)selectedInk[cell]=1;
  const fringe=residualInkFringe(candidates,solid,window.w,selectedInk);paintCells=[];
  for(let i=0;i<area;i++)if(fringe[i]===1&&!owned[i]&&!obstructed(point(i)))paintCells.push(i);
  if(work.checks>4000000)return null;
 }
 return {fit,cells:paintCells.map(n=>(Math.floor(n/window.w)+window.y)*image.width+n%window.w+window.x),work};
}
module.exports={measureDiagonalVisibleGap};
