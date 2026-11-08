// @ts-check
'use strict';
const {constructPrimitiveCandidate}=require('./source-scene-primitive-candidate');
const {insidePolygon}=require('./source-scene-band-geometry');
const {simpleSurfaceBoundary}=require('./source-scene-surface-paths');
/** @typedef {import('./source-scene-primitive-candidate').Point} Point */
/** @typedef {import('./source-scene-primitive-candidate').Recipe} Recipe */
/** @param {Point} p @param {Point} a @param {Point} b */
function lineDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,s=dx*dx+dy*dy;
 const t=s?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/s)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** Flatten complete cubic geometry with a certified .25px control-hull bound.
 * Closed and open faces use the SAME geometry as the actual native constructor.
 * @param {import('./source-scene-primitive-candidate').Segment[]} segments
 * @param {import('./source-scene-plan').Box} box */
function flatten(segments,box){
 /** @type {Point[]} */const vertices=[];
 const pixel=(/** @type {Point} */p)=>({x:box.x+p.x*box.w,y:box.y+p.y*box.h});
 const middle=(/** @type {Point} */a,/** @type {Point} */b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 /** @param {Point} a @param {Point} b @param {Point} c @param {Point} d @param {number} depth */
 const curve=(a,b,c,d,depth)=>{
  if(vertices.length>=4096||depth>12)throw new RangeError('Scene primitive curve capacity exceeded');
  if(Math.max(lineDistance(b,a,d),lineDistance(c,a,d))<=.25){vertices.push(d);return;}
  const ab=middle(a,b),bc=middle(b,c),cd=middle(c,d),abc=middle(ab,bc),bcd=middle(bc,cd),m=middle(abc,bcd);
  curve(a,ab,abc,m,depth+1);curve(m,bcd,cd,d,depth+1);
 };
 for(const s of segments){
  if(s.type==='close'){if(vertices[0])vertices.push({...vertices[0]});continue;}
  if(s.type==='moveTo'||s.type==='lnTo'){const p=s.points[0];if(!p)throw new TypeError('Scene primitive curve is invalid');vertices.push(pixel(p));continue;}
  const last=vertices.at(-1);if(!last)throw new TypeError('Scene primitive curve is invalid');
  const [b,c,d]=s.points;if(!b||!c||!d)throw new TypeError('Scene primitive curve is invalid');
  curve(last,pixel(b),pixel(c),pixel(d),0);
 }
 return vertices;
}
/** @param {Point} p @param {Point[]} vertices */
function pathDistance(p,vertices){let result=Infinity;for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i];
 if(a&&b)result=Math.min(result,lineDistance(p,a,b));}return result;}
/** Independent exterior samples follow the complete physical boundary, never
 * arbitrary window corners that may contain neighboring labels or nodes.
 * @param {Point[]} boundary @param {number} offset @returns {Point[]} */
