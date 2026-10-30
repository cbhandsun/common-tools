// @ts-check
'use strict';
const {measuredSceneVisibleGapReplacementScope}=require('./source-scene-visible-gap-compiler');
/** Clip only unbound legacy visual-atom approximations inside ONE completely
 * observed dashed window. All foreground and all gaps were classified at the
 * original source boundary. Test the entire old stroke footprint, not a box
 * intersection or centerline. Preserve external geometry and object inputs.
 * Semantic connectors retain the stricter whole-component replacement rule.
 * The caller validates all input records before invoking this internal stage.
 * @param {{image:import('../png').PngImage,slideSize:{widthPt:number,heightPt:number},
 * shapes:import('./source-scene-compiler').CompileInput['page']['shapes'],previous:object[],protectedMembers:Set<object>}} input
 * @param {Set<string>} referenced @param {{checks:number}} work */
function retireMeasuredSceneDashApproximations(input,referenced,work){
 const {image,slideSize,shapes,previous,protectedMembers}=input;
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 /** @type {{id:string,replacementId:string,retainedIds:string[]}[]} */const clipped=[];
 /** @type {{replacementId:string,horizontal:boolean,cells:Set<number>}[]} */const scopes=[];
 const ids=new Set(shapes.map(s=>s.id)),prior=new Set(previous),counts=new Map(),identities=new Map();
 for(const item of shapes){counts.set(item.id,(counts.get(item.id)??0)+1);identities.set(item,(identities.get(item)??0)+1);}
 for(const item of shapes){
  if(typeof item.id!=='string'||counts.get(item.id)!==1||identities.get(item)!==1)continue;
  const scope=measuredSceneVisibleGapReplacementScope(image,item);if(!scope)continue;
  work.checks+=scope.cells.size;if(work.checks>4000000)return clipped;
  scopes.push({replacementId:item.id,...scope});
 }
 for(let index=shapes.length-1;index>=0;index--){
  const item=shapes[index],style=item?.style,source=item?.source,b=item?.box;
  if(!item||typeof item.id!=='string'||!prior.has(item)||protectedMembers.has(item)||referenced.has(item.id)||item.type!=='line'||!style||!source||!b
   ||!/^[A-Za-z0-9_.:-]{1,256}$/u.test(item.id)||counts.get(item.id)!==1
   ||source.nativeRebuild!==true||source.semanticNativeStructure===true||source.detector!=='visual-atom-native-connector'
   ||source.fromAtomId||source.toAtomId||source.visualConnectorId
   ||Object.keys(style).some(k=>!['stroke','strokeWidthPt','connectorType','lineCap'].includes(k))
   ||style.connectorType!==undefined&&style.connectorType!=='straight'||style.lineCap!==undefined&&style.lineCap!=='flat'
   ||typeof style.stroke!=='string'||!/^#[0-9a-f]{6}$/iu.test(style.stroke)
   ||!Number.isFinite(style.strokeWidthPt)||Number(style.strokeWidthPt)<=0||![b.x,b.y,b.w,b.h].every(Number.isFinite)
   ||!(b.w===0&&b.h!==0||b.h===0&&b.w!==0))continue;
  const id=item.id,horizontal=b.h===0,scale=horizontal?sx:sy,acrossScale=horizontal?sy:sx;
  const first=(horizontal?b.x:b.y)*scale,last=first+(horizontal?b.w:b.h)*scale;
  const across=(horizontal?b.y:b.x)*acrossScale,half=Number(style.strokeWidthPt)*acrossScale/2;
  const low=Math.min(first,last),high=Math.max(first,last),minAcross=Math.floor(across-half),maxAcross=Math.ceil(across+half);
  if(half>12||high-low>16384||high-low<2||low<0||high>=(horizontal?image.width:image.height)
   ||minAcross<0||maxAcross>=(horizontal?image.height:image.width))continue;
  for(const scope of scopes){
   if(scope.horizontal!==horizontal)continue;
   let start=Infinity,end=-Infinity,interrupted=false;
   // Every pixel touched by the old stroke, including partial end cells,
   // needs this SAME receipt across its complete perpendicular footprint.
   for(let along=Math.floor(low+.5);along<=Math.ceil(high-.5);along++){
    let owned=true;
    for(let c=minAcross;c<=maxAcross;c++){
     if(++work.checks>4000000)return clipped;
     const x=horizontal?along:c,y=horizontal?c:along;
     if(!scope.cells.has(y*image.width+x)){owned=false;break;}
    }
    if(owned){if(end!==-Infinity&&along!==end+1)interrupted=true;start=Math.min(start,along);end=along;}
   }
   if(interrupted||end-start<1)continue;
   // Extend to the original endpoint only within its classified pixel cell.
   const cutLo=Math.max(low,start-.5),cutHi=Math.min(high,end+.5);
   const intervals=[[low,cutLo],[cutHi,high]].filter(([a,z])=>z!==undefined&&a!==undefined&&z-a>0);
   if(first>last){intervals.reverse();for(const interval of intervals)interval.reverse();}
   const retainedIds=intervals.map((_,i)=>i===0?id:`${id}-retained-${i+1}`);
   if(retainedIds.some(id=>id.length>256)||retainedIds.slice(1).some(id=>ids.has(id)))continue;
   const parts=intervals.map(([a,z],i)=>({...item,id:retainedIds[i]??id,box:horizontal
    ?{...b,x:Number(a)/scale,w:(Number(z)-Number(a))/scale}:{...b,y:Number(a)/scale,h:(Number(z)-Number(a))/scale}}));
   if(shapes.length-1+parts.length>10000)continue;
   shapes.splice(index,1,...parts);for(const id of retainedIds)ids.add(id);
   clipped.push({id,replacementId:scope.replacementId,retainedIds});break;
  }
 }
 return clipped;
}
module.exports={retireMeasuredSceneDashApproximations};
