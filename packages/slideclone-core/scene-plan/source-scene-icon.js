// @ts-check
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {cropPng,writePng}=require("../png");
const {admitSourcePictorialCrop}=require("./source-pictorial-crop-admission");
const {makeEdgeConnectedBackgroundTransparent}=require("./edge-background-alpha");
const {admitTightGraphicCrop,buildMinimumUnitCropEvidence}=require("../quality/graphic-crop-policy");
const {residualInkFringe}=require("./residual-ink-components");
const {sceneIconInkTextCollisions}=require("./source-scene-icon-ownership");
const {readSceneFillRaster}=require('./source-scene-fill-raster-cache');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {sceneSourceTextPointsOwned}=require('./source-scene-glyph-occlusion');
const {matteSceneParametricBackdrop}=require('./source-scene-parametric-surface');
const {deferIconBoundaryComponent}=require('./source-scene-icon-boundary-partition');
const {sceneIconSemanticPointsSeparate}=require('./source-scene-icon-semantic-review');
/** @typedef {import("./source-scene-plan").Box} Box */
/** @param {Box} a @param {Box} b */
function intersects(a,b){return Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);}
/** @param {{image:import("../png").PngImage,box:Box,id:string,regionId:string,root:string,slideSize:{widthPt:number,heightPt:number},textBoxes:{text:string,box:Box}[],budget?:{used:number},searchBox?:unknown,glyphOcclusion?:unknown,backdrop?:unknown,boundaryPartition?:unknown,semanticReview?:unknown}} input */
function measureSceneIconDetailed(input) {return isolateSceneIconDetailed(input,false);}
/** Source isolation for native reconstruction has no raster-retention grant.
 * The native compiler must still emit a complete bounded representation.
 * @param {Parameters<typeof measureSceneIconDetailed>[0]} input */
