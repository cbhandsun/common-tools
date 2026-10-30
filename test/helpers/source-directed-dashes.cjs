'use strict';
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture(vertical=false){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0},axis=vertical?90:60;
 const from={id:'a',box:vertical?{x:70,y:20,w:40,h:30}:{x:20,y:40,w:50,h:40}};
 const to={id:'b',box:vertical?{x:70,y:120,w:40,h:30}:{x:170,y:40,w:50,h:40}};
 const rgb=[30,60,90],lo=vertical?54:74,hi=vertical?115:165,headLo=hi-25;
 const put=(a,c,color=rgb)=>image.rgba.set([...color,255],((vertical?a:c)*240+(vertical?c:a))*4);
 for(const node of [from,to])for(let y=node.box.y;y<node.box.y+node.box.h;y++)for(let x=node.box.x;x<node.box.x+node.box.w;x++)image.rgba.set([210,230,245,255],(y*240+x)*4);
 const dashes=vertical?[[54,57],[64,68],[75,79]]:[[74,85],[96,108],[119,129]];
 for(const [first,last] of dashes)for(let a=first;a<=last;a++)for(let c=axis-1;c<=axis+1;c++)put(a,c);
 const head=(kind='triangle',color=rgb)=>{
  for(let a=headLo;a<=hi;a++)for(let c=axis-6;c<=axis+6;c++)put(a,c,[255,255,255]);
  for(let a=headLo;a<=hi;a++){
   const radius=kind==='rectangle'?6:a>=hi-6?hi-a:1;
   for(let c=axis-radius;c<=axis+radius;c++)put(a,c,color);
  }
 };
 head();
 const cache=createSceneMeasurementCache(image,[],budget);cache.fill(from.box);cache.fill(to.box);
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,budget,from,to,direction:'forward',textMasks:[],otherNodes:[],vertical,axis,lo,hi,headLo,put,head,dashes};
}

function coveredFixture(vertical=false){
 const f=fixture(vertical),paint=[30,60,90];
 for(let a=f.headLo;a<=f.hi;a++){
  const radius=a>=f.hi-6?f.hi-a:1,alpha=(a-f.headLo)%2?.4:.8;
  for(let c=f.axis-radius;c<=f.axis+radius;c++)f.put(a,c,paint.map(v=>Math.round(v*alpha+255*(1-alpha))));
 }
 return f;
}
module.exports={fixture,coveredFixture};
