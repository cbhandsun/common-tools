// @ts-check
"use strict";
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {parseSurfacePaths}=require('./source-scene-surface-paths');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {'ellipse'|'roundRect'|'quad'|'cylinder'|'handFrame'|'pathSurface'|'openPaths'} Kind */
/** @typedef {{type:'moveTo'|'lnTo'|'cubicBezTo'|'close',points:Point[]}} Segment */
/** @typedef {{id:string,kind:Kind,box:Box,fill:string,stroke:string,strokeWidthPx:number,dash:'solid'|'dash',
 * capRatio:number,radiusRatio:number,seams:number[],corners:Point[]|null,capFill:string,paths?:import('./source-scene-surface-paths').SurfacePath[]}} Recipe */
/** A recipe describes a candidate, never observed source geometry or authority.
 * Explicit parsing precedes construction. No font, OCR, pixel, erase, port,
 * physical grouping or completion claim is minted by this pure module.
 * @param {unknown} value @returns {Recipe} */
function parsePrimitiveCandidate(value){
 if(!record(value)||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!['id','kind','box','fill','stroke','strokeWidthPx','dash','capRatio','radiusRatio','seams','corners','capFill','paths'].includes(k))
  ||typeof value.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(value.id)
  ||typeof value.kind!=='string'||!['ellipse','roundRect','quad','cylinder','handFrame','pathSurface','openPaths'].includes(value.kind)||!validBox(value.box)
  ||Reflect.ownKeys(value.box).some(k=>typeof k!=='string'||!['x','y','w','h'].includes(k))||value.box.x+value.box.w>16384||value.box.y+value.box.h>16384)
  throw new TypeError('Native primitive candidate is invalid');
 const color=(/** @type {unknown} */v)=>typeof v==='string'&&/^#[a-f0-9]{6}$/iu.test(v);
 if(!color(value.fill)||!color(value.stroke)||value.capFill!==undefined&&!color(value.capFill)
  ||typeof value.strokeWidthPx!=='number'||!Number.isFinite(value.strokeWidthPx)||value.strokeWidthPx<0||value.strokeWidthPx>16
  ||value.dash!==undefined&&(typeof value.dash!=='string'||!['solid','dash'].includes(value.dash)))throw new TypeError('Native primitive paint is invalid');
 const cap=value.capRatio??.24,radius=value.radiusRatio??.12;
 if(typeof cap!=='number'||!Number.isFinite(cap)||cap<=0||cap>.5||typeof radius!=='number'||!Number.isFinite(radius)||radius<=0||radius>.5)
  throw new TypeError('Native primitive proportions are invalid');
 const seams=value.seams??[];
 if(!list(seams)||seams.length>15||seams.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||v<=cap||v>=1-cap/2
  ||i>0&&Number(v)<=Number(seams[i-1])))throw new TypeError('Native primitive seams are invalid');
 const corners=value.corners??null;
 if(corners!==null&&(!list(corners)||corners.length!==4||corners.some(p=>!record(p)||Reflect.ownKeys(p).length!==2
  ||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)))
  throw new TypeError('Native primitive corners are invalid');
 if(value.kind!=='quad'&&corners!==null||value.kind!=='cylinder'&&seams.length)throw new TypeError('Native primitive recipe members are invalid');
 const paths=['pathSurface','openPaths'].includes(value.kind)?parseSurfacePaths(value.paths,value.kind==='openPaths'):undefined;
 if(!['pathSurface','openPaths'].includes(value.kind)&&value.paths!==undefined&&value.paths!==null)throw new TypeError('Native primitive recipe members are invalid');
 if(corners){
  const ps=/** @type {[Point,Point,Point,Point]} */(corners);
  /** @type {number[]} */
  const cross=[];
  for(let i=0;i<4;i++){const a=ps[i],b=ps[(i+1)%4],c=ps[(i+2)%4];
   if(!a||!b||!c)throw new TypeError('Native primitive polygon is invalid');
   cross.push((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x));}
  const first=cross[0];if(first===undefined||cross.some(v=>v===0)||!cross.every(v=>Math.sign(v)===Math.sign(first)))throw new TypeError('Native primitive polygon is invalid');
 }
 return {id:value.id,kind:/** @type {Kind} */(value.kind),box:{...value.box},fill:String(value.fill),stroke:String(value.stroke),
  strokeWidthPx:value.strokeWidthPx,dash:/** @type {'solid'|'dash'} */(value.dash??'solid'),capRatio:cap,radiusRatio:radius,
  seams:/** @type {number[]} */(seams.slice()),corners:corners===null?null:(/** @type {Point[]} */(corners)).map(p=>({...p})),capFill:String(value.capFill??value.fill),...(paths?{paths}:{})};
}
/** @param {Segment['type']} type @param {number[][]} [coordinates] @returns {Segment} */
function segment(type,coordinates=[]){return {type,points:coordinates.map(p=>{
 const [x,y]=p;if(x===undefined||y===undefined)throw new TypeError('Native primitive segment is invalid');return {x,y};})};}
/** Independent recipes really construct native geometry; none falls back to
 * a color flood, closed-ring tracer or another representation's success gate.
 * The caller must source-calibrate and verify every candidate before adoption.
 * @param {unknown} recipeInput @param {unknown} frameInput */