function measureSceneNativeIconDetailed(input) {return isolateSceneIconDetailed(input,true);}
/** @param {Parameters<typeof measureSceneIconDetailed>[0]} input */
function measureScenePictorialCropDetailed(input){return isolateSceneIconDetailed(input,true,true);}
/** @param {Parameters<typeof measureSceneIconDetailed>[0]} input @param {boolean} nativeOnly @param {boolean} [sourceCrop] */
function isolateSceneIconDetailed({image,box,id,regionId,slideSize,textBoxes,budget={used:0},searchBox,glyphOcclusion,backdrop,boundaryPartition,semanticReview},nativeOnly,sourceCrop=false) {
  /** @param {string} reason @returns {{measurement:null,reason:string}} */
  const reject=reason=>({measurement:null,reason});
  // Human identity can support native source measurement only. It confers no
  // permission to retain a raster through either legacy or pictorial crops.
  if(!nativeOnly||sourceCrop)semanticReview=undefined;
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id)||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(regionId))throw new TypeError("Scene icon identity is invalid");
  const px=sceneIconSearchWindow(image,box,searchBox);
  textBoxes=sourceSceneTextBoxes(textBoxes,image,slideSize);
  const textPixels=textBoxes.map(t=>({x:t.box.x*image.width/slideSize.widthPt,y:t.box.y*image.height/slideSize.heightPt,
    w:t.box.w*image.width/slideSize.widthPt,h:t.box.h*image.height/slideSize.heightPt}));
  // A caption rectangle can overlap an icon's empty space. Keep the complete
  // original padding window: only observed foreground cells can establish
  // text collision. Pre-clipping here hides the component boundary needed
  // to prove that the pictorial unit is complete.
  if(px.w*px.h>262144||px.w<6||px.h<6)return reject('icon-source-window');
  const raster=readSceneFillRaster(image,px,budget),crop={...raster,rgba:Buffer.from(raster.rgba)};
  const transparent=makeEdgeConnectedBackgroundTransparent(backdrop===undefined?crop:matteSceneParametricBackdrop(backdrop,image,budget,px,crop));
  // Nearby caption fringes can sit outside the OCR rectangle. Authorize only
  // isolated components seeded inside the icon hint; a seeded component that
  // reaches the search boundary is clipped and cannot be materialized.
  const area=px.w*px.h,candidates=new Uint8Array(area),solid=new Uint8Array(area),owned=new Uint8Array(area),seen=new Uint8Array(area),queue=new Int32Array(area);
  let identityDistance=Infinity,identityAccepted=false,identityReason='icon-source-empty';
  for(let i=0;i<area;i++){const alpha=transparent.rgba[i*4+3]??0;candidates[i]=alpha>=32?1:0;solid[i]=alpha>=64?1:0;}
  for(let i=0;i<area;i++){
    if(!solid[i]||seen[i])continue;
    let head=0,tail=1,seeded=false,boundary=false,minX=px.w,minY=px.h,maxX=0,maxY=0,componentDistance=Infinity;queue[0]=i;seen[i]=1;
    while(head<tail){
      const j=queue[head++]??0,cx=j%px.w,cy=Math.floor(j/px.w),sx=px.x+cx,sy=px.y+cy;
      if(sx>=box.x&&sx<box.x+box.w&&sy>=box.y&&sy<box.y+box.h){
        seeded=true;componentDistance=Math.min(componentDistance,(sx+.5-box.x-box.w/2)**2+(sy+.5-box.y-box.h/2)**2);
      }
      boundary ||= cx===0||cy===0||cx===px.w-1||cy===px.h-1;
      minX=Math.min(minX,cx);minY=Math.min(minY,cy);maxX=Math.max(maxX,cx);maxY=Math.max(maxY,cy);
      for(const n of [cx?j-1:-1,cx<px.w-1?j+1:-1,cy?j-px.w:-1,cy<px.h-1?j+px.w:-1]){
        if(n<0||!solid[n]||seen[n])continue;seen[n]=1;queue[tail++]=n;
      }
    }
    // The hint may include a nearby caption. Reject the complete connected
    // component owned by text, rather than cutting its pixels or rejecting
    // an independent icon. Final crop admission still forbids text overlap.
    const component={x:px.x+minX,y:px.y+minY,w:maxX-minX+1,h:maxY-minY+1};
    const closest=componentDistance<identityDistance,tied=seeded&&componentDistance===identityDistance;
    if(closest){identityDistance=componentDistance;identityAccepted=false;identityReason='icon-source-empty';}
    if(!seeded)continue;
    const textCollision=textPixels.some(t=>{
      if(!intersects(component,t))return false;
      /** @type {{x:number,y:number}[]} */const overlap=[];
      for(let k=0;k<tail;k++){
        const j=queue[k]??0,sx=px.x+j%px.w,sy=px.y+Math.floor(j/px.w);
        if(sx>=Math.floor(t.x)&&sx<Math.ceil(t.x+t.w)&&sy>=Math.floor(t.y)&&sy<Math.ceil(t.y+t.h)){
          overlap.push({x:sx,y:sy});
        }
      }
      return overlap.length>0&&!sceneIconSemanticPointsSeparate(semanticReview,image,budget,t,overlap,id,regionId,box)
        &&(glyphOcclusion===undefined||sceneSourceTextPointsOwned(glyphOcclusion,image,budget,t,overlap)!==false);
    });
    if(textCollision){if(closest||tied)identityReason='icon-source-text';if(tied)identityAccepted=false;continue;}
    if(seeded&&boundary){
      if(nativeOnly&&deferIconBoundaryComponent(boundaryPartition,image,px,queue,tail))continue;
      return reject('icon-source-clipped-component');
    }
    if(seeded){if(closest)identityAccepted=true;for(let j=0;j<tail;j++)owned[queue[j]??0]=1;}
  }
  // Never publish detached details after rejecting the source component
  // nearest the proposed unit's center. Equidistant rejected evidence also
  // vetoes the unit, independently of component traversal order.
  if(!identityAccepted)return reject(identityReason);
  const fringe=residualInkFringe(candidates,solid,px.w,owned);
  for(let i=0;i<area;i++)if(fringe[i]!==1)transparent.rgba[i*4+3]=0;
  let left=px.w,top=px.h,right=-1,bottom=-1;
  for(let cy=0;cy<px.h;cy++)for(let cx=0;cx<px.w;cx++){
    if((transparent.rgba[(cy*px.w+cx)*4+3]??0)<32)continue;
    left=Math.min(left,cx);top=Math.min(top,cy);right=Math.max(right,cx);bottom=Math.max(bottom,cy);
  }
  if(right<left||bottom<top)return reject('icon-source-empty');
  const tight={x:Math.max(0,left-2),y:Math.max(0,top-2),w:Math.min(px.w,right+3)-Math.max(0,left-2),h:Math.min(px.h,bottom+3)-Math.max(0,top-2)};
  const removedNeighborPixels=candidates.reduce((sum,value,i)=>sum+(value&&fringe[i]!==1?1:0),0);
  const refinement={image:cropPng(transparent,tight),box:tight,refined:true,removedNeighborPixels,retainedDetailComponents:0};
  // Require the retained ink to be isolated from the model window boundary;
  // tightening must never hide clipped pictorial details.
  if(left===0||top===0||right===px.w-1||bottom===px.h-1)return reject('icon-source-fringe-boundary');
  const final={x:(px.x+tight.x)*slideSize.widthPt/image.width,y:(px.y+tight.y)*slideSize.heightPt/image.height,
    w:tight.w*slideSize.widthPt/image.width,h:tight.h*slideSize.heightPt/image.height};
  const ownership={box:final,slideSize,textBoxes,sourceWidth:image.width,sourceHeight:image.height,originalPixelBox:px,refinement,
    ...((glyphOcclusion!==undefined||semanticReview!==undefined)?{glyphOcclusion,sourceImage:image,budget,semanticReview,objectId:id,regionId,objectBox:box}:{})};
  const collisions=sceneIconInkTextCollisions(ownership);
  if(nativeOnly&&collisions.length)return reject('icon-source-text');
  const admission=sourceCrop?admitSourcePictorialCrop(refinement.image,final,slideSize):nativeOnly?null:admitTightGraphicCrop({detector:"foreground-graphic-crop",...ownership,textBoxes:collisions});
  if((!nativeOnly||sourceCrop)&&!admission)return reject('icon-source-crop-admission');
  const name=`scene-icon-${id}.png`;
  return {reason:'icon-source-isolated',measurement:{image:refinement.image,pixelBox:{x:px.x+tight.x,y:px.y+tight.y,w:tight.w,h:tight.h},icon:{id:`scene-icon-${id}`,type:"fidelity-crop",assetPath:`assets/${name}`,box:final,
    style:{opacity:1},source:{editable:false,nativeRebuild:true,detector:"foreground-graphic-crop",strategy:nativeOnly&&!sourceCrop?'native-source-measurement':"local-fidelity-crop",
      sceneRegionId:regionId,expressionForm:"icon-or-illustration",expressionSubtype:"protected-complex-visual-unit",
      ...(admission?{protectedMinimumUnit:true,...admission,...buildMinimumUnitCropEvidence({sourceWidth:image.width,sourceHeight:image.height,originalPixelBox:px,refinement}),
      nonEditableReason:"Source-isolated standalone pictorial icon."}:{})}}}};
}
/** Legacy callers retain their exact nullable measurement contract.
 * @param {Parameters<typeof measureSceneIconDetailed>[0]} input */
