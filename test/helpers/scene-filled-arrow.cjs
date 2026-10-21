'use strict';
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/source-scene-measurement-cache');
function filledArrowFixture({both=false}={}){
 const image={width:256,height:256,rgba:Buffer.alloc(256*256*4,255)},budget={used:0},oracle=new Set();
 const put=(x,y,color=[25,90,180])=>image.rgba.set([...color,255],(y*256+x)*4);
 const from={id:'a',box:{x:20,y:20,w:40,h:40}},to={id:'b',box:{x:190,y:190,w:40,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 const length=90*Math.SQRT2,shaft=4,head=both?25:18,base=length-(both?48:28);
 const vertices=both?[[0,0],[48,head],[48,shaft],[base,shaft],[base,head],[length,0],[base,-head],[base,-shaft],[48,-shaft],[48,-head]]
  :[[0,shaft],[base,shaft],[base,head],[length,0],[base,-head],[base,-shaft],[0,-shaft]];
 for(let y=65;y<185;y++)for(let x=65;x<185;x++){
  const t=((x+.5-80)+(y+.5-80))/Math.SQRT2,v=((y+.5-80)-(x+.5-80))/Math.SQRT2;
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
   const a=vertices[i],b=vertices[j];
   if((a[1]>v)!==(b[1]>v)&&t<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  if(inside){put(x,y);oracle.add(y*256+x);}
 }
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const n of [from,to]){cache.fill(n.box);n.portFrame=cache.portFrame(n.box);}
 return {image,from,to,budget,put,oracle,direction:both?'both':'forward',textMasks:[],otherNodes:[],shaftBox:{x:70,y:70,w:110,h:110}};
}
function axisFilledArrowFixture({vertical=false,reverse=false,both=false,roundCap=false}={}){
 const image={width:256,height:256,rgba:Buffer.alloc(256*256*4,255)},budget={used:0},oracle=new Set();
 const put=(x,y,color=[25,90,180])=>image.rgba.set([...color,255],(y*256+x)*4);
 const boxes=[{x:16,y:96,w:40,h:64},{x:200,y:96,w:40,h:64}];
 if(vertical)for(const b of boxes){const {x,y,w,h}=b;Object.assign(b,{x:y,y:x,w:h,h:w});}
 const nodes=boxes.map((box,i)=>({id:i?'b':'a',box}));
 for(const n of nodes)for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 const vertices=both?[[68,128],[96,148],[96,132],[160,132],[160,148],[188,128],[160,108],[160,124],[96,124],[96,108]]
  :[[68,132],[160,132],[160,148],[188,128],[160,108],[160,124],[68,124]];
 for(let y=100;y<156;y++)for(let x=60;x<196;x++){
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
   const a=vertices[i],b=vertices[j];
   if((a[1]>y+.5)!==(b[1]>y+.5)&&x+.5<(b[0]-a[0])*(y+.5-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  if(roundCap&&x<72&&(x+.5-72)**2+(y+.5-128)**2>16)inside=false;
  if(inside){const xx=vertical?y:x,yy=vertical?x:y;put(xx,yy);oracle.add(yy*256+xx);}
 }
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const n of nodes){cache.fill(n.box);n.portFrame=cache.portFrame(n.box);}
 return {image,from:nodes[reverse?1:0],to:nodes[reverse?0:1],budget,put,oracle,
  direction:both?'both':reverse?'backward':'forward',textMasks:[],otherNodes:[],shaftBox:vertical?{x:104,y:64,w:48,h:128}:{x:64,y:104,w:128,h:48}};
}
module.exports={filledArrowFixture,axisFilledArrowFixture};
