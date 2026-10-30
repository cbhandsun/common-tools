'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {replaceMeasuredSceneConnectors}=require('../packages/slideclone-core/scene-plan/source-scene-replaced-connectors');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
function fixture(){
 const f=sourceSharedTreeFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const relations=f.nodes.slice(1).map((node,i)=>({id:'relation-'+i,regionId:'root',fromId:f.nodes[0].endpointId,toId:node.endpointId,direction:'forward'}));
 const built=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'shared-replacement',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 const bodies=f.nodes.map(node=>({id:node.id,type:'rect',box:{...node.box},style:{fill:'#D2E6F5',stroke:'none'},source:{nativeRebuild:true,editable:true}}));
 const old=structuredClone(built.parts.find(part=>part.style.endArrow));old.id='prior-arrow';delete old.style.startAnchor;delete old.style.endAnchor;
 // A prior duplicate arrow is a straight segment. When the tree edge is a
 // native elbow, that duplicate lies along the elbow's final leg.
 const route=old.source.nativeRoutePoints;
 if(Array.isArray(route)&&route.length>2){
  const a=route[route.length-2],z=route[route.length-1];
  old.box={x:a.x,y:a.y,w:z.x-a.x,h:z.y-a.y};
  for(const key of ['connectorType','connectorFrame','connectorAdjustments'])delete old.style[key];
  delete old.source.nativeRoutePoints;delete old.source.nativeConnectorRoute;
 }
 return {...f,built,bodies,old,shapes:[...bodies,...built.parts,old]};
}
function replace(f,extra={}){return replaceMeasuredSceneConnectors({image:f.image,slideSize:{widthPt:300,heightPt:230},shapes:f.shapes,previous:[f.old],protectedMembers:new Set(),...extra});}
test('one complete privately compiled shared tree retires an old duplicate arrow without replacing the tree',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=replace(f);
 assert.equal(result.removed.length,1);assert.equal(result.removed[0].id,'prior-arrow');
 assert.equal(f.shapes.includes(f.old),false);for(const part of f.built.parts)assert.ok(f.shapes.includes(part));
 assert.deepEqual(f.image.rgba,before);assert.ok(result.checks<=4000000);
});
test('shared retirement requires unchanged complete members, unique live endpoints and the original source',()=>{
 for(const mode of ['clone','delete-edge','delete-joint','changed-paint','delete-body','duplicate-body','resize-body','cross-source']){
  const f=fixture();
  if(mode==='clone')f.shapes=[...f.bodies,...structuredClone(f.built.parts),f.old];
  if(mode==='delete-edge')f.shapes=f.shapes.filter(part=>part!==f.built.parts.find(p=>p.type==='line'));
  if(mode==='delete-joint')f.shapes=f.shapes.filter(part=>part!==f.built.parts.find(p=>p.type==='rect'));
  if(mode==='changed-paint')f.built.parts[0].style.stroke='#FFFFFF';
  if(mode==='delete-body')f.shapes=f.shapes.filter(part=>part!==f.bodies[0]);
  if(mode==='duplicate-body')f.shapes.push(structuredClone(f.bodies[0]));
  if(mode==='resize-body')f.bodies[0].box.w++;
  if(mode==='cross-source')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  assert.equal(replace(f).removed.length,0,mode);assert.ok(f.shapes.includes(f.old),mode);
 }
});
test('opposing heads, heads at the wrong point, protected and already attached old lines remain',()=>{
 for(const mode of ['opposing','wrong-point','protected','attached','unrelated']){
  const f=fixture();let extra={};
  if(mode==='opposing'){f.old.style.startArrow=f.old.style.endArrow;delete f.old.style.endArrow;}
  if(mode==='wrong-point'){f.old.box.y+=15;f.old.box.h-=15;f.old.style.startArrow=f.old.style.endArrow;delete f.old.style.endArrow;}
  if(mode==='protected')extra={protectedMembers:new Set([f.old])};
  if(mode==='attached')f.old.style.startAnchor={elementId:'native-source',side:'bottom',position:.5};
  if(mode==='unrelated')f.old.box.x+=20;
  assert.equal(replace(f,extra).removed.length,0,mode);assert.ok(f.shapes.includes(f.old),mode);
 }
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/source-shared-route-replacement.test.js'));
});

test('shared component retires a matching transparent crop and preserves unrelated pictorial ink',t=>{
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'shared-arrow-assets-'));
 t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true,force:true});});
 for(const unrelated of [false,true]){
  const f=fixture(),raster={width:13,height:60,rgba:Buffer.alloc(13*60*4)};
  for(let y=0;y<60;y++)for(let x=0;x<13;x++){
   const source=((110+y)*300+44+x)*4;
   if(f.image.rgba[source]===30)raster.rgba.set([30,60,90,255],(y*13+x)*4);
  }
  if(unrelated)raster.rgba.set([20,80,220,255],0);
  const name=unrelated?'icon.png':'arrow.png';writePng(path.join(root,name),raster);
  const item={id:'prior-source-crop',assetPath:name,box:{x:44,y:110,w:13,h:60},source:{nativeRebuild:true}},images=[item];
  const before=Buffer.from(f.image.rgba),result=replace(f,{images,root});
  assert.equal(result.removedImages.length,unrelated?0:1);assert.equal(images.includes(item),unrelated);
  assert.deepEqual(f.image.rgba,before);
 }
});

test('invalid current endpoint cannot trigger partial old-line retirement',()=>{
 const f=fixture(),before=f.shapes.slice();let conversions=0;
 f.bodies[0].box.x={[Symbol.toPrimitive](){conversions++;return 130;}};
 assert.throws(()=>replace(f),/shared paint/);assert.equal(conversions,0);assert.deepEqual(f.shapes,before);
});
