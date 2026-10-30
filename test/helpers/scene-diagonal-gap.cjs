'use strict';
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture({reverse=false,up=false,vertical=false}={}){
 const image={width:220,height:220,rgba:Buffer.alloc(220*220*4,255)},budget={used:0},oracle=new Set();
 const transform=(a,c)=>{let x=a,y=c+(up?180-a:a);if(vertical)[x,y]=[y,x];return {x,y};};
 const put=(x,y,rgb=[30,60,90])=>image.rgba.set([...rgb,255],(y*image.width+x)*4);
 const nodes=[{id:'a',box:{x:20,y:up?140:20,w:30,h:30}},{id:'b',box:{x:140,y:up?20:140,w:30,h:30}}];
 if(vertical)for(const n of nodes)n.box={x:n.box.y,y:n.box.x,w:30,h:30};
 for(const n of nodes)for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(let a=60;a<=130;a++)for(let c=-1;c<=1;c++){const p=transform(a,c);put(p.x,p.y);oracle.add(p.y*220+p.x);}
 for(let a=124;a<=130;a++)for(let c=-(130-a);c<=130-a;c++){const p=transform(a,c);put(p.x,p.y);oracle.add(p.y*220+p.x);}
 const cache=createSceneMeasurementCache(image,[],budget);for(const n of nodes){cache.fill(n.box);n.portFrame=cache.portFrame(n.box);}
 const [from,to]=reverse?[nodes[1],nodes[0]]:nodes;
 return {image,from,to,direction:reverse?'backward':'forward',textMasks:[],otherNodes:[],budget,shaftBox:{x:55,y:45,w:85,h:100},put,transform,oracle};
}
module.exports={diagonalGapFixture:fixture};
