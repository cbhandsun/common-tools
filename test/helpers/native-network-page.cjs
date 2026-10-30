'use strict';
const assert=require('node:assert/strict');
const {fitWholeRouteNativeNetwork}=require('../../packages/slideclone-core/routing/whole-route-network-fit');
const original=require('../fixtures/whole-native-network-input.json');
function nativeNetworkPage(index=1){
 const input={...structuredClone(original[index]),approximation:'semantic-native',work:{checks:0}};
 const network=fitWholeRouteNativeNetwork(input);assert.ok(network);const shapes=[];
 const anchor=nodeId=>({elementId:'node-'+nodeId,side:'top',position:.5,dyPt:5});
 for(const n of network.nodes.filter(n=>n.endpointId!==null))shapes.push({id:'node-'+n.id,type:'rect',box:{x:n.point.x-10,y:n.point.y-5,w:20,h:10},style:{fill:'#FFFFFF'},source:{sceneInventoryId:n.endpointId}});
 const relations=network.paths.map(p=>{
  const a=p.chains[0],b=p.chains.at(-1),first=network.chains[a.index],last=network.chains[b.index],s=p.points[0],e=p.points.at(-1);
  const elementId='line-'+p.relationId;
  shapes.push({id:elementId,type:'line',box:{x:s.x,y:s.y,w:e.x-s.x,h:e.y-s.y},
   style:{...p.connector,fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',endArrow:'triangle',strokeDash:'dash',
    strokeGradient:{type:'linear',angleDeg:90,stops:[{position:0,color:'#123456'},{position:1,color:'#654321'}]},
    startAnchor:anchor(a.reversed?first.to:first.from),endAnchor:anchor(b.reversed?last.from:last.to)},
   source:{sceneRelationId:p.relationId,sourceFootprintVerified:false}});
  return {relationId:p.relationId,elementId};
 });
 const used=new Set(network.paths.flatMap(p=>p.chains.map(r=>r.index))),arms=[];
 const {nativeElbowConnector}=require('../../packages/slideclone-core/routing/source-route-native-elbow');
 for(const [i,chain]of network.chains.entries())if(!used.has(i)){
  const points=chain.points,s=points[0],e=points.at(-1),elementId='arm-'+i;
  const controls=[s,e].map((p,j)=>{
   const id=elementId+'-control-'+j;shapes.push({id,type:'rect',box:{x:p.x-.05,y:p.y-.05,w:.1,h:.1},
    style:{fill:'none',stroke:'none',strokeWidthPt:0},source:{routeControl:true}});return {elementId:id,side:'top',position:.5,dyPt:.05};
  });
  shapes.push({id:elementId,type:'line',box:{x:s.x,y:s.y,w:e.x-s.x,h:e.y-s.y},
   style:{...nativeElbowConnector(points),fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',startAnchor:controls[0],endAnchor:controls[1]},source:{role:'source-network-arm'}});
  arms.push({edgeIds:chain.refs.map(r=>r.id),elementId,reversed:false});
 }
 return {...input,work:{checks:0},relations,arms,page:{pageIndex:0,shapes,images:[],textBoxes:[],tables:[],charts:[],icons:[]}};
}
module.exports={nativeNetworkPage};
