'use strict';
const assert=require('node:assert/strict');
const {sourceLabelIdentity}=require('../../packages/slideclone-core/scene-plan/source-label-identity');
const {bindSceneTextEndpoints}=require('../../packages/slideclone-core/scene-plan/source-scene-text-endpoints');
function fixture(flipX=false,flipY=false){
 const width=260,height=220,image={width,height,rgba:Buffer.alloc(width*height*4,255)},budget={used:0};
 const point=(x,y)=>({x:flipX?width-1-x:x,y:flipY?height-1-y:y});
 const put=(x,y,color=[20,80,220])=>{const p=point(x,y);image.rgba.set([...color,255],(p.y*width+p.x)*4);};
 const box=b=>({...point(flipX?b.x+b.w-1:b.x,flipY?b.y+b.h-1:b.y),w:b.w,h:b.h});
 for(let y=148;y<=152;y++)for(let x=80;x<=182;x++)put(x,y);
 for(let y=70;y<=152;y++)for(let x=178;x<=182;x++)put(x,y);
 for(let y=70;y<=90;y++){const r=Math.floor((y-70)/2);for(let x=180-r;x<=180+r;x++)put(x,y);}
 const boxes=[box({x:20,y:140,w:40,h:20}),box({x:165,y:20,w:30,h:30})];
 const endpoints=boxes.map((b,i)=>({id:'endpoint-'+i,regionId:'region-root',box:b,labelRef:sourceLabelIdentity(b,{widthPx:width,heightPx:height})}));
 const texts=endpoints.map((e,i)=>({id:'text-'+i,text:'label',box:e.box,source:{ocrLabelRef:e.labelRef,ocrLabelBox:{...e.box},evidenceBox:{...e.box}}}));
 const bound=bindSceneTextEndpoints(image,endpoints,texts,{widthPt:width,heightPt:height});assert.deepEqual(bound.rejected,[]);
 const from=bound.nodes.get('endpoint-0'),to=bound.nodes.get('endpoint-1');
 const vertices=[[80,150],[180,150],[180,70]].map(([x,y])=>point(x,y));
 const shaftBox=box({x:78,y:68,w:112,h:87}),visiblePath={kind:'polyline',dash:'solid',vertices};
 const relation={id:'relation-bent',regionId:'region-root',fromId:'endpoint-0',toId:'endpoint-1',direction:'forward',shaftBox,visiblePath};
 return {image,budget,from,to,direction:'forward',textMasks:boxes,otherNodes:[],shaftBox,visiblePath,relation,texts,put,point};
}

module.exports={fixture};
