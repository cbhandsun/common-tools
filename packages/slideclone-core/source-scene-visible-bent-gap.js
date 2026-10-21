// @ts-check
'use strict';
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {hasSceneTextEndpoint,sceneTextEndpointProjectedPort,sceneTextEndpointHasMemberBox}=require('./source-scene-text-endpoints');
const {sourceBentArrowProfile}=require('./source-bent-arrow-profile');
const {makeEdgeConnectedBackgroundTransparent}=require('./edge-background-alpha');
const {residualInkFringe}=require('./residual-ink-components');
const {createSourceObstacleProbe}=require('./source-obstacle-probe');
/** A separate compound consumer for a single orthogonal bend between logical
 * text endpoints. Keep the physical thin-route observer and its head/width
 * limits unchanged. This helper is called after the public boundary parses
 * all controls. It returns only source-owned ink, never blank corridor cells.
 * @param {{image:import('./png').PngImage,from:import('./source-scene-visible-gap').Node,to:import('./source-scene-visible-gap').Node,
 * direction:string,texts:import('./source-scene-plan').Box[],others:import('./source-scene-plan').Box[],budget:{used:number},
 * shaft:import('./source-scene-plan').Box,program:import('./source-scene-path-program').PathProgram}} input
 * @returns {{fit:import('./source-scene-visible-gap').Fit,cells:number[]}|null} */
