"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {measureSceneRelationDetailed:measure}=require('../packages/slideclone-core/source-scene-relation');
const {createMeasuredScenePortFrame:frame,verifyMeasuredScenePort:verify}=require('../packages/slideclone-core/source-scene-port-evidence');
const {deeperSourceRelationFailure}=require('../packages/slideclone-core/source-scene-relation-recovery');
test('a fully measured neighbouring shaft keeps its anchor failure over shallower row rejections',()=>{
 for(const reason of ['source-window-alpha','shaft-window-boundary','shaft-support','shaft-discontinuity','shaft-width','arrow-direction','node-axis-alignment']){
  assert.equal(deeperSourceRelationFailure('relation-anchor',reason),'relation-anchor');
  assert.equal(deeperSourceRelationFailure(reason,'relation-anchor'),'relation-anchor');
 }
});
function fixture(vertical=false,bordered=false){
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},nodes=[{id:'a',box:{x:20,y:20,w:60,h:120}},{id:'b',box:{x:120,y:20,w:60,h:120}}];
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*image.width+x)*4);
 for(const node of nodes){node.perimeter=[];const b=node.box;
  for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){
   const edge=x<b.x+2||x>=b.x+b.w-2||y<b.y+2||y>=b.y+b.h-2;
   put(x,y,bordered&&edge?[90,40,60]:[210,230,245]);if(bordered&&edge)node.perimeter.push(y*image.width+x);
  }
 }
 for(let x=80;x<=119;x++)for(let y=49;y<=51;y++)put(x,y,[30,60,90]);
 for(let x=114;x<=119;x++)for(let y=50-(119-x);y<=50+(119-x);y++)put(x,y,[30,60,90]);
 let shaftBox={x:81,y:43,w:38,h:14};
 if(vertical){const old={...image};image.width=old.height;image.height=old.width;image.rgba=Buffer.alloc(old.rgba.length);
  for(let y=0;y<old.height;y++)for(let x=0;x<old.width;x++)image.rgba.set(old.rgba.subarray((y*old.width+x)*4,(y*old.width+x+1)*4),(x*image.width+y)*4);
  const swap=b=>({x:b.y,y:b.x,w:b.h,h:b.w});shaftBox=swap(shaftBox);
  for(const node of nodes){node.box=swap(node.box);node.perimeter=node.perimeter.map(n=>(n%old.width)*image.width+Math.floor(n/old.width));}
 }
 for(const node of nodes)node.portFrame=frame(image,{box:node.box,fill:'#D2E6F5',perimeterPixels:node.perimeter});
 return {image,from:nodes[0],to:nodes[1],shaftBox,direction:'forward',textMasks:[],budget:{used:0}};
}

test('a distant shaft anchor nominates the existing recovery probes and retains measured attachments',()=>{
 for(const vertical of [false,true])for(const bordered of [false,true]){
  const f=fixture(vertical,bordered),before=Buffer.from(f.image.rgba),without={...f};delete without.shaftBox;
  assert.equal(measure(without).fit,null);
  f.budget={used:0};const result=measure(f);assert.ok(result.fit,JSON.stringify({vertical,bordered,result}));
  assert.deepEqual(result.fit.start,vertical?{x:50,y:80}:{x:80,y:50});assert.equal(result.fit.startPosition,.25);
  assert.equal(result.fit.widthPx,3);assert.equal(result.fit.support,1);assert.ok(f.budget.used<=39*25*6+24*10);
  assert.ok(measure({...f,from:f.to,to:f.from,direction:'backward',budget:{used:0}}).fit);assert.deepEqual(f.image.rgba,before);
 }
});

test('anchors and perimeter witnesses cannot supply direction, ownership, continuity or port identity',()=>{
 for(const change of [f=>{f.direction='both';},f=>{f.direction='backward';},f=>{f.direction='unknown';},
  f=>{f.textMasks=[{x:85,y:49,w:4,h:4}];},f=>{f.textMasks=[{x:78,y:49,w:2,h:3}];},
  f=>{f.from.portFrame={};},f=>{f.from.portFrame=structuredClone(f.from.portFrame);},f=>{f.to.portFrame=new Proxy(f.to.portFrame,{});},
  f=>{f.image={...f.image,rgba:Buffer.from(f.image.rgba)};},f=>{f.shaftBox={x:81,y:145,w:38,h:8};},
  f=>{f.shaftBox={x:0,y:43,w:10,h:14};},f=>{f.image.rgba.fill(255);},
  f=>{for(let y=38;y<63;y++)f.image.rgba.fill(255,(y*200+100)*4,(y*200+101)*4);},
  f=>{for(let y=48;y<53;y++)f.image.rgba.fill(255,(y*200+81)*4,(y*200+83)*4);}
 ]){const f=fixture(false,true);change(f);assert.equal(measure(f).fit,null);}
 const full=fixture();full.budget.used=4000000;assert.throws(()=>measure(full),RangeError);assert.equal(full.budget.used,4000000);
});

