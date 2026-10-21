// @ts-check
'use strict';
const {parseBandBackground,insidePolygon}=require('./source-scene-band-geometry');
const {constructSceneNativeGeometry,parseSceneNativeGeometry}=require('./source-scene-native-geometry');
const {primitiveProgramPaths,pathDistance,primitiveExteriorPoints}=require('./source-scene-primitive-paths');
const {primitiveSourceRaster}=require('./source-scene-primitive-raster');
const {constructPrimitiveCandidate}=require('./source-scene-primitive-candidate');
const {createMeasuredScenePortFrame}=require('./source-scene-port-evidence');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {record,list}=require('./source-scene-group-containment');
const {compileSceneCageProgram,cageSceneParentMembers,rebindCageSceneParentMembers}=require('./source-scene-cage-program');
/** @typedef {import('./source-scene-primitive-candidate').Recipe} Recipe */
/** @typedef {import('./source-scene-primitive-candidate').Point} Point */
/** @typedef {ReturnType<typeof constructPrimitiveCandidate>['shapes'][number]} Shape */
/** @typedef {[number,number,number]} Color */
/** @typedef {{constructed:number,failure:string}|{constructed:number,failure:null,shapes:Shape[],measurement:{box:import('./source-scene-plan').Box,fill:string,segments:import('./source-scene-primitive-candidate').Segment[],perimeterPixels:number[]},portFrame:object|null,parentPaint:object}} Result */
/** @type {WeakMap<object,{rgba:Uint8Array,width:number,height:number,id:string,members:Shape[],snapshots:(string|null)[]}>} */
const receipts=new WeakMap();
/** @param {Shape} shape */
function memberSnapshot(shape){
 if(!record(shape.source))return null;
 const source=Object.fromEntries(Object.entries(shape.source).filter(([key])=>key!=='nativeComponentGroupId'));
 return sceneGroupSnapshot({...shape,style:{paint:shape.style,source}});
}
/** @param {Color[]} colors @returns {Color} */
function medianColor(colors){return /** @type {Color} */([0,1,2].map(c=>{
 const values=colors.map(p=>p[/** @type {0|1|2} */(c)]).sort((a,b)=>a-b),middle=values[Math.floor(values.length/2)];
 if(middle===undefined)throw new TypeError('Scene primitive paint samples are empty');return middle;}));}
/** @param {number[]} c */
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
/** @param {Color} a @param {Color} b */
const difference=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[/** @type {0|1|2} */(i)])));
/** Construct every face first, then calibrate all exposed faces/strokes on ONE
 * charged source snapshot. This never calls the legacy closed-ring/fill scanner.
 * A missing seam/cap, masked boundary, unsupported paint or wrong geometry
 * rejects the whole unit. Labels and illustrations keep their own original
 * ownership and complete-group gates; this scanner grants no glyph erasure.
 * @param {{image:import('./png').PngImage,object:import('./source-scene-plan').SceneObject,
 * textMasks:import('./source-scene-plan').Box[],budget:{used:number},slideSize:{widthPt:number,heightPt:number}}} input
 * @returns {Result|null} */
