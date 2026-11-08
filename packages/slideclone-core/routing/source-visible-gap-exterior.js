// @ts-check
'use strict';
const {readSceneFillRaster,sceneFillRasterReadCost}=require('../scene-plan/source-scene-fill-raster-cache');
const {measuredScenePortOwnsCell,measuredSceneContourPort,measuredSceneProjectedPort}=require('../scene-plan/source-scene-port-evidence');
const {sceneInkPortUnitOwnsCell,hasSceneInkPort}=require('../scene-plan/source-scene-ink-port');
const {sceneTextEndpointProjectedPort}=require('../scene-plan/source-scene-text-endpoints');
/** @typedef {{box:import('../scene-plan/source-scene-plan').Box,portFrame?:unknown}} Node */
/** @param {import('../png').PngImage} image @param {Node} node @param {number} axis @param {string} side */
function sourceVisibleGapPort(image,node,axis,side){
 return hasSceneInkPort(image,node.portFrame,node.box)?measuredSceneContourPort(image,node.portFrame,node.box,axis,side)
  :measuredSceneProjectedPort(image,node.portFrame,node.box,axis,side)??sceneTextEndpointProjectedPort(image,node.portFrame,node.box,axis,side);
}
/** @param {import('../png').PngImage} image @param {Node} from @param {Node} to @param {number} cell */
function sourceVisibleGapEndpointInk(image,from,to,cell){
 const x=cell%image.width,y=Math.floor(cell/image.width);
 return [from,to].some(n=>(!hasSceneInkPort(image,n.portFrame,n.box)&&x>=n.box.x-1&&x<=n.box.x+n.box.w+1&&y>=n.box.y-1&&y<=n.box.y+n.box.h+1)
  ||measuredScenePortOwnsCell(image,n.portFrame,n.box,cell)||sceneInkPortUnitOwnsCell(image,n.portFrame,n.box,cell));
}
/** Check the additional empty source corridor exposed by a concave endpoint.
 * Excluding its complete unit's actual ink does not fill its concave voids.
 * @param {{image:import('../png').PngImage,from:{box:import('../scene-plan/source-scene-plan').Box,portFrame?:unknown},to:{box:import('../scene-plan/source-scene-plan').Box,portFrame?:unknown},
 * window:import('../scene-plan/source-scene-plan').Box,ports:{x:number,y:number}[],horizontal:boolean,axis:number,radius:number,background:number[],
 * textMasks:import('../scene-plan/source-scene-plan').Box[],otherNodes:import('../scene-plan/source-scene-plan').Box[],budget:{used:number},work:{checks:number}}} input */
function sourceVisibleGapExterior({image,from,to,window,ports,horizontal,axis,radius,background,textMasks,otherNodes,budget,work}){
 const begin=horizontal?window.x:window.y,end=begin+(horizontal?window.w:window.h);
 const low=Math.floor(Math.min(...ports.map(p=>horizontal?p.x:p.y))),high=Math.ceil(Math.max(...ports.map(p=>horizontal?p.x:p.y)));
 /** @type {[number,number][]} */const ranges=[[low,begin],[end,high]];
 for(const [lo,hi] of ranges){
  if(hi<=lo)continue;
  const across=Math.floor(axis)-radius,strip=horizontal?{x:lo,y:across,w:hi-lo,h:radius*2+2}:{x:across,y:lo,w:radius*2+2,h:hi-lo};
  if(strip.x<0||strip.y<0||strip.x+strip.w>image.width||strip.y+strip.h>image.height||strip.w*strip.h>262144
   ||[...textMasks,...otherNodes].some(b=>b.x<strip.x+strip.w&&strip.x<b.x+b.w&&b.y<strip.y+strip.h&&strip.y<b.y+b.h)
   ||budget.used+sceneFillRasterReadCost(image,strip,budget)>4000000)return false;
  const raster=readSceneFillRaster(image,strip,budget);
  for(let y=0;y<strip.h;y++)for(let x=0;x<strip.w;x++){
   if(++work.checks>4000000)return false;
   const cell=(y+strip.y)*image.width+x+strip.x,at=(y*strip.w+x)*4;
   if(sourceVisibleGapEndpointInk(image,from,to,cell))continue;
   if((raster.rgba[at+3]??0)<240||background.some((v,c)=>Math.abs(v-(raster.rgba[at+c]??0))>=42))return false;
  }
 }
 return true;
}
module.exports={sourceVisibleGapExterior,sourceVisibleGapPort,sourceVisibleGapEndpointInk};
