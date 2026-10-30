'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readPng}=require('../../packages/slideclone-core/png');
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture(horizontal=false,mirrored=false,reversed=false){
 const source=readPng(path.join(__dirname,'../fixtures/source-directed-dash-unsupported.png'));
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/source-directed-dash-unsupported.json'),'utf8'));
 const image={width:300,height:300,rgba:Buffer.alloc(300*300*4)},budget={used:0};
 for(let n=0;n<300*300;n++)image.rgba.set([...original.background,255],n*4);
 const map=n=>{const c=n%25,a=(mirrored?source.height-1-Math.floor(n/25):Math.floor(n/25))+60;
  return horizontal?(c+90)*300+a:a*300+c+90;};
 for(let n=0;n<source.width*source.height;n++)image.rgba.set(source.rgba.subarray(n*4,n*4+4),map(n)*4);
 const low={id:'a',box:horizontal?{x:20,y:82,w:30,h:40}:{x:82,y:20,w:40,h:30}};
 const high={id:'b',box:horizontal?{x:245,y:82,w:30,h:40}:{x:82,y:245,w:40,h:30}};
 for(const node of [low,high])for(let y=node.box.y;y<node.box.y+node.box.h;y++)for(let x=node.box.x;x<node.box.x+node.box.w;x++)image.rgba.set([210,30,160,255],(y*300+x)*4);
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const node of [low,high]){cache.fill(node.box);node.portFrame=cache.portFrame(node.box);}
 return {image,budget,from:reversed?high:low,to:reversed?low:high,direction:mirrored!==reversed?'backward':'forward',textMasks:[],otherNodes:[],
  sourcePixels:new Set(original.components.flatMap(c=>c.cells.map(map))),horizontal,mirrored,reversed};
}
module.exports={fixture};
