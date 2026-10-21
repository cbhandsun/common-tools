'use strict';
// Synthetic writer-capability fixture. This is not source reconstruction or a
// production graph receipt; no source pixels, observations or census are claimed.
function sharedJunctionFixture(){
 // Source-compiled containers use custom geometry with measured connection
 // sites. Generic preset roundRects do not carry that existing writer contract.
 const outline=[{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},
  {type:'lnTo',points:[{x:1,y:1}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}];
 const shapes=[
  {id:'node-source',type:'freeform',box:{x:260,y:30,w:80,h:40},style:{fill:'#D2E6F5',stroke:'#1E3C5A',strokeWidthPt:1,freeformSegments:outline}},
  {id:'node-left',type:'freeform',box:{x:60,y:260,w:80,h:40},style:{fill:'#D2E6F5',stroke:'#1E3C5A',strokeWidthPt:1,freeformSegments:outline}},
  {id:'node-right',type:'freeform',box:{x:460,y:260,w:80,h:40},style:{fill:'#D2E6F5',stroke:'#1E3C5A',strokeWidthPt:1,freeformSegments:outline}}
 ];
 const joints=[{id:'graph-junction',x:300,y:160},{id:'graph-left-turn',x:100,y:160},{id:'graph-right-turn',x:500,y:160}];
 for(const point of joints)shapes.push({id:point.id,type:'rect',box:{x:point.x-.05,y:point.y-.05,w:.1,h:.1},
  style:{fill:'none',stroke:'none',strokeWidthPt:0}});
 const edges=[
  {id:'graph-trunk',from:'node-source',to:'graph-junction',start:{x:300,y:70},end:{x:300,y:160},startSide:'bottom',endSide:'top'},
  {id:'graph-left-branch',from:'graph-junction',to:'graph-left-turn',start:{x:300,y:160},end:{x:100,y:160},startSide:'left',endSide:'right'},
  {id:'graph-right-branch',from:'graph-junction',to:'graph-right-turn',start:{x:300,y:160},end:{x:500,y:160},startSide:'right',endSide:'left'},
  {id:'graph-left-terminal',from:'graph-left-turn',to:'node-left',start:{x:100,y:160},end:{x:100,y:260},startSide:'bottom',endSide:'top',arrow:true},
  {id:'graph-right-terminal',from:'graph-right-turn',to:'node-right',start:{x:500,y:160},end:{x:500,y:260},startSide:'bottom',endSide:'top',arrow:true}
 ];
 for(const edge of edges)shapes.push({id:edge.id,type:'line',box:{x:edge.start.x,y:edge.start.y,w:edge.end.x-edge.start.x,h:edge.end.y-edge.start.y},
  style:{fill:'none',stroke:'#1E3C5A',strokeWidthPt:1.5,
   startAnchor:{elementId:edge.from,side:edge.startSide,position:.5},endAnchor:{elementId:edge.to,side:edge.endSide,position:.5},
   ...(edge.arrow?{endArrow:'triangle'}:{})}});
 return {deck:{version:'1.0',slideSize:{widthPt:600,heightPt:340},pages:[{pageIndex:0,shapes,images:[],textBoxes:[],tables:[],charts:[]}]},edges,
  logicalPaths:[['graph-trunk','graph-left-branch','graph-left-terminal'],['graph-trunk','graph-right-branch','graph-right-terminal']]};
}
module.exports={sharedJunctionFixture};