test('unsafe anchors fail before source scans or accessors',()=>{
 let calls=0;const getter={get x(){calls++;throw Error('private');}};
 for(const shaftBox of [null,[],new Proxy({},{get(){calls++;throw Error('private');}}),getter,
  {x:0,y:0,w:0,h:10},{x:-1,y:0,w:1,h:10},{x:0,y:Infinity,w:1,h:10},{x:190,y:0,w:20,h:10}]){
  const f=fixture();assert.throws(()=>measure({...f,shaftBox}),TypeError);assert.equal(f.budget.used,0);
 }
 assert.equal(calls,0);
});

test('a successful original midpoint measurement keeps exactly the same fit and source cost',()=>{
 const f=fixture();f.from.box={...f.from.box,h:60};f.to.box={...f.to.box,h:60};
 const without={...f,budget:{used:0}};delete without.shaftBox;
 const before=measure(without),after=measure(f);assert.ok(before.fit);assert.deepEqual(after,before);assert.equal(f.budget.used,without.budget.used);
});

test('perimeter evidence is bounded, descriptor-safe, snapshotted and private to the source frame',()=>{
 const f=fixture(false,true),node=f.from,measurement={box:node.box,fill:'#D2E6F5',perimeterPixels:node.perimeter};
 const token=frame(f.image,measurement),input={image:f.image,token,box:node.box,point:{x:80,y:50},side:'right',color:'#1E3C5A',textMasks:[],budget:{used:0}};
 node.perimeter.length=0;assert.equal(verify(input),true);
 assert.equal(verify({...input,token:frame(f.image,measurement)}),false);
 let calls=0;const getter=[];Object.defineProperty(getter,0,{get(){calls++;throw Error('private');}});
 for(const perimeterPixels of [null,{},new Array(1),getter,new Proxy([],{}),[-1],[36000],[1.5],[NaN],new Array(262145).fill(0)])
  assert.throws(()=>frame(f.image,{...measurement,perimeterPixels}),TypeError);
 assert.throws(()=>frame(f.image,{...measurement,get perimeterPixels(){calls++;throw Error('private');}}),TypeError);
 assert.equal(calls,0);assert.equal(verify({...input,point:{x:83,y:50}}),false);
 const reshaped={...f.image,width:180,height:200},ports=require('../packages/slideclone-core/source-scene-port-evidence');
 assert.equal(verify({...input,image:reshaped}),false);
 assert.equal(ports.measuredScenePortFill(reshaped,token,node.box),null);assert.equal(ports.measuredSceneGroupBounds(reshaped,token),null);
});

test('the compiler passes the proposed shaft location into source measurement and emits native bound relations',t=>{
 const f=fixture(false,true),root=fs.mkdtempSync(path.join(os.tmpdir(),'anchor-compiler-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,f.image);
 const plan=require('../packages/slideclone-core/source-scene-plan').parseSourceScenePlan({coordinateSpace:'source-pixels',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:180}}],
  objects:[f.from,f.to].map(n=>({id:n.id,kind:'container',regionId:'root',box:n.box})),
  relations:[{id:'edge',regionId:'root',fromId:'a',toId:'b',direction:'forward',shaftBox:f.shaftBox}]
 },{sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:200,heightPx:180});
 const result=require('../packages/slideclone-core/source-scene-compiler').compileSourceScene({root,sourceFile,plan,
  page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:200,heightPt:180}});
 assert.equal(result.evidence.resolvedRelations,1,JSON.stringify(result.evidence.unresolved));const edge=result.page.shapes.find(s=>s.source?.detector==='source-scene-relation');
 assert.equal(edge.type,'line');assert.equal(edge.style.startAnchor.position,.25);assert.equal(edge.style.endAnchor.position,.25);
 assert.equal(edge.style.endArrow,'triangle');assert.equal(result.page.images.length,0);assert.ok(result.evidence.sourceScanPixels<=4000000);
});

test('an anchor cannot lend a measured port token to a separately fitted node frame',()=>{
 const f=fixture();f.from.box={...f.from.box,x:19.5};f.to.box={...f.to.box,x:120.5,w:59};
 assert.equal(measure(f).fit,null,'a legacy band frame must first earn its own physical binding');
});
