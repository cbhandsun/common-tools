'use strict';
// Independently constructed topology fixtures; no source image or retained IDs.
const definitions=[
 {name:'straight',points:[[0,0],[100,0]],pairs:[[0,1]],terminals:[0,1],paths:[[0]],cycles:0},
 {name:'elbow',points:[[0,0],[0,50],[100,50]],pairs:[[0,1],[1,2]],terminals:[0,2],paths:[[0,1]],cycles:0},
 {name:'branch-tree',points:[[0,0],[0,40],[-50,40],[50,40]],pairs:[[0,1],[1,2],[1,3]],terminals:[0,2,3],paths:[[0,1],[0,2]],cycles:0},
 {name:'two-sided-cycle',points:[[-20,0],[0,0],[60,0],[60,60],[0,60],[80,60]],pairs:[[0,1],[1,2],[2,3],[3,4],[4,1],[3,5]],
  terminals:[0,5],paths:[[0,1,2,5],[0,-5,-4,5]],cycles:1}
];
function syntheticNetwork(index,scale=1,mirror=1){
 const definition=definitions[index];if(!definition)throw new Error('Unknown synthetic network');
 const points=definition.points.map(([x,y])=>({x:x*scale*mirror+173,y:y*scale+91}));
 const graph={nodes:points.map((_,i)=>({id:'synthetic-'+i,endpointId:definition.terminals.includes(i)?'terminal-'+i:null})),
  edges:definition.pairs.map(([a,b],i)=>({id:'edge-'+i,from:'synthetic-'+a,to:'synthetic-'+b,memberId:'part-'+i})),
  paths:definition.paths.map((edges,i)=>({relationId:'business-'+i,edges:edges.map(value=>({id:'edge-'+(value<0?-value-1:value),reversed:value<0}))}))};
 const parts=definition.pairs.map(([a,b],i)=>({id:'part-'+i,type:'line',box:{x:points[a].x,y:points[a].y,w:points[b].x-points[a].x,h:points[b].y-points[a].y},style:{fill:'none',strokeWidthPt:2*scale}}));
 return {name:definition.name,cycles:definition.cycles,input:{graph,parts,approximation:'semantic-native',work:{checks:0}}};
}
module.exports={syntheticNetwork};
