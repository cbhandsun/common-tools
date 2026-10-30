'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(count=17){
 const points=Array.from({length:count},(_,i)=>({x:3+i*3,y:i%2?12:4}));
 return {points,cells:points.map(p=>p.y*80+p.x),width:80,height:20,shaft:1,work:{checks:0}};
}
// Isolate only private receipt admission. This is a downstream representation
// test; it does not issue source ownership or authorize source erasure.
function compiler(count=17){
 const f=fixture(count),fit={points:f.points,color:'#1450D2',widthPx:1,support:1,fixedHeadCuts:true,
  startSide:'right',startPosition:.5,endSide:'left',endPosition:.5,filledTerminals:true};
 const file=path.resolve(__dirname,'../../packages/slideclone-core/scene-plan/source-scene-route-compiler.js'),nativeRequire=createRequire(file),isolated={exports:{}};
 vm.compileFunction(fs.readFileSync(file,'utf8'),['require','module','exports'],{filename:file})(
  name=>name==='./source-scene-route'?{isMeasuredSourceRoute:value=>value===fit}:nativeRequire(name),isolated,isolated.exports);
 const request={fit,relation:{id:'capacity',regionId:'root',fromId:'a',toId:'b',direction:'forward'},fromId:'a',toId:'b',
  widthPx:f.width,heightPx:f.height,slideSize:{widthPt:f.width,heightPt:f.height}};
 const a=f.points[0],b=f.points.at(-1);
 const nodes=[{id:'a',type:'rect',box:{x:a.x-2,y:a.y-1,w:2,h:2},style:{fill:'#EEEEEE'}},
  {id:'b',type:'rect',box:{x:b.x,y:b.y-1,w:2,h:2},style:{fill:'#EEEEEE'}}];
 return {fixture:f,request,nodes,compile:isolated.exports.compileSourceSceneRoute};
}
module.exports={fixture,compiler};
