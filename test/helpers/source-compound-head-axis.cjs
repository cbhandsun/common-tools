'use strict';
function compoundHeadAxisFixture({tipX=350}={}){
 const width=tipX+50,height=150,rgba=Buffer.alloc(width*height*4,255),mask=new Uint8Array(width*height),path=[];
 const put=(x,y)=>{mask[y*width+x]=1;rgba.set([20,80,210,255],(y*width+x)*4);};
 for(let i=0;i<=100;i++){
  const angle=Math.PI+i*Math.PI/200,p={x:Math.round(80+50*Math.cos(angle)),y:Math.round(100+50*Math.sin(angle))};
  if(!path.length||path.at(-1).x!==p.x||path.at(-1).y!==p.y)path.push(p);
 }
 for(let x=81;x<=tipX;x++)path.push({x,y:50});
 for(const p of path)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)put(p.x+dx,p.y+dy);
 for(let x=tipX-50;x<=tipX;x++){const radius=Math.floor((tipX-x)/2);for(let y=50-radius;y<=50+radius;y++)put(x,y);}
 // All these original, adjacent path cells stay inside the separately
 // certified broad head. Their lateral motion is irrelevant to the shaft.
 for(const p of path)if(p.x>=tipX-46&&p.x<=tipX-7){const t=(p.x-tipX+46)%8;p.y+=t<=2?t:t<=6?4-t:t-8;}
 return {mask,width,height,rgba,path,direction:'forward',background:[255,255,255],work:{checks:0}};
}
module.exports={compoundHeadAxisFixture};