function primitiveExteriorPoints(boundary,offset){const points=[];
 for(let i=1;i<boundary.length;i++){
  const a=boundary[i-1],b=boundary[i];if(!a||!b)throw new TypeError('Scene primitive boundary is invalid');
  const length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length));if(!length)continue;
  for(let n=0;n<steps;n++){
   const p={x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps};
   let q={x:p.x-(b.y-a.y)*offset/length,y:p.y+(b.x-a.x)*offset/length};
   if(insidePolygon(q,boundary))q={x:p.x+(b.y-a.y)*offset/length,y:p.y-(b.x-a.x)*offset/length};points.push(q);
  }
 }
 return points;
}
/** @param {import('./source-scene-plan').Box} box */
function ellipseSegments(box){const k=.5522847498307936;
 /** @type {import('./source-scene-primitive-candidate').Segment[]} */const segments=[
  {type:'moveTo',points:[{x:1,y:.5}]},
  {type:'cubicBezTo',points:[{x:1,y:.5+k/2},{x:.5+k/2,y:1},{x:.5,y:1}]},
  {type:'cubicBezTo',points:[{x:.5-k/2,y:1},{x:0,y:.5+k/2},{x:0,y:.5}]},
  {type:'cubicBezTo',points:[{x:0,y:.5-k/2},{x:.5-k/2,y:0},{x:.5,y:0}]},
  {type:'cubicBezTo',points:[{x:.5+k/2,y:0},{x:1,y:.5-k/2},{x:1,y:.5}]},{type:'close',points:[]}];
 return {segments,vertices:flatten(segments,box)};
}
/** @param {Recipe} recipe @param {{width:number,height:number}} image */
function primitiveProgramPaths(recipe,image){
 const result=constructPrimitiveCandidate(recipe,{widthPx:image.width,heightPx:image.height,widthPt:image.width,heightPt:image.height});
 const faces=result.shapes.map(shape=>{
  const segments=shape.type==='ellipse'?ellipseSegments(shape.box).segments:
   /** @type {import('./source-scene-primitive-candidate').Segment[]} */(shape.style.freeformSegments);
  return {shape,segments,vertices:flatten(segments,shape.box),closed:segments.at(-1)?.type==='close',filled:shape.style.fill!=='none'};
 });
 const strokes=faces.map(()=>/** @type {Point[]} */([]));
 for(const [index,face]of faces.entries())for(let i=1;i<face.vertices.length;i++){
  const a=face.vertices[i-1],b=face.vertices[i];if(!a||!b)throw new TypeError('Scene primitive curve is invalid');
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
  for(let n=0;n<steps;n++){
   const p={x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps};
   // A later face covers an earlier stroke. Never demand source ink for a
   // hidden construction edge (the cylinder body's top chord, for example).
   if(faces.slice(index+1).some(f=>f.filled&&insidePolygon(p,f.vertices)&&pathDistance(p,f.vertices)>recipe.strokeWidthPx/2))continue;
   const visible=strokes[index];if(!visible)throw new TypeError('Scene primitive face is invalid');visible.push(p);
  }
 }
 let boundary=faces[0];
 if(!boundary)throw new TypeError('Scene primitive face is invalid');
 if(recipe.kind==='cylinder'){
  const c=recipe.capRatio,k=.5522847498307936;
  /** @type {import('./source-scene-primitive-candidate').Segment[]} */const segments=[
   {type:'moveTo',points:[{x:0,y:c/2}]},
   {type:'cubicBezTo',points:[{x:0,y:c/2-k*c/2},{x:.5-k/2,y:0},{x:.5,y:0}]},
   {type:'cubicBezTo',points:[{x:.5+k/2,y:0},{x:1,y:c/2-k*c/2},{x:1,y:c/2}]},
   {type:'lnTo',points:[{x:1,y:1-c/2}]},
   {type:'cubicBezTo',points:[{x:1,y:1-c/2+k*c/2},{x:.5+k/2,y:1},{x:.5,y:1}]},
   {type:'cubicBezTo',points:[{x:.5-k/2,y:1},{x:0,y:1-c/2+k*c/2},{x:0,y:1-c/2}]},
   {type:'close',points:[]}];
  boundary={...boundary,segments,vertices:flatten(segments,recipe.box)};
 }
 let withinSurface=recipe.kind!=='openPaths'&&(recipe.kind!=='pathSurface'||simpleSurfaceBoundary(boundary.vertices)),work=0;
 if(recipe.kind==='pathSurface')for(const [index,path]of strokes.slice(1).entries()){
  /** @type {Point[]} */const anchors=[];
  for(const p of path){
   work+=boundary.vertices.length*2;
   if(work>4000000){withinSurface=false;break;}
   const distance=pathDistance(p,boundary.vertices);
   if(distance<=1e-6)anchors.push(p);
   else if(!insidePolygon(p,boundary.vertices)){withinSurface=false;break;}
  }
  // Stroke sampling is half-open to avoid double-counting joins. Include
  // actual curve endpoints when proving both attachments to the exterior.
  for(const p of faces[index+1]?.vertices??[]){
   work+=boundary.vertices.length;
   if(work>4000000){withinSurface=false;break;}
   if(pathDistance(p,boundary.vertices)<=1e-6)anchors.push(p);
  }
  // Faces/dividers must share the physical exterior. Detached interior paths
  // are separate units, never an uncharged illustration/object inventory.
  const first=anchors[0];
  if(!first||!anchors.some(p=>Math.hypot(p.x-first.x,p.y-first.y)>=2))withinSurface=false;
  if(!withinSurface)break;
 }
 return {faces,strokes,boundary,withinSurface};
}
module.exports={primitiveProgramPaths,pathDistance,lineDistance,primitiveExteriorPoints};
