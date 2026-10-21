// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {measuredSceneVisibleGapPaint}=require('./source-scene-visible-gap-compiler');
const {measuredSharedSceneRoutePaintGroups}=require('./source-shared-route-compiler');
const {freeformResidualMasks}=require('./residual-freeform-mask');
const fs=require('node:fs'),path=require('node:path');
const {readPng}=require('./png');
/** Replace prior unbound connector fragments only when their WHOLE geometry
 * belongs to one privately measured source component. Intersections, bounding
 * boxes, metadata and unions of different relations cannot authorize removal.
 * This is a candidate change; the ordinary render/semantic gates still apply.
 * @param {{image:import('./png').PngImage,slideSize:{widthPt:number,heightPt:number},
 * shapes:import('./source-scene-compiler').CompileInput['page']['shapes'],previous:object[],protectedMembers:Set<object>,
 * images?:import('./source-scene-compiler').CompileInput['page']['images'],root?:string}} input */
function replaceMeasuredSceneConnectors(input){
 if(!record(input)||!record(input.image)||!record(input.slideSize)||!list(input.shapes)||!list(input.previous)
  ||input.shapes.length>10000||input.previous.length>10000||!(input.protectedMembers instanceof Set)||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0)
  ||![input.image.width,input.image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||input.image.width*input.image.height>40000000)throw new TypeError('Scene connector replacement input is invalid');
 for(const item of [...input.shapes,...input.previous])if(!record(item)||!record(item.box)
  ||item.style!==undefined&&!record(item.style)||item.source!==undefined&&!record(item.source))throw new TypeError('Scene connector replacement shape is invalid');
 const {image,slideSize,shapes,previous,protectedMembers}=input;
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 const work={checks:0};
 /** @type {{item:typeof shapes[number],cells:Set<number>|null,heads?:import('./source-shared-route-output-paint').SharedPaintProof['heads']}[]} */
 const proofs=[...shapes.map(item=>({item,cells:measuredSceneVisibleGapPaint(image,item)})).filter(p=>p.cells),
  ...measuredSharedSceneRoutePaintGroups(image,shapes,work)];
 const referenced=new Set();
 for(const item of shapes)for(const key of ['startAnchor','endAnchor']){
  const anchor=item.style?.[key];if(record(anchor)&&typeof anchor.elementId==='string')referenced.add(anchor.elementId);
 }
 /** @param {Set<number>} cells @param {number} x @param {number} y */
 const owns=(cells,x,y)=>{
  // A two-pixel registration allowance covers the old observer's pixel-edge
  // convention, never a whole stroke envelope or an unrelated route segment.
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   if(++work.checks>4000000)return false;
   const xx=Math.round(x)+dx,yy=Math.round(y)+dy;
   if(xx>=0&&yy>=0&&xx<image.width&&yy<image.height&&cells.has(yy*image.width+xx))return true;
  }
  return false;
 };
 const removed=[];
 for(let index=shapes.length-1;index>=0;index--){
  const item=shapes[index];
  if(!item||!previous.includes(item)||protectedMembers.has(item)||referenced.has(item.id)
   ||item.source?.nativeRebuild!==true||item.source?.semanticNativeStructure!==true
   ||!record(item.box)||!record(item.style)||item.style.startAnchor||item.style.endAnchor
   ||['rotation','rotationDeg','rotate','flipH','flipV','strokeDashPattern'].some(k=>item.style?.[k]!==undefined))continue;
  const b=item.box;
  if(![b.x,b.y,b.w,b.h].every(Number.isFinite))continue;
  /** @type {{x:number,y:number}[]} */const points=[];
  if(item.type==='line'&&(!item.style.connectorType||item.style.connectorType==='straight')){
   const length=Math.hypot(b.w*sx,b.h*sy),count=Math.ceil(length*2);
   if(count<4||count>32768)continue;
   for(let i=0;i<=count;i++)points.push({x:(b.x+b.w*i/count)*sx,y:(b.y+b.h*i/count)*sy});
  }else if(item.type==='freeform'&&item.source?.connector===true&&item.style.stroke==='none'){
   const masks=freeformResidualMasks(item,image,{w:slideSize.widthPt,h:slideSize.heightPt});
   let area=0;for(const m of masks)area+=m.w*m.h;if(area<4||area>32768)continue;
   for(const m of masks)for(let y=m.y;y<m.y+m.h;y++)for(let x=m.x;x<m.x+m.w;x++)points.push({x,y});
  }else continue;
  for(const proof of proofs){
   const cells=proof.cells;if(!cells||!points.every(p=>owns(cells,p.x,p.y)))continue;
   // Opposing arrowheads are distinct relations even on the same shaft.
   const a=proof.item.box,dot=b.w*a.w+b.h*a.h;
   if(item.type==='line'&&['startArrow','endArrow'].some(key=>{
    const kind=item.style?.[key];if(!kind||kind==='none')return false;
    if(!proof.heads)return proof.item.style?.[dot>=0?key:key==='startArrow'?'endArrow':'startArrow']!==kind;
    const end=key==='endArrow',x=(b.x+(end?b.w:0))*sx,y=(b.y+(end?b.h:0))*sy;
    const dx=b.w*sx*(end?1:-1),dy=b.h*sy*(end?1:-1);
    return !proof.heads.some(head=>head.kind===kind&&Math.hypot(head.point.x-x,head.point.y-y)<=2
     &&head.vector.x*dx+head.vector.y*dy>0);
   }))continue;
   shapes.splice(index,1);removed.push({id:item.id,replacementId:proof.item.id});break;
  }
 }
 const removedImages=[];
 if(input.images!==undefined){
  if(!list(input.images)||input.images.length>10000||typeof input.root!=='string'||!path.isAbsolute(input.root))throw new TypeError('Scene connector crop controls are invalid');
  const realRoot=fs.realpathSync(input.root);
  for(let index=input.images.length-1;index>=0;index--){
   const item=input.images[index];
   if(!record(item)||!record(item.source)||item.source.nativeRebuild!==true||!record(item.box)
    ||!('assetPath' in item)||typeof item.assetPath!=='string'||path.isAbsolute(item.assetPath)
    ||!record(item.style??{})||Object.keys(item.style??{}).length)continue;
   const b=item.box;
   if(![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.w<=0||b.h<=0||b.w*sx*b.h*sy>262144)continue;
   const file=path.resolve(realRoot,item.assetPath),relative=path.relative(realRoot,file);
   if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))continue;
   const info=fs.lstatSync(file),resolved=fs.realpathSync(file),realRelative=path.relative(realRoot,resolved);
   if(!info.isFile()||info.isSymbolicLink()||realRelative.startsWith('..')||path.isAbsolute(realRelative))continue;
   const raster=readPng(file,{maxFileBytes:12*1024*1024,maxPixels:262144});
   // No scaling/rotation or box-only ownership: inspect every nontransparent
   // pixel of the actual asset at its original source registration.
   if(Math.abs(raster.width-b.w*sx)>0.01||Math.abs(raster.height-b.h*sy)>0.01
    ||Math.abs(b.x*sx-Math.round(b.x*sx))>0.01||Math.abs(b.y*sy-Math.round(b.y*sy))>0.01)continue;
   const paint=[];
   for(let n=0;n<raster.width*raster.height;n++)if((raster.rgba[n*4+3]??0)>=32)paint.push({x:Math.round(b.x*sx)+n%raster.width,y:Math.round(b.y*sy)+Math.floor(n/raster.width)});
   if(paint.length<4||paint.length>32768)continue;
   for(const proof of proofs){const cells=proof.cells;
    if(!cells||!paint.every(p=>owns(cells,p.x,p.y)))continue;
    input.images.splice(index,1);removedImages.push({id:item.id,replacementId:proof.item.id});break;
   }
  }
 }
 return {removed,removedImages,checks:work.checks};
}
module.exports={replaceMeasuredSceneConnectors};
