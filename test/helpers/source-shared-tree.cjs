'use strict';
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/source-scene-measurement-cache');
function sourceSharedTreeFixture(){
 const image={width:300,height:230,rgba:Buffer.alloc(300*230*4,255)},budget={used:0};
 const put=(x,y,color=[30,60,90])=>image.rgba.set([...color,255],(y*image.width+x)*4);
 const nodes=[{id:'native-source',endpointId:'region-source',box:{x:130,y:20,w:40,h:30},arrow:false},
  {id:'native-left',endpointId:'object-left',box:{x:30,y:170,w:40,h:30},arrow:true},
  {id:'native-right',endpointId:'object-right',box:{x:230,y:170,w:40,h:30},arrow:true}];
 for(const n of nodes)for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(let y=50;y<=110;y++)for(let x=149;x<=151;x++)put(x,y);
 for(let y=109;y<=111;y++)for(let x=50;x<=250;x++)put(x,y);
 for(const x of [50,250]){
  for(let y=110;y<170;y++)for(let xx=x-1;xx<=x+1;xx++)put(xx,y);
  for(let y=164;y<170;y++)for(let xx=x-(169-y);xx<=x+(169-y);xx++)put(xx,y);
 }
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const n of nodes){if(!cache.fill(n.box))throw Error('fixture body measurement failed');n.portFrame=cache.portFrame(n.box);}
 return {image,nodes,budget,textMasks:[],window:{x:20,y:40,w:260,h:140},put};
}
function sourceSharedGapTreeFixture({targetGap=7}={}){
 const f=sourceSharedTreeFixture();
 for(let y=50;y<=55;y++)for(let x=149;x<=151;x++)f.put(x,y,[255,255,255]);
 for(const x of [50,250]){
  for(let y=158;y<170;y++)for(let xx=x-5;xx<=x+5;xx++)f.put(xx,y,[255,255,255]);
  const tip=170-targetGap,base=tip-5;
  for(let y=158;y<base;y++)for(let xx=x-1;xx<=x+1;xx++)f.put(xx,y);
  for(let y=base;y<=tip;y++)for(let xx=x-(tip-y);xx<=x+(tip-y);xx++)f.put(xx,y);
 }
 return f;
}
module.exports={sourceSharedTreeFixture,sourceSharedGapTreeFixture};