function measureSceneIcon(input){return measureSceneIconDetailed(input).measurement;}
/** Measure using the identical source gates, then publish only an admitted crop.
 * @param {Parameters<typeof measureSceneIcon>[0]} input */
function materializeSceneIconDetailed(input){
  return publishSceneIcon(input,measureSceneIconDetailed(input));
}
/** @param {Parameters<typeof measureSceneIconDetailed>[0]} input */
function materializeScenePictorialCropDetailed(input){return publishSceneIcon(input,measureScenePictorialCropDetailed(input));}
/** @param {Parameters<typeof measureSceneIconDetailed>[0]} input @param {ReturnType<typeof measureSceneIconDetailed>} detail */
function publishSceneIcon(input,detail){
  const measured=detail.measurement;if(!measured)return detail;
  const {root,id}=input;
  if(!path.isAbsolute(root)||fs.lstatSync(root).isSymbolicLink())throw new TypeError("Scene icon output root is invalid");
  const directory=path.join(root,"assets");
  if(!fs.existsSync(directory))fs.mkdirSync(directory);
  const info=fs.lstatSync(directory),relative=path.relative(fs.realpathSync(root),fs.realpathSync(directory));
  if(!info.isDirectory()||info.isSymbolicLink()||relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new TypeError("Scene icon output directory is invalid");
  const name=`scene-icon-${id}.png`,file=path.join(directory,name);
  if(fs.existsSync(file))throw new TypeError("Scene icon output identity conflicts");
  writePng(file,measured.image);
  return detail;
}
/** @param {Parameters<typeof measureSceneIcon>[0]} input */
function materializeSceneIcon(input){return materializeSceneIconDetailed(input).measurement?.icon??null;}
module.exports={materializeSceneIcon,measureSceneIcon,measureSceneIconDetailed,measureSceneNativeIconDetailed,materializeSceneIconDetailed,measureScenePictorialCropDetailed,materializeScenePictorialCropDetailed};
