'use strict';
function adaptiveBackgroundFixture(){
 const width=80,height=80,image={width,height,rgba:Buffer.alloc(width*height*4)},component=new Uint8Array(width*height),blocked=new Uint8Array(width*height);
 for(let n=0;n<width*height;n++)image.rgba.set([235,248,241,255],n*4);
 for(let y=40;y<=52;y++)for(let x=40;x<=52;x++)if(Math.abs(Math.hypot(x-40,y-40)-10)<=1){component[y*width+x]=1;image.rgba.set([30,60,90,255],(y*width+x)*4);}
 // The source has four independent visible patches at an asymmetric frame.
 // A sparse ten-level noise mark makes each earlier fixed-grid frame's
 // corner unavailable without creating a hard source contradiction.
 const protectedCorners=[[30,30],[66,30],[30,62],[66,62]];
 const offsets=[[-4,-4],[-4,4],[4,-4],[4,4],[0,-4],[0,4],[-4,0],[4,0]];
 const tiles=new Set([...component.keys()].filter(n=>component[n]).map(n=>(Math.floor(n%width/8)*8+4)+','+(Math.floor(Math.floor(n/width)/8)*8+4)));
 for(const key of tiles){
  const [tx,ty]=key.split(',').map(Number),frames=[[tx,ty,12,12],[tx,ty,20,20],[tx,ty,24,24]];
  for(const [dx,dy]of [[0,0],...offsets])for(const [rx,ry]of [[24,24],[20,20],[24,12],[12,24],[32,16],[16,32]])frames.push([tx+dx,ty+dy,rx,ry]);
  for(const [cx,cy,rx,ry]of frames){
   if(cx-rx<0||cy-ry<0||cx+rx>=width||cy+ry>=height)continue;
   let placed=false;
   for(const [dx,dy]of [[-rx+2,-ry+2],[rx-2,-ry+2],[-rx+2,ry-2],[rx-2,ry-2]]){
    const x=cx+dx-1,y=cy+dy-1,n=y*width+x;
    if(component[n]||protectedCorners.some(([px,py])=>Math.abs(px-x)<=1&&Math.abs(py-y)<=1))continue;
    image.rgba[n*4]=245;placed=true;break;
   }
   if(!placed)throw new Error('No independent unavailable corner for the earlier source frames');
  }
 }
 return {image,window:{x:0,y:0,w:width,h:height},component,blocked,covered:new Set(),work:{checks:0}};
}
module.exports={adaptiveBackgroundFixture};
