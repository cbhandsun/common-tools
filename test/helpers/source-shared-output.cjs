'use strict';
const assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../../packages/slideclone-core/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../../packages/slideclone-core/source-shared-route-compiler');
function sourceSharedOutputFixture(){
 const source=sourceSharedTreeFixture(),measured=measureSharedSourceRoute(source);assert.ok(measured.fit,measured.reason);
 const relations=source.nodes.slice(1).map((node,index)=>({id:'relation-'+index,regionId:'root',fromId:source.nodes[0].endpointId,toId:node.endpointId,direction:'forward'}));
 const built=compileSharedSourceRoute({fit:measured.fit,image:source.image,relations,id:'shared-output',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 const bodies=source.nodes.map(node=>({id:node.id,type:'rect',box:{...node.box},style:{fill:'#D2E6F5',stroke:'none'},source:{nativeRebuild:true,editable:true}}));
 return {...source,fit:measured.fit,built,bodies,shapes:[...bodies,...built.parts]};
}
module.exports={sourceSharedOutputFixture};
