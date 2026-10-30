// @ts-check
'use strict';
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,portFrame:object|null}} Node */
/** @typedef {(relation:import('./source-scene-plan').Relation)=>{from:Node|undefined,to:Node|undefined,otherNodes:Box[]}} ResolveNodes */
/** Resolve each relation before its measurement and output receipt are minted.
 * Proposal axes only select a candidate native part. Ordinary source shaft,
 * head, contour, scope and obstruction checks still decide acceptance.
 * @param {{image:import('../png').PngImage,icons:unknown[],nodes:Map<string,Node>,slideSize:{widthPt:number,heightPt:number},
 * binding:typeof import('./source-scene-native-icon').sceneNativeIconBinding,endpoint:typeof import('./source-scene-native-icon').sceneNativeIconEndpoint}} input
 * @returns {ResolveNodes} */
function createSceneIconRelationNodes({image,icons,nodes,slideSize,binding:sceneNativeIconBinding,endpoint:sceneNativeIconEndpoint}){
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 return relation=>{
  const admitted=icons.flatMap(result=>{const binding=sceneNativeIconBinding(image,result);
   return binding&&!binding.parentObjectId?[{result,id:binding.id,box:{x:binding.box.x*sx,y:binding.box.y*sy,w:binding.box.w*sx,h:binding.box.h*sy}}]:[];});
  const fromIcon=admitted.find(icon=>icon.id===relation.fromId),toIcon=admitted.find(icon=>icon.id===relation.toId);
  const a=fromIcon?.box??nodes.get(relation.fromId)?.box,b=toIcon?.box??nodes.get(relation.toId)?.box;
  let from=nodes.get(relation.fromId),to=nodes.get(relation.toId);
  if(a&&b){
   const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
   // Curved paths need endpoint tangent evidence; do not guess a contacted
   // part from a whole-route envelope. Leave those units unresolved for now.
   if(!relation.visiblePath||relation.visiblePath.vertices.length===2){
    const horizontal=Math.abs(bx-ax)>=Math.abs(by-ay),increasing=horizontal?bx>ax:by>ay;
    const hint=relation.shaftBox,axis=horizontal?(hint?hint.y+hint.h/2:(ay+by)/2):(hint?hint.x+hint.w/2:(ax+bx)/2);
    /** A diagonal shaft's middle can lie outside an endpoint. Its FULL
     * source envelope can select a unique contacted native part without
     * guessing a tangent or granting an attachment. Never pick among parts.
     * @param {typeof fromIcon} icon @param {string} side */
    const endpoint=(icon,side)=>{
     if(!icon)return undefined;
     const direct=sceneNativeIconEndpoint(image,icon.result,axis,side);if(direct)return direct;
     if(!hint)return undefined;
     const box=icon.box,start=Math.max(horizontal?box.y:box.x,horizontal?hint.y:hint.x);
     const end=Math.min(horizontal?box.y+box.h:box.x+box.w,horizontal?hint.y+hint.h:hint.x+hint.w);
     if(end<=start||Math.ceil(end)-Math.floor(start)>512)return undefined;
     /** @type {Map<string,Node>} */const candidates=new Map();
     for(let row=Math.floor(start);row<Math.ceil(end);row++){
      const node=sceneNativeIconEndpoint(image,icon.result,row+.5,side);if(node)candidates.set(node.id,node);
      if(candidates.size>1)return undefined;
     }
     return candidates.size===1?[...candidates.values()][0]:undefined;
    };
    if(!from)from=endpoint(fromIcon,horizontal?(increasing?'right':'left'):(increasing?'bottom':'top'));
    if(!to)to=endpoint(toIcon,horizontal?(increasing?'left':'right'):(increasing?'top':'bottom'));
   }
  }
  return {from,to,otherNodes:admitted.filter(icon=>icon.id!==relation.fromId&&icon.id!==relation.toId).map(icon=>({...icon.box}))};
 };
}
module.exports={createSceneIconRelationNodes};