function compileScenePrimitiveProgram(input){
 if(!record(input)||!record(input.object)||!record(input.slideSize))throw new TypeError('Scene primitive program is invalid');
 const {object,slideSize}=input;
 const geometry=parseSceneNativeGeometry(object.nativeGeometry);
 if(!geometry)return null;
 if(object.kind!=='container'||! /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(object.id)
  ||! /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(object.regionId))throw new TypeError('Scene primitive program owner is invalid');
 if(!record(object.box)||Reflect.ownKeys(object.box).some(k=>typeof k!=='string'||!['x','y','w','h'].includes(k)))
  throw new TypeError('Scene primitive program box is invalid');
 const parsed=parseBandBackground({image:input.image,hint:object.box,textMasks:input.textMasks,budget:input.budget,owners:[]});
 const {image,budget,textMasks}=parsed,frame={widthPx:image.width,heightPx:image.height,widthPt:slideSize.widthPt,heightPt:slideSize.heightPt};
 const constructed=constructSceneNativeGeometry(object,frame);
 if(!constructed)throw new TypeError('Scene primitive construction is unavailable');
 // Transparent paths cannot inherit a closed surface's source, fill, grouping
 // or port proof. Their whole-owner consumer must verify them independently.
 if(geometry.kind==='openPaths')return {constructed:constructed.shapes.length,failure:'open-program-source-evidence'};
 const pad=12,x=Math.max(0,Math.floor(object.box.x-pad)),y=Math.max(0,Math.floor(object.box.y-pad));
 const window={x,y,w:Math.min(image.width,Math.ceil(object.box.x+object.box.w+pad))-x,
  h:Math.min(image.height,Math.ceil(object.box.y+object.box.h+pad))-y};
 const raster=primitiveSourceRaster(image,window,budget);
 if(!raster)return {constructed:constructed.shapes.length,failure:'primitive-source-budget'};
 const {pixel}=raster;
 const protectedPoint=(/** @type {Point} */p)=>textMasks.some(b=>p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h);
 /** @type {Recipe} */let recipe={id:'scene-container-'+object.id,box:{...object.box},...geometry,
  fill:'#FFFFFF',capFill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1,dash:'solid'};
 if(!primitiveProgramPaths(recipe,image).withinSurface)return {constructed:constructed.shapes.length,failure:'primitive-surface-scope'};
 const exteriorColors=primitiveExteriorPoints(primitiveProgramPaths(recipe,image).boundary.vertices,3.5)
  .flatMap(p=>{const c=pixel(Math.floor(p.x),Math.floor(p.y));return c?[c]:[];});
 if(exteriorColors.length<12)return {constructed:constructed.shapes.length,failure:'primitive-exterior'};
 const background=medianColor(exteriorColors);
 /** @param {Point} p */
 const nearestInk=(p,/** @type {Color|undefined} */target=undefined)=>{
  let distance=Infinity,contrast=-1;/** @type {Color|null} */let color=null;let cell=-1;
  for(let sy=Math.floor(p.y-2);sy<=Math.ceil(p.y+2);sy++)for(let sx=Math.floor(p.x-2);sx<=Math.ceil(p.x+2);sx++){
   const d=Math.hypot(sx+.5-p.x,sy+.5-p.y),c=pixel(sx,sy);
   if(d>1.5||!c||protectedPoint({x:sx+.5,y:sy+.5})||difference(c,background)<42
    ||target&&difference(c,target)>18)continue;
   const strength=difference(c,background);
   if(target?d>=distance:strength<contrast||strength===contrast&&d>=distance)continue;
   distance=d;contrast=strength;color=c;cell=sy*image.width+sx;
  }
  return {distance,color,cell};
 };
 // Keep the observed stroke paint fixed while fitting geometry. Otherwise
 // solid face paint counts as nearby ink and shrinking the whole object can
 // lower the geometric loss while walking off its true strokes and seams.
 /** @type {Color[]} */const initialInk=[];
 for(const points of primitiveProgramPaths(recipe,image).strokes)for(const p of points){const hit=nearestInk(p);if(hit.color)initialInk.push(hit.color);}
 if(!initialInk.length)return {constructed:constructed.shapes.length,failure:'primitive-source-geometry'};
 const observedStroke=medianColor(initialInk);
 const initialSupported=primitiveProgramPaths(recipe,image).strokes.every(points=>points.length>0
  &&points.every(p=>!protectedPoint(p)&&nearestInk(p,observedStroke).color!==null));
 // All faces share the pose. Trials inspect the same immutable source bytes;
 // they never mint a measurement, refund a proposal or reset a source ledger.
 const poseLoss=(/** @type {Recipe} */r)=>{
  const program=primitiveProgramPaths(r,image);let loss=0,count=0;
  for(const points of program.strokes)for(let i=0;i<points.length;i+=4){const p=points[i];
   if(!p||protectedPoint(p))return Infinity;const hit=nearestInk(p,observedStroke);loss+=Number.isFinite(hit.distance)?hit.distance:4;count++;}
  return count?loss/count:Infinity;
 };
 let loss=poseLoss(recipe);
 // A fully source-supported envelope needs no pose search. A pixel-center
 // loss otherwise rewards moving within a thick stroke and can destroy the
 // small faces that share this pose even when the original program is exact.
 for(const step of initialSupported?[]:[4,2,1])for(const edge of ['left','right','top','bottom'])for(const sign of [-1,1]){
  const b={...recipe.box},d=step*sign;if(edge==='left'){b.x+=d;b.w-=d;}if(edge==='right')b.w+=d;
  if(edge==='top'){b.y+=d;b.h-=d;}if(edge==='bottom')b.h+=d;
  if(b.x<x+2||b.y<y+2||b.x+b.w>x+window.w-2||b.y+b.h>y+window.h-2||b.w<8||b.h<8
   ||Math.max(Math.abs(b.x-object.box.x),Math.abs(b.y-object.box.y),Math.abs(b.x+b.w-object.box.x-object.box.w),
    Math.abs(b.y+b.h-object.box.y-object.box.h))>pad-2)continue;
  const candidate={...recipe,box:b},score=poseLoss(candidate);if(score<loss){recipe=candidate;loss=score;}
 }
 let program=primitiveProgramPaths(recipe,image);
 /** @type {Color[]} */const ink=[];const perimeter=new Set();
 for(const points of program.strokes){
  if(!points.length)return {constructed:constructed.shapes.length,failure:'primitive-missing-face'};
  for(const p of points){const hit=nearestInk(p,observedStroke);
   if(protectedPoint(p)||!hit.color)return {constructed:constructed.shapes.length,failure:'primitive-source-geometry'};
   ink.push(hit.color);perimeter.add(hit.cell);
  }
 }
 const stroke=medianColor(ink);
 // Original source paint tolerance and support, applied to the entire exposed
 // multi-face population rather than a handpicked successful component.
 if(ink.filter(c=>difference(c,stroke)<=18).length/ink.length<.82)
  return {constructed:constructed.shapes.length,failure:'primitive-stroke-paint'};
 const widths=[];
 for(const points of program.strokes)for(let i=1;i<points.length;i+=Math.max(1,Math.ceil(points.length/16))){
  const p=points[i],a=points[i-1];if(!p||!a)continue;const length=Math.hypot(p.x-a.x,p.y-a.y);if(!length)continue;
  const hit=nearestInk(p,stroke);if(!hit.color)continue;
  const cx=hit.cell%image.width+.5,cy=Math.floor(hit.cell/image.width)+.5,cells=new Set([hit.cell]);
  // Measure this connected stroke interval, not every same-colored interval
  // across the normal. Small caps otherwise count their opposite edge too.
  for(const sign of [-1,1])for(let n=1;n<=8;n++){
   const px=Math.floor(cx-(p.y-a.y)*n*sign/length),py=Math.floor(cy+(p.x-a.x)*n*sign/length),c=pixel(px,py);
   if(!c||difference(c,stroke)>18)break;cells.add(py*image.width+px);
  }
  if(cells.size<=16)widths.push(cells.size);
 }
 if(!widths.length)return {constructed:constructed.shapes.length,failure:'primitive-stroke-width'};
 const measuredWidth=widths.sort((a,b)=>a-b)[Math.floor(widths.length/2)];
 if(measuredWidth===undefined)throw new TypeError('Scene primitive width samples are empty');
 recipe={...recipe,stroke:hex(stroke),strokeWidthPx:measuredWidth};
 program=primitiveProgramPaths(recipe,image);
 perimeter.clear();
 for(const points of program.strokes)for(const p of points){const hit=nearestInk(p,stroke);
  if(!hit.color)return {constructed:constructed.shapes.length,failure:'primitive-source-geometry'};perimeter.add(hit.cell);}
 // A template drawn INSIDE a larger color patch is not a physical boundary.
 // Independently observe its exterior as well as every visible native stroke.
 // This rejects color-only matches without borrowing a provider mask.
 const exteriorPoints=primitiveExteriorPoints(program.boundary.vertices,recipe.strokeWidthPx/2+3),exterior=exteriorPoints.length;
 const exteriorSupported=exteriorPoints.filter(q=>{const c=pixel(Math.floor(q.x),Math.floor(q.y));return c&&difference(c,background)<=6;}).length;
 if(!exterior||exteriorSupported/exterior<.82)return {constructed:constructed.shapes.length,failure:'primitive-source-exterior'};
 /** @type {Map<number,Color[]>} */const samples=new Map();
 // Sample at the scale of EACH complete face. A page/window grid skips small
 // caps even when the source contains ample independent paint evidence.
 // Samples still share the charged immutable raster and the original >=12,
 // 18 color-distance and .82 paint-support gates.
 for(const [i,face]of program.faces.entries()){
  if(!face.filled)continue;const b=face.shape.box,step=Math.max(1,Math.ceil(Math.sqrt(b.w*b.h/4096))),colors=[];
  for(let sy=Math.max(y,Math.floor(b.y));sy<Math.min(y+window.h,Math.ceil(b.y+b.h));sy+=step)
   for(let sx=Math.max(x,Math.floor(b.x));sx<Math.min(x+window.w,Math.ceil(b.x+b.w));sx+=step){
    const p={x:sx+.5,y:sy+.5},c=pixel(sx,sy);if(!c||protectedPoint(p)||!insidePolygon(p,face.vertices))continue;
    if(program.faces.some((f,j)=>pathDistance(p,f.vertices)<=recipe.strokeWidthPx/2+1.5
      &&!program.faces.slice(j+1).some(next=>next.filled&&insidePolygon(p,next.vertices)&&pathDistance(p,next.vertices)>recipe.strokeWidthPx/2))
     ||program.faces.slice(i+1).some(f=>f.filled&&insidePolygon(p,f.vertices)))continue;
    colors.push(c);
   }
  samples.set(i,colors);
 }
 /** @type {Map<number,string>} */const paints=new Map();
 for(const [i,face]of program.faces.entries()){
  if(!face.filled)continue;const colors=samples.get(i)??[];
  if(colors.length<12)return {constructed:constructed.shapes.length,failure:'primitive-face-paint'};
  const color=medianColor(colors);if(colors.filter(c=>difference(c,color)<=18).length/colors.length<.82)
   return {constructed:constructed.shapes.length,failure:'primitive-face-paint'};
  paints.set(i,hex(color));
 }
 const native=constructPrimitiveCandidate(recipe,frame),shapes=native.shapes.map((s,i)=>({...s,
  style:{...s.style,...(paints.has(i)?{fill:paints.get(i)}:{})},
  source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'section-panel',
   detector:'source-scene-native-program',sceneRegionId:object.regionId,
   // A physical region owns its own construction; it is not a direct object
   // in its census. Parsed object IDs and region IDs are disjoint namespaces.
   ...(object.id!==object.regionId?{sceneInventoryId:object.id}:{}),
   residualBackgroundFill:program.faces[i]?.filled??false,preserveResidualInterior:true,sourcePerimeterSupport:1,
   nativeComponentGroupId:'scene-primitive-'+object.id}}));
 const fill=paints.get(0)??'none';
 const measurement={box:{...recipe.box},fill,segments:program.boundary.segments,perimeterPixels:[...perimeter]};
 const token=Object.freeze({});receipts.set(token,{rgba:input.image.rgba,width:image.width,height:image.height,
  id:object.id,members:shapes,snapshots:shapes.map(memberSnapshot)});
 return {constructed:constructed.shapes.length,failure:/** @type {null} */(null),shapes,measurement,
  portFrame:createMeasuredScenePortFrame(input.image,measurement),parentPaint:token};
}
/** Only exact surviving multi-face members of THIS measured source may group.
 * Copies, serializations, source changes and paint changes grant nothing.
 * @param {import('./png').PngImage} image @param {unknown} token @param {string} id @param {import('./source-scene-complete-groups').Item[]} shapes */
