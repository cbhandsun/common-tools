'use strict';
function supplementaryBackgroundFixture(){
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4)},component=new Uint8Array(80*80),blocked=new Uint8Array(80*80);
 for(let n=0;n<80*80;n++)image.rgba.set([235,248,241,255],n*4);
 for(let y=40;y<=52;y++)for(let x=40;x<=52;x++)if(Math.abs(Math.hypot(x-40,y-40)-10)<=1){component[y*80+x]=1;image.rgba.set([30,60,90,255],(y*80+x)*4);}
 const protectedCorners=[[34,18],[54,18],[34,62],[54,62]];
 const tiles=new Set([...component.keys()].filter(n=>component[n]).map(n=>(Math.floor(n%80/8)*8+4)+','+(Math.floor(Math.floor(n/80)/8)*8+4)));
 for(const key of tiles){
  const [tx,ty]=key.split(',').map(Number),fields=[[tx,ty,12,12],[tx,ty,20,20],[tx,ty,24,24]];
  for(const [dx,dy]of [[-4,-4],[-4,4],[4,-4],[4,4]])for(const [rx,ry]of [[24,24],[20,20],[24,12],[12,24]])fields.push([tx+dx,ty+dy,rx,ry]);
  for(const [cx,cy,rx,ry]of fields){
   let placed=false;
   for(const [dx,dy]of [[-rx+2,-ry+2],[rx-2,-ry+2],[-rx+2,ry-2],[rx-2,ry-2]]){
    const x=cx+dx-1,y=cy+dy-1,n=y*80+x;
    if(x<0||y<0||x>=80||y>=80||component[n]||protectedCorners.some(([px,py])=>Math.abs(px-x)<=1&&Math.abs(py-y)<=1))continue;
    // A single +10 sample makes this corner unavailable, without creating
    // a hard source contradiction. The protected mixed-phase field remains
    // independently verifiable against all of its exterior samples.
    image.rgba[n*4]=245;placed=true;break;
   }
   if(!placed)throw new Error('Supplementary fixture has no unprotected sample');
  }
 }
 return {image,window:{x:0,y:0,w:80,h:80},component,blocked,covered:new Set(),work:{checks:0}};
}
module.exports={supplementaryBackgroundFixture};
