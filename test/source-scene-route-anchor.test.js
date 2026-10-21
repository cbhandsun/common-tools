'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneRouteWithinAnchor:within}=require('../packages/slideclone-core/source-scene-relation-identity');
const {measureSourceSceneRoute:measure}=require('../packages/slideclone-core/source-scene-route');
const {compileSourceSceneRoute:compile}=require('../packages/slideclone-core/source-scene-route-compiler');
const {compileExistingSceneRoutes:stage}=require('../packages/slideclone-core/source-scene-route-stage');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
test('a path must cross its own anchor even when the endpoints and source shaft are valid',()=>{
 const path=[{x:10,y:10},{x:90,y:10}],own={shaftBox:{x:30,y:5,w:20,h:10}};
 assert.equal(within(own,path),true);assert.equal(within({},path),true);
 assert.equal(within({shaftBox:{x:30,y:50,w:20,h:10}},path),false);
 assert.equal(within({shaftBox:{x:90,y:10,w:20,h:10}},path),false,'a single touching terminal grants no path overlap');
 const bent=[{x:10,y:10},{x:10,y:70},{x:90,y:70},{x:90,y:10}];
 assert.equal(within({shaftBox:{x:30,y:65,w:20,h:10}},bent),true,'the anchor may cover a bend away from the endpoint chord');
 assert.equal(within({shaftBox:{x:30,y:30,w:20,h:10}},bent),false);
 assert.equal(within(own,path.slice().reverse()),true);
});
function fixture(){
 const image={width:180,height:100,rgba:Buffer.alloc(180*100*4,255)},budget={used:0};
 const put=(x,y,c)=>image.rgba.set([...c,255],(y*image.width+x)*4);
 const from={id:'a',box:{x:10,y:25,w:40,h:30}},to={id:'b',box:{x:120,y:25,w:40,h:30}};
 for(const node of [from,to])for(let y=node.box.y;y<node.box.y+node.box.h;y++)for(let x=node.box.x;x<node.box.x+node.box.w;x++)put(x,y,[210,230,245]);
 for(let x=50;x<120;x++)for(let y=39;y<=41;y++)put(x,y,[30,60,90]);
 for(let x=114;x<120;x++)for(let dy=-(119-x);dy<=119-x;dy++)put(x,40+dy,[30,60,90]);
 const cache=createSceneMeasurementCache(image,[],budget);
 for(const node of [from,to]){assert(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
 return {image,from,to,budget,textMasks:[],direction:'forward'};
}
test('compiler and fallback stage cannot reassign one measured shaft to an unrelated source anchor',()=>{
 const f=fixture(),measured=measure(f);assert(measured.fit,measured.reason);
 const relation={id:'edge',regionId:'root',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:65,y:30,w:30,h:20}};
 const request={fit:measured.fit,relation,fromId:'a',toId:'b',widthPx:180,heightPx:100,slideSize:{widthPt:180,heightPt:100}};
 assert(compile(request).length>0);
 const wrong={...relation,shaftBox:{x:65,y:75,w:30,h:10}};
 assert.throws(()=>compile({...request,relation:wrong}),/source anchor/);
 const input={...f,plan:{sourceHash:'a'.repeat(64),regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:100}}],
  objects:[f.from,f.to].map(node=>({...node,kind:'container',regionId:'root'})),relations:[wrong]},
  nodes:new Map([['a',f.from],['b',f.to]]),shapes:[{id:'a'},{id:'b'}],slideSize:request.slideSize,
  unresolved:[{id:'edge',reason:'relation-source-evidence',detailCode:'relation-anchor'}]};
 const accepted=stage({...input,plan:{...input.plan,relations:[relation]}});
 assert.equal(accepted.resolved.size,1);assert(accepted.parts.length>0);assert.deepEqual(accepted.unresolved,[]);
 const out=stage(input);assert.equal(out.resolved.size,0);assert.equal(out.parts.length,0);
 assert.deepEqual(out.unresolved,input.unresolved);assert(out.rejected.some(r=>r.reason==='route-relation-anchor'));
});
test('malformed, extreme and hostile anchor controls cannot execute code or authorize a route',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-value');},points=[{x:0,y:1},{x:10,y:1}],own={shaftBox:{x:1,y:0,w:2,h:2}};
 for(const relation of [null,new Proxy(own,{get:trap,ownKeys:trap,getPrototypeOf:trap}),Object.defineProperty({},'shaftBox',{get:trap}),
  {shaftBox:{x:0,y:0,w:0,h:1}},{shaftBox:{x:NaN,y:0,w:2,h:1}}])assert.equal(within(relation,points),false);
 for(const path of [[],[points[0]],Array(33).fill(points[0]),new Array(2),new Proxy(points,{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  [Object.defineProperty({},'x',{get:trap}),points[1]],[{x:Infinity,y:0},points[1]]])assert.equal(within(own,path),false);
 assert.equal(calls,0);
});
test('route anchor regressions are discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),path=require('node:path');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(f=>path.normalize(f.file)===path.normalize('test/source-scene-route-anchor.test.js')));
});
