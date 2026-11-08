// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readRegisteredSourceCrop,registerDerivedSourceCrop}=require('./source-crop-registration');
const {measuredSceneVisibleGapPaint}=require('./source-scene-visible-gap-compiler');
const {measuredSharedSceneRoutePaintGroups}=require('../routing/source-shared-route-compiler');
const {writePng}=require('../png');
/** Erase only exact source texels of a captured crop. Private connector paint
 * is checked again here; a caller's mask, blank retirement scope, public box
 * or metadata cannot grant source ownership. The old asset is never modified.
 * The caller has validated the image controls, safe file and bounded raster.
 * @param {{token:unknown,image:import('../png').PngImage,root:string,file:string,
 * item:import('./source-scene-compiler').CompileInput['page']['images'][number],raster:import('../png').PngImage,
 * shapes:import('./source-scene-compiler').CompileInput['page']['shapes'],work:{checks:number}}} input */
function eraseRegisteredConnectorPixels({token,image,root,file,item,raster,shapes,work}){
 if(work.checks>=4000000)return null;
 const window=readRegisteredSourceCrop(token,image,root,file,item.box,raster);if(!window)return null;
 const proofs=[...shapes.map(shape=>({item:shape,cells:measuredSceneVisibleGapPaint(image,shape)})).filter(proof=>proof.cells),
  ...measuredSharedSceneRoutePaintGroups(image,shapes,work)];
 if(work.checks>4000000)return null;
 /** @type {Map<number,string>} */const erased=new Map();
 for(const proof of proofs){
  const shape=proof.item,cells=proof.cells;if(!cells||typeof shape.id!=='string')continue;
  work.checks+=cells.size;if(work.checks>4000000)return null;
  for(const cell of cells){
   if(++work.checks>4000000)return null;
   const x=cell%image.width-window.x,y=Math.floor(cell/image.width)-window.y;
   if(x<0||y<0||x>=window.w||y>=window.h)continue;
   const local=(y*raster.width+x)*4;if((raster.rgba[local+3]??0)===0)continue;
   work.checks+=4;if(work.checks>4000000)return null;
   if([0,1,2,3].some(c=>raster.rgba[local+c]!==image.rgba[cell*4+c]))continue;
   erased.set(local,shape.id);
  }
 }
 if(!erased.size)return null;
 const output={...raster,rgba:Buffer.from(raster.rgba)};
 for(const offset of erased.keys())output.rgba[offset+3]=0;
 const directory=fs.mkdtempSync(path.join(root,'assets','scene-owned-'));
 const outputFile=path.join(directory,'crop.png');
 try{
  writePng(outputFile,output);
  if(!registerDerivedSourceCrop(token,image,root,file,item.box,outputFile)){fs.rmSync(directory,{recursive:true,force:true});return null;}
 }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
 return {item:{...item,assetPath:path.relative(root,outputFile).replaceAll('\\','/')},
  erasedPixels:erased.size,replacementIds:[...new Set(erased.values())]};
}
module.exports={eraseRegisteredConnectorPixels};