function constructPrimitiveCandidate(recipeInput,frameInput){
 const recipe=parsePrimitiveCandidate(recipeInput);
 if(!record(frameInput)||Object.keys(frameInput).some(k=>!['widthPx','heightPx','widthPt','heightPt'].includes(k))
  ||![frameInput.widthPx,frameInput.heightPx].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||Number(frameInput.widthPx)*Number(frameInput.heightPx)>40000000
  ||![frameInput.widthPt,frameInput.heightPt].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=20000)
  ||recipe.box.x+recipe.box.w>Number(frameInput.widthPx)||recipe.box.y+recipe.box.h>Number(frameInput.heightPx))
  throw new TypeError('Native primitive candidate frame is invalid');
 const sx=Number(frameInput.widthPt)/Number(frameInput.widthPx),sy=Number(frameInput.heightPt)/Number(frameInput.heightPx);
 const box={x:recipe.box.x*sx,y:recipe.box.y*sy,w:recipe.box.w*sx,h:recipe.box.h*sy};
 /** @type {{id:string,type:string,box:Box,style:Record<string,unknown>,source:Record<string,unknown>}[]} */const shapes=[];
 const base={fill:recipe.fill,stroke:recipe.stroke,strokeWidthPt:recipe.strokeWidthPx*Math.min(sx,sy),opacity:1,dash:recipe.dash};
 /** @param {string} suffix @param {string} type @param {Box} b @param {Record<string,unknown>} style */
 const emit=(suffix,type,b,style)=>shapes.push({id:recipe.id+'-'+suffix,type,box:{...b},style:{...style},
  source:{detector:'source-scene-primitive-candidate',nativeRebuildCandidate:true}});
 if(recipe.kind==='pathSurface'||recipe.kind==='openPaths'){
  for(const [index,path]of (recipe.paths??[]).entries())emit('face-'+index,'freeform',box,
   {...base,fill:path.filled?recipe.fill:'none',freeformSegments:path.segments});
 }else if(recipe.kind==='ellipse')emit('body','ellipse',box,base);
 else if(recipe.kind==='quad'){
  const p=recipe.corners??[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],first=p[0];
  if(!first)throw new TypeError('Native primitive polygon is invalid');
  const segments=[segment('moveTo',[[first.x,first.y]]),...p.slice(1).map(q=>segment('lnTo',[[q.x,q.y]])),segment('close')];
  emit('paper','freeform',box,{...base,freeformSegments:segments});
 }else if(recipe.kind==='cylinder'){
  const c=recipe.capRatio,k=.5522847498307936;
  const outer=[segment('moveTo',[[0,c/2]]),segment('lnTo',[[0,1-c/2]]),
   segment('cubicBezTo',[[0,1-c/2+k*c/2],[.5-k*.5,1],[.5,1]]),
   segment('cubicBezTo',[[.5+k*.5,1],[1,1-c/2+k*c/2],[1,1-c/2]]),
   segment('lnTo',[[1,c/2]]),segment('lnTo',[[0,c/2]]),segment('close')];
  emit('body','freeform',box,{...base,freeformSegments:outer});
  for(const [i,y]of recipe.seams.entries())emit('seam-'+i,'freeform',box,{...base,fill:'none',freeformSegments:[segment('moveTo',[[0,y]]),
   segment('cubicBezTo',[[0,y+k*c/2],[.5-k*.5,y+c/2],[.5,y+c/2]]),
   segment('cubicBezTo',[[.5+k*.5,y+c/2],[1,y+k*c/2],[1,y]])]});
  emit('cap','ellipse',{...box,h:box.h*c},{...base,fill:recipe.capFill});
 }else{
  // Explicit rounded surface or frame; adjustable cubic corners preserve
  // the candidate's physical radius instead of the Office preset's default.
  const rx=Math.min(.5,recipe.radiusRatio*Math.min(box.w,box.h)/box.w),ry=Math.min(.5,recipe.radiusRatio*Math.min(box.w,box.h)/box.h),k=.5522847498307936;
  const segments=[segment('moveTo',[[rx,0]]),segment('lnTo',[[1-rx,0]]),
   segment('cubicBezTo',[[1-rx+k*rx,0],[1,ry-k*ry],[1,ry]]),segment('lnTo',[[1,1-ry]]),
   segment('cubicBezTo',[[1,1-ry+k*ry],[1-rx+k*rx,1],[1-rx,1]]),segment('lnTo',[[rx,1]]),
   segment('cubicBezTo',[[rx-k*rx,1],[0,1-ry+k*ry],[0,1-ry]]),segment('lnTo',[[0,ry]]),
   segment('cubicBezTo',[[0,ry-k*ry],[rx-k*rx,0],[rx,0]]),segment('close')];
  emit('body','freeform',box,{...base,...(recipe.kind==='handFrame'?{fill:'none'}:{}),freeformSegments:segments});
 }
 return {shapes,kind:recipe.kind,sourceAuthorized:false,labelsCompleted:false,portsAuthorized:false};
}
module.exports={parsePrimitiveCandidate,constructPrimitiveCandidate};