function primitiveSceneParentMembers(image,token,id,shapes){
 const proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!proof)return cageSceneParentMembers(image,token,id,shapes);
 if(!proof||!record(image)||!list(shapes)||proof.id!==id||proof.rgba!==image.rgba
  ||proof.width!==image.width||proof.height!==image.height)return null;
 return proof.members.every((p,i)=>shapes.filter(s=>s===p).length===1&&shapes.filter(s=>s.id===p.id).length===1
  &&memberSnapshot(p)===proof.snapshots[i])?proof.members.slice():null;
}
/** Grouping is the only permitted mutation of a private member receipt.
 * @param {import('./png').PngImage} image @param {unknown} token @param {string} id
 * @param {import('./source-scene-complete-groups').Item[]} before @param {import('./source-scene-complete-groups').Item[]} after */
function rebindPrimitiveSceneParentMembers(image,token,id,before,after){
 if(token===null||typeof token!=='object'||!receipts.has(token))return rebindCageSceneParentMembers(image,token,id,before,after);
 const members=primitiveSceneParentMembers(image,token,id,before),proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!members||!proof||!list(after)||!after.every(record)||before.length!==after.length)return false;
 const next=members.map(p=>after[before.indexOf(p)]);
 if(next.some((p,i)=>!p||memberSnapshot(/** @type {Shape} */(p))!==proof.snapshots[i]
  ||p.source?.nativeComponentGroupId!==members[i]?.source.nativeComponentGroupId&&p.source?.nativeComponentGroupId!=='scene-unit-'+id))return false;
 proof.members=/** @type {Shape[]} */(next);return true;
}
module.exports={compileScenePrimitiveProgram,compileSceneCageProgram,primitiveSceneParentMembers,rebindPrimitiveSceneParentMembers};
