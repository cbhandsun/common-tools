'use strict';
function sourceHollowNodes(){
 const image={width:220,height:180,rgba:Buffer.alloc(220*180*4,255)},hints=[{x:20,y:20,w:70,h:120},{x:140,y:20,w:60,h:120}];
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*image.width+x)*4);
 for(const b of hints)for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){
  if(x<b.x+3||x>=b.x+b.w-3||y<b.y+3||y>=b.y+b.h-3)put(x,y,[30,60,90]);
  else if(x>=b.x+6&&x<b.x+b.w-6&&y>=b.y+6&&y<b.y+b.h-6)put(x,y,(x+y)%2?[90,160,220]:[220,160,90]);
 }
 for(let x=90;x<140;x++)for(let y=49;y<=51;y++)put(x,y,[30,60,90]);
 for(let x=134;x<140;x++)for(let y=50-(139-x);y<=50+(139-x);y++)put(x,y,[30,60,90]);
 return {image,hints,shaftBox:{x:91,y:43,w:48,h:14}};
}
module.exports={sourceHollowNodes};
