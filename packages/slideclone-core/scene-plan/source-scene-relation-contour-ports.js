// @ts-check
"use strict";
const {measuredSceneContourPort}=require('./source-scene-port-evidence');
/** A freeform site remains inside its measured envelope and is passed to the
 * existing native custom connection-site writer. This nomination authorizes
 * no ink and never replaces shaft, direction or attachment validation.
 * @param {Pick<Parameters<typeof import('./source-scene-relation').measureSceneRelationDetailed>[0],'image'|'from'|'to'> & {
 * horizontal:boolean,increasing:boolean,axis:number}} input */
function sceneRelationContourEnds({image,from,to,horizontal,increasing,axis}){
 const startSide=horizontal?(increasing?'right':'left'):(increasing?'bottom':'top');
 const endSide=horizontal?(increasing?'left':'right'):(increasing?'top':'bottom');
 const start=measuredSceneContourPort(image,from.portFrame,from.box,axis,startSide);
 const end=measuredSceneContourPort(image,to.portFrame,to.box,axis,endSide);
 if(!start||!end)return null;
 const a=from.box,b=to.box;
 return {start,end,startPosition:horizontal?(axis-a.y)/a.h:(axis-a.x)/a.w,endPosition:horizontal?(axis-b.y)/b.h:(axis-b.x)/b.w,
  startOffset:horizontal?{x:start.x-(increasing?a.x+a.w:a.x),y:0}:{x:0,y:start.y-(increasing?a.y+a.h:a.y)},
  endOffset:horizontal?{x:end.x-(increasing?b.x:b.x+b.w),y:0}:{x:0,y:end.y-(increasing?b.y:b.y+b.h)}};
}
/** JPEG/color variation at a source endpoint must use the opaque shaft
 * sample from that same validated profile. Keep the original 18-channel
 * port comparison; a page-wide median is an output color, not local evidence.
 * @param {number[][]} colors @param {boolean} start @param {boolean} increasing @param {string} fallback */
function sceneRelationEndpointColor(colors,start,increasing,fallback){
 const rgb=colors[start===increasing?0:colors.length-1];
 return rgb?'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase():fallback;
}
module.exports={sceneRelationContourEnds,sceneRelationEndpointColor};
