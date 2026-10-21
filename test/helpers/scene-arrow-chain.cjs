'use strict';
function sourceArrowChain(){
 const image={width:1640,height:100,rgba:Buffer.alloc(1640*100*4,255)},put=(x,y,c)=>image.rgba.set([...c,255],(y*image.width+x)*4);
 const objects=Array.from({length:27},(_,i)=>({id:'n'+i,regionId:'root',kind:'container',pictorialContent:'absent',box:{x:20+i*60,y:20,w:40,h:60}}));
 for(const o of objects)for(let y=20;y<80;y++)for(let x=o.box.x;x<o.box.x+40;x++)put(x,y,x<o.box.x+2||x>=o.box.x+38||y<22||y>=78?[90,40,60]:[210,230,245]);
 for(let i=0;i<26;i++){
  const lo=objects[i].box.x+40,end=objects[i+1].box.x;
  for(let x=lo;x<end;x++)for(let y=49;y<=51;y++)put(x,y,[30,60,90]);
  for(let x=end-6;x<end;x++)for(let y=50-(end-1-x);y<=50+(end-1-x);y++)put(x,y,[30,60,90]);
 }
 const relations=Array.from({length:26},(_,i)=>({id:'e'+i,regionId:'root',fromId:'n'+i,toId:'n'+(i+1),direction:'forward'}));
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1640,h:100}}],objects,
  relations:relations.slice(0,24),inventory:[['root',27,0,26]]};
 return {image,scene,relations};
}
module.exports={sourceArrowChain};
