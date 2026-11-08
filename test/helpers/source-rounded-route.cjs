'use strict';
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function sourceRoundedRouteFixture({gradient=false,reverse=false}={}){
 const width=240,height=180,image={width,height,rgba:Buffer.alloc(width*height*4,255)},budget={used:0};
 const from={id:'a',box:{x:30,y:20,w:40,h:30}},to={id:'b',box:{x:180,y:99,w:40,h:30}};
 const put=(x,y,rgb)=>image.rgba.set([...rgb,255],(y*width+x)*4);
 const color=(x,y)=>gradient==='spatial-knots'?[30,Math.round(220-180*Math.max(0,Math.min(1,(y-85)/15))),180]:gradient==='path'?[30,Math.round(230-(x+y-100)*1.1),180]:gradient?[30,Math.round(180-(y-50)*1.5),180]:[30,60,90];
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 const path=[];
 for(let y=50;y<=100;y++)path.push({x:50,y});
 for(let i=1;i<=48;i++){const t=Math.PI/2*i/48;path.push({x:Math.round(64-14*Math.cos(t)),y:Math.round(100+14*Math.sin(t))});}
 for(let x=64;x<=179;x++)path.push({x,y:114});
 for(const p of path)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const x=p.x+dx,y=p.y+dy;
  if(![from,to].some(n=>x>=n.box.x&&x<n.box.x+n.box.w&&y>=n.box.y&&y<n.box.y+n.box.h))put(x,y,color(x,y));
 }
 if(!reverse)for(let x=173;x<=179;x++)for(let y=114-(179-x);y<=114+(179-x);y++)put(x,y,color(x,y));
 else for(let y=50;y<=56;y++)for(let x=50-(y-50);x<=50+(y-50);x++)put(x,y,color(x,y));
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const n of [from,to]){if(!cache.fill(n.box))throw Error('fixture body measurement failed');n.portFrame=cache.portFrame(n.box);}
 return {image,from:reverse?to:from,to:reverse?from:to,direction:'forward',budget,textMasks:[],shaftBox:{x:42,y:49,w:139,h:73}};
}
module.exports={sourceRoundedRouteFixture};
