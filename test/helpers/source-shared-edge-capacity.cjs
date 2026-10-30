'use strict';
const assert=require('node:assert/strict');
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {measureSharedSourceRoute}=require('../../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../../packages/slideclone-core/routing/source-shared-route-compiler');

function sharedEdgeCapacityFixture(){
 const image={width:300,height:210,rgba:Buffer.alloc(300*210*4,255)},budget={used:0};
 const put=(x,y,color=[30,60,90])=>image.rgba.set([...color,255],(y*image.width+x)*4);
 const nodes=[['source',30,10],['left',5,100],['bottom',50,180],['right',250,100]].map(([name,x,y])=>({
  id:'native-'+name,endpointId:'object-'+name,box:{x,y,w:20,h:20},arrow:false}));
 for(const n of nodes)for(let y=n.box.y;y<n.box.y+20;y++)for(let x=n.box.x;x<n.box.x+20;x++)put(x,y,[210,230,245]);
 const paths=[[{x:40,y:30},{x:40,y:110}],[{x:25,y:110},{x:40,y:110}],
  [{x:40,y:110},{x:60,y:110},{x:60,y:180}],
  [{x:40,y:110},{x:60,y:110},...Array.from({length:21},(_,i)=>({x:68+i*8,y:i%2?102:110})),{x:250,y:110}]];
 for(const p of paths)for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
  for(let j=0;j<=steps;j++)put(Math.round(a.x+(b.x-a.x)*j/steps),Math.round(a.y+(b.y-a.y)*j/steps));
 }
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const n of nodes){assert.ok(cache.fill(n.box));n.portFrame=cache.portFrame(n.box);}
 const relations=nodes.slice(1).map(n=>({id:'relation-'+n.endpointId,regionId:'root',fromId:nodes[0].endpointId,toId:n.endpointId,direction:'undirected'}));
 const input={image,nodes,budget,sourceNetwork:true,textMasks:[],window:{x:0,y:0,w:290,h:205}};
 return {input,relations,compile(){
  const measured=measureSharedSourceRoute(input);assert.ok(measured.fit,measured.reason);
  return {measured:measured.fit,output:compileSharedSourceRoute({image,fit:measured.fit,relations,id:'capacity-network',
   sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:210}})};
 }};
}
module.exports={sharedEdgeCapacityFixture};
