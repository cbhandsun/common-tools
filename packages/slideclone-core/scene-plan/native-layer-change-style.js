// @ts-check
'use strict';
const {record,list,snapshot}=require('./approved-frame-application-input');
const invalid=()=>new TypeError('native-layer-plan-invalid');
/** @param {unknown} value @returns {value is string} */
const color=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/iu.test(value);
/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
/** @param {Record<string,unknown>} value @param {string[]} allowed */
function keys(value,allowed){if(Object.keys(value).some(key=>!allowed.includes(key)))throw invalid();}
/** @param {unknown} value */
function gradient(value){
 const g=record(value);keys(g,['type','angleDeg','stops']);
 if(g.type!=='linear'||!finite(g.angleDeg,0,360))throw invalid();
 const stops=list(g.stops,16);if(stops.length<2)throw invalid();let previous=-1;
 for(const raw of stops){const s=record(raw);keys(s,['position','color','alpha']);
  if(!finite(s.position,0,1)||s.position<=previous||!color(s.color)||s.alpha!==undefined&&!finite(s.alpha,0,1))throw invalid();previous=s.position;}
 if(record(stops[0]).position!==0||record(stops.at(-1)).position!==1)throw invalid();
}
/** @param {unknown} value */
function glow(value){const g=record(value);keys(g,['radiusPt','alpha','color']);
 if(!finite(g.radiusPt,0,40)||!finite(g.alpha,0,1)||!color(g.color))throw invalid();}
/** @param {Record<string,unknown>} style */
function effects(style){if(style.gradient!==undefined&&style.gradient!==null)gradient(style.gradient);if(style.glow!==undefined&&style.glow!==null)glow(style.glow);}
/** A reviewed appearance change cannot change a path, anchor or text content.
 * This validates a proposal; it confers no source or application authority.
 * @param {unknown} object @param {unknown} after @param {boolean} text */
function changedStyle(object,after,text){
 const item=record(object),before=item.style===undefined?{}:record(item.style),style=record(after);
 const allowed=text?['textOutlineColor','textOutlineWidthPt']:['fill','gradient','glow'];
 const retained=(/** @type {Record<string,unknown>} */ value)=>Object.fromEntries(Object.entries(value).filter(([key])=>!allowed.includes(key)));
 if(snapshot(retained(before))!==snapshot(retained(style)))throw invalid();
 if(text){
  if(style.textOutlineColor!==undefined||style.textOutlineWidthPt!==undefined)
   if(!color(style.textOutlineColor)||!finite(style.textOutlineWidthPt,0,8))throw invalid();
 }else{
  if(style.fill!==undefined&&style.fill!=='none'&&!color(style.fill))throw invalid();effects(style);
  const source=item.source===undefined?{}:record(item.source);
  if((source.connector===true||source.sceneRelationId!==undefined||item.type==='line'
   ||item.type==='freeform'&&(before.fill==='none'||before.closed===false))
   &&(snapshot(before.gradient)!==snapshot(style.gradient)||before.fill!==style.fill))throw invalid();
 }
 return style;
}
/** @param {unknown} input @param {{widthPt:number,heightPt:number}} slideSize */
function addedShape(input,slideSize){
 const shape=record(input);keys(shape,['id','type','box','style']);
 if(typeof shape.type!=='string'||!['rect','roundRect','ellipse','line'].includes(shape.type))throw invalid();
 const box=record(shape.box),style=record(shape.style);keys(box,['x','y','w','h']);
 if(!finite(box.x,0,slideSize.widthPt)||!finite(box.y,0,slideSize.heightPt)
  ||!finite(box.w,0,slideSize.widthPt)||!finite(box.h,0,slideSize.heightPt)
  ||box.w+box.h===0||shape.type!=='line'&&(box.w===0||box.h===0)
  ||box.x+box.w>slideSize.widthPt||box.y+box.h>slideSize.heightPt)throw invalid();
 keys(style,['fill','stroke','strokeWidthPt','opacity','radiusPt','gradient','lineCap']);
 if(style.fill!=='none'&&!color(style.fill)||style.stroke!=='none'&&!color(style.stroke)
  ||style.strokeWidthPt!==undefined&&!finite(style.strokeWidthPt,0,40)||style.opacity!==undefined&&!finite(style.opacity,0,1)
  ||style.radiusPt!==undefined&&(shape.type!=='roundRect'||!finite(style.radiusPt,0,Math.min(box.w,box.h)/2))
  ||style.lineCap!==undefined&&!['flat','round','square'].includes(String(style.lineCap)))throw invalid();
 effects(style);return shape;
}
module.exports={changedStyle,addedShape,finite,keys};
