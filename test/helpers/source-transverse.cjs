'use strict';
function transverseFixture(){
 const width=120,height=80,pixels=new Uint8Array(width*height*4);
 for(let i=0;i<width*height;i++)pixels.set([240,240,240,255],i*4);
 const pixel=(x,y,rgb,alpha=255)=>pixels.set([...rgb,alpha],(y*width+x)*4);
 for(let x=20;x<80;x++)for(const [y,w]of [[39,.25],[40,1],[41,.75]])pixel(x,y,[200,160,120].map(v=>240-v*w));
 const path=Array.from({length:60},(_,i)=>({x:20+i,y:40}));
 return {source:{pixels,width,height},fit:{window:{x:0,y:0,w:120,h:80},edges:[{nativePolyline:true,path}]},pixel};
}
/** A deterministic corpus of source RGB, flanks, alpha and nearby arms.
 * Its frozen expectations were captured before the fused implementation. */
function transverseCorpus(){
 const cases=[];let state=0x71c09;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let n=0;n<32;n++){
  const f=transverseFixture(),vertical=n%2===1;
  if(vertical)f.fit.edges[0].path=Array.from({length:60},(_,i)=>({x:50,y:10+i}));
  const axis=vertical?0:1,base=vertical?50:40;
  const colors=[0,1,2].map(()=>[60+Math.floor(random()*100),60+Math.floor(random()*100)]);
  for(let i=0;i<60;i++)for(let off=-12;off<=12;off++){
   const mass=off===-1?.2:off===0?1:off===1?.6:0;
   const rgb=colors.map(c=>Math.round(230+off*.2-((c[0]*(1-i/59)+c[1]*i/59))*mass));
   const x=vertical?base+off:20+i,y=vertical?10+i:base+off;
   f.pixel(x,y,rgb,255);
  }
  // Deterministic contamination includes the contrast and channel boundaries.
  for(let k=0;k<20;k++){
   const at=12+Math.floor(random()*36),off=Math.floor(random()*25)-12;
   const x=vertical?base+off:20+at,y=vertical?10+at:base+off;
   f.pixel(x,y,[0,1,2].map(()=>Math.floor(random()*256)),n%4===0?239:255);
  }
  if(n%4===1)f.fit.edges.push({nativePolyline:false,path:[{x:axis===0?56:50,y:axis===0?40:46}]});
  if(n%3===0)f.fit.edges[0].path.reverse();
  cases.push(f);
 }
 return cases;
}
module.exports={transverseFixture,transverseCorpus};