function measureVisibleBentGap({image,from,to,direction,texts,others,budget,shaft,program}){
 if(direction!=='forward'||program.vertices.length!==3||!hasSceneTextEndpoint(image,from.portFrame,from.box)
  ||!hasSceneTextEndpoint(image,to.portFrame,to.box))return null;
 const [a,b,c]=program.vertices;if(!a||!b||!c||a.y!==b.y||b.x!==c.x||a.x===b.x||b.y===c.y)return null;
 const increasingX=b.x>a.x,increasingY=c.y>b.y;
 const x=Math.max(0,Math.floor(shaft.x)-12),y=Math.max(0,Math.floor(shaft.y)-12);
 const window={x,y,w:Math.min(image.width,Math.ceil(shaft.x+shaft.w)+12)-x,h:Math.min(image.height,Math.ceil(shaft.y+shaft.h)+12)-y};
 const area=window.w*window.h,work={checks:0};
 if(area>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const obstacles=[...texts,...others].filter(t=>![from,to].some(n=>sceneTextEndpointHasMemberBox(image,n.portFrame,n.box,t)));
 const obstacleProbe=createSourceObstacleProbe(obstacles,window,work);
 /** @param {number} x @param {number} y */const obstructed=(x,y)=>obstacleProbe({x,y});
 const raster=readSceneFillRaster(image,window,budget);
 const corners=[0,window.w-1,area-window.w,area-1];
 const colors=corners.map(n=>[raster.rgba[n*4]??0,raster.rgba[n*4+1]??0,raster.rgba[n*4+2]??0]);
 const background=colors[0];if(!background||colors.some(p=>p.some((v,k)=>Math.abs(v-(background[k]??0))>18)))return null;
 const mask=new Uint8Array(area),seen=new Uint8Array(area);
 for(let i=0;i<area;i++){
  if(++work.checks>4000000||(raster.rgba[i*4+3]??0)<240)return null;
  mask[i]=background.some((v,k)=>Math.abs(v-(raster.rgba[i*4+k]??0))>=42)?1:0;
 }
 const components=[];
 work.checks+=area;if(work.checks>4000000)return null;
 for(let seed=0;seed<area;seed++)if(mask[seed]&&!seen[seed]){
  const xx=seed%window.w+x,yy=Math.floor(seed/window.w)+y;
  if(xx<shaft.x||xx>shaft.x+shaft.w||yy<shaft.y||yy>shaft.y+shaft.h)continue;
  const cells=[seed];seen[seed]=1;
  for(let k=0;k<cells.length;k++){
   const n=cells[k];if(n===undefined)return null;const px=n%window.w,py=Math.floor(n/window.w);
   if(!px||!py||px===window.w-1||py===window.h-1||obstructed(px+x,py+y)||cells.length>32768)return null;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(++work.checks>4000000)return null;const nx=px+dx,ny=py+dy,j=ny*window.w+nx;
    if(nx>=0&&nx<window.w&&ny>=0&&ny<window.h&&mask[j]&&!seen[j]){seen[j]=1;cells.push(j);}
   }
  }
  components.push(cells);
 }
 if(components.length!==1)return null;const cells=components[0];if(!cells)return null;
 const profile=sourceBentArrowProfile({cells,width:window.w,rgba:raster.rgba,increasingX,increasingY,work});if(!profile)return null;
 const start={x:profile.start.x+x,y:profile.start.y+y},end={x:profile.end.x+x,y:profile.end.y+y};
 const corner={x:profile.corner.x+x,y:profile.corner.y+y};
 // Refine terminals from the COMPLETE source component in the original
 // shaft envelope, as for straight visible gaps. The model's terminal pixel
 // guesses are not ground truth. Its turn must still identify this bend.
 if(Math.hypot(corner.x-b.x,corner.y-b.y)>1.5||cells.some(n=>{
  const px=n%window.w+x,py=Math.floor(n/window.w)+y;
  return px<Math.floor(shaft.x)-2||px>=Math.ceil(shaft.x+shaft.w)+2||py<Math.floor(shaft.y)-2||py>=Math.ceil(shaft.y+shaft.h)+2;
 }))return null;
 const startSide=increasingX?'right':'left',endSide=increasingY?'top':'bottom';
 const pa=sceneTextEndpointProjectedPort(image,from.portFrame,from.box,start.y,startSide);
 const pb=sceneTextEndpointProjectedPort(image,to.portFrame,to.box,end.x,endSide);
 if(!pa||!pb)return null;
 const startGap=(start.x-pa.x)*(increasingX?1:-1),endGap=(pb.y-end.y)*(increasingY?1:-1);
 if(startGap<0||endGap<0||Math.max(startGap,endGap)<=2||startGap>512||endGap>512)return null;
 // Independently read and certify both whole blank strips up to their
 // PRIVATE logical frames. No union of large text envelopes is scanned.
 let unitPixels=area;const radius=Math.ceil(profile.widthPx/2);
 /** @param {{x:number,y:number}} p @param {{x:number,y:number}} q @param {boolean} horizontal */
 const corridor=(p,q,horizontal)=>{
  const lo=Math.ceil(Math.min(horizontal?p.x:p.y,horizontal?q.x:q.y))+1;
  const hi=Math.floor(Math.max(horizontal?p.x:p.y,horizontal?q.x:q.y))-1;if(hi<lo)return true;
  const axis=Math.round(horizontal?p.y:p.x),box=horizontal?{x:lo,y:axis-radius,w:hi-lo+1,h:radius*2+1}:{x:axis-radius,y:lo,w:radius*2+1,h:hi-lo+1};
  unitPixels+=box.w*box.h;
  if(box.x<0||box.y<0||box.x+box.w>image.width||box.y+box.h>image.height||unitPixels>262144
   ||budget.used+sceneFillRasterReadCost(image,box,budget)>4000000)return false;
  const strip=readSceneFillRaster(image,box,budget);
  let matching=0;
  for(let i=0;i<box.w*box.h;i++){
   if(++work.checks>4000000||obstructed(box.x+i%box.w,box.y+Math.floor(i/box.w))||(strip.rgba[i*4+3]??0)<240
    ||background.some((v,k)=>Math.abs(v-(strip.rgba[i*4+k]??0))>=42))return false;
   if(background.every((v,k)=>Math.abs(v-(strip.rgba[i*4+k]??0))<=18))matching++;
  }
  return matching/(box.w*box.h)>=.9;
 };
 if(!corridor(start,pa,true)||!corridor(end,pb,false)||work.checks>4000000)return null;
 const startPosition=(start.y-from.box.y)/from.box.h,endPosition=(end.x-to.box.x)/to.box.w;
 if([startPosition,endPosition].some(n=>n<0||n>1))return null;
 // Bind antialias paint with the same multi-owner source observer used by
 // straight filled gaps. Nearby independent ink cannot donate its fringe.
 work.checks+=area*16;if(work.checks>4000000)return null;
 const matte=makeEdgeConnectedBackgroundTransparent(raster),candidates=new Uint8Array(area),selected=new Uint8Array(area);
 for(let i=0;i<area;i++)candidates[i]=(matte.rgba[i*4+3]??0)>=32?1:0;
 for(const n of cells)selected[n]=1;
 const fringe=residualInkFringe(candidates,mask,window.w,selected),paintCells=[];
 for(let i=0;i<area;i++)if(fringe[i]===1&&!obstructed(i%window.w+x,Math.floor(i/window.w)+y))paintCells.push(i);
 if(work.checks>4000000)return null;
 return {fit:{start,end,startSide,endSide,startPosition,endPosition,startOffset:{x:start.x-pa.x,y:start.y-pa.y},endOffset:{x:end.x-pb.x,y:end.y-pb.y},
  color:profile.color,widthPx:profile.widthPx,support:profile.support,connectorType:'elbow-2',programMaxErrorPx:profile.maxCenterlineErrorPx},
 cells:paintCells.map(n=>(Math.floor(n/window.w)+y)*image.width+n%window.w+x)};
}
module.exports={measureVisibleBentGap};
