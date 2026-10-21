"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {canErasePreservedInteriorPath}=require("../packages/slideclone-core/residual-preserved-path");
const {residualEraseObjects}=require("../packages/slideclone-core/team-native-rebuild");
const {eraseObjectMask}=require("../packages/slideclone-core/full-slide-native-residual");
const {eraseMasks}=require("../packages/slideclone-core/residual-primitive-erasure");
const {auditResidualPixelOwnership}=require("../packages/slideclone-core/residual-pixel-ownership");
function ring(){
 const loop=points=>[{type:"moveTo",points:[points[0]]},...points.slice(1).map(point=>({type:"lnTo",points:[point]})),{type:"close",points:[]}];
 const p=(x,y)=>({x,y});
 return {id:"outline",type:"freeform",box:{x:5,y:5,w:20,h:20},style:{fill:"#204060",stroke:"none",freeformSegments:[
  ...loop([p(0,0),p(1,0),p(1,1),p(0,1)]),...loop([p(.1,.1),p(.1,.9),p(.9,.9),p(.9,.1)])]},
  source:{detector:"source-scene-outline",editable:true,nativeRebuild:true,semanticNativeStructure:true,preserveResidualInterior:true,residualBackgroundFill:false,sourcePerimeterSupport:1}};
}
test("production residual selection removes a measured old ring without owning its interior",()=>{
 const shape=ring(),source={width:30,height:30,rgba:Buffer.alloc(3600,255)};
 for(let y=5;y<25;y++)for(let x=5;x<25;x++)source.rgba.set(x>=7&&x<23&&y>=7&&y<23?[220,60,90,255]:[32,64,96,255],(y*30+x)*4);
 const objects=residualEraseObjects({shapes:[shape],textBoxes:[]});assert.equal(objects.length,1,"the old source outline must not remain behind when the native node moves");
 const masks=objects.flatMap(item=>eraseObjectMask(item,source,{w:30,h:30})),residual=eraseMasks(source,masks,{transparent:true});
 for(let y=0;y<30;y++)for(let x=0;x<30;x++){
  const i=(y*30+x)*4,owned=x>=5&&x<25&&y>=5&&y<25&&!(x>=7&&x<23&&y>=7&&y<23);
  if(owned)assert.equal(residual.rgba[i+3],0);else assert.deepEqual(residual.rgba.subarray(i,i+4),source.rgba.subarray(i,i+4));
 }
 assert.equal(auditResidualPixelOwnership({source,residual,masks}).passed,true);
});
test("only complete source-measured hollow fill paths replace the preserved-interior exclusion",()=>{
 assert.equal(canErasePreservedInteriorPath(ring()),true);
 const changes=[x=>x.type="rect",x=>x.style.stroke="#111111",x=>x.style.fill="none",x=>x.source.detector="unknown",
  x=>x.source.sourcePerimeterSupport=.99,x=>x.source.nativeRebuild=false,x=>x.source.editable=false,
  x=>x.style.freeformSegments.pop(),x=>x.style.freeformSegments=[],x=>x.style.freeformSegments=Array(121).fill({type:"close",points:[]}),
  x=>x.style.freeformSegments[0].points[0].x=NaN,x=>x.style.freeformSegments[0].points[0].x=2,
  x=>x.style.freeformSegments=x.style.freeformSegments.slice(0,5)];
 for(const change of changes){const value=ring();change(value);assert.equal(canErasePreservedInteriorPath(value),false);}
 let reads=0;const hostile={get style(){reads++;throw Error("private-token");}};
 const proxy=new Proxy(ring(),{get(){reads++;throw Error("private-token");}});
 for(const value of [undefined,null,[],{},hostile,proxy])assert.equal(canErasePreservedInteriorPath(value),false);
 const nested=ring();Object.defineProperty(nested.style.freeformSegments[0].points[0],"x",{get(){reads++;throw Error("private-token");}});
 assert.equal(canErasePreservedInteriorPath(nested),false);
 const coercion=ring();coercion.style.freeformSegments[0].type={toString(){reads++;throw Error("private-token");}};
 assert.equal(canErasePreservedInteriorPath(coercion),false);assert.equal(reads,0);
});
