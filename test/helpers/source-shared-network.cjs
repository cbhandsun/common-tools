'use strict';
const assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./source-shared-tree.cjs');
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function sourceSharedNetworkFixture(){
 const f=sourceSharedTreeFixture();
 for(let y=99;y<=121;y++)for(let x=139;x<=161;x++)f.put(x,y,[255,255,255]);
 for(let x=138;x<=162;x++)for(let d=-1;d<=1;d++){f.put(x,98+d);f.put(x,122+d);}
 for(let y=98;y<=122;y++)for(let d=-1;d<=1;d++){f.put(138+d,y);f.put(162+d,y);}
 // Changed source pixels need their own independently measured private ports.
 f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
 f.put=(x,y,color=[30,60,90])=>f.image.rgba.set([...color,255],(y*f.image.width+x)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 for(const node of f.nodes){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
 return {...f,sourceNetwork:true};
}
const networkRelations=[
 {id:'left-route',regionId:'root',fromId:'region-source',toId:'object-left',direction:'forward',shaftBox:{x:138,y:97,w:6,h:3}},
 {id:'right-route',regionId:'root',fromId:'region-source',toId:'object-right',direction:'forward',shaftBox:{x:145,y:121,w:10,h:3}}
];
function sourceCurvedNetworkFixture(){
 const f=sourceSharedTreeFixture(),radius=12;
 for(let y=111-radius;y<110+radius;y++)for(let x=151-radius;x<150+radius;x++)f.put(x,y,[255,255,255]);
 for(let y=108-radius;y<=112+radius;y++)for(let x=148-radius;x<=152+radius;x++)if(Math.abs(Math.hypot(x-150,y-110)-radius)<=1.5)f.put(x,y);
 const stem=[{x:150,y:60},{x:154,y:66},{x:154,y:75},{x:150,y:83}];
 for(let y=61;y<=84;y++)for(let x=147;x<=157;x++)f.put(x,y,[255,255,255]);
 for(let y=58;y<=85;y++)for(let x=147;x<=157;x++)for(let i=1;i<stem.length;i++){
  const a=stem[i-1],b=stem[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=1.5)f.put(x,y);
 }
 f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 for(const node of f.nodes){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
 return {...f,sourceNetwork:true};
}
module.exports={sourceSharedNetworkFixture,sourceCurvedNetworkFixture,networkRelations};
