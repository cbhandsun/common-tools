'use strict';
const {parsePrimitiveCandidate}=require('../../packages/slideclone-core/source-scene-primitive-candidate');
const {primitiveProgramPaths,pathDistance}=require('../../packages/slideclone-core/source-scene-primitive-paths');
const {insidePolygon}=require('../../packages/slideclone-core/source-scene-band-geometry');
function primitiveImage(kind='cylinder',options={}) {
 const dimensions=options.dimensions??{width:360,height:200};
 const image={...dimensions,rgba:Buffer.alloc(dimensions.width*dimensions.height*4,255)};
 const box=options.box??{x:30,y:30,w:80,h:90};
 const nativeGeometry={kind,...(kind==='cylinder'?{capRatio:.2,seams:[.4,.7]}:{})};
 const recipe=parsePrimitiveCandidate({id:'source',box,...nativeGeometry,fill:'#CCE0EC',capFill:'#E0ECF4',stroke:'#181818',strokeWidthPx:3});
 paintPrimitive(image,recipe,options);
 return {image,box,nativeGeometry,recipe};
}
function paintPrimitive(image,recipe,options={}) {
 const program=primitiveProgramPaths(recipe,image);
 const rgb=color=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const p={x:x+.5,y:y+.5};let color=null;
  for(const [index,face]of program.faces.entries()){
   if(options.missingSeam&&face.shape.id.includes('seam-0'))continue;
   if(options.missingCap&&index===program.faces.length-1&&recipe.kind==='cylinder')continue;
   if(face.filled&&insidePolygon(p,face.vertices))color=rgb(String(face.shape.style.fill));
   if(pathDistance(p,face.vertices)<=recipe.strokeWidthPx/2)color=rgb(String(face.shape.style.stroke));
  }
  if(color)image.rgba.set([...color,255],(y*image.width+x)*4);
 }
}
module.exports={primitiveImage,paintPrimitive};
