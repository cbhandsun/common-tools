'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSourceFrameLocalRidge:create}=require('../packages/slideclone-core/scene-plan/source-frame-local-ridge');
function fixture(){
 const width=160,height=160,rgba=Buffer.alloc(width*height*4,220),work={checks:0,exhausted:false};
 for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
 const hint={x:30,y:30,w:100,h:100};
 const input={hint,margin:8,work,strips:[{window:{x:0,y:0,w:width,h:height},raster:{width,height,rgba}}]};
 const put=(x,y,color,alpha=255)=>rgba.set([color,color,color,alpha],(y*width+x)*4);
 return {input,put,rgba,work};
}
test('local source contrast retains faint axis strokes on flat and sloping backgrounds',()=>{
 for(const horizontal of[false,true])for(const gradient of[false,true]){
  const f=fixture();for(let y=0;y<160;y++)for(let x=0;x<160;x++){
   const bg=gradient?150+Math.floor(x/2)+Math.floor(y/4):220;
   f.put(x,y,bg-((horizontal?y:x)===30?10:0));
  }
  const before=Buffer.from(f.rgba),read=create(f.input);assert.equal(read(horizontal?70:30,horizontal?30:70),true);
  assert.deepEqual(f.rgba,before);assert.ok(f.work.checks>0&&f.work.checks<100);
 }
});
test('oblique corner normals recover a ridge too wide along either axis, in both directions',()=>{
 for(const sign of[-1,1]){
  const f=fixture();for(let y=0;y<160;y++)for(let x=0;x<160;x++)if(Math.abs(x-32+sign*(y-32))<=4)f.put(x,y,210);
  assert.equal(create(f.input)(32,32),true);
 }
});
test('flat, linear, broad curved backgrounds, bright marks and isolated interior texture supply no ridge',()=>{
 for(const kind of['flat','linear','curved','bright','interior']){
  const f=fixture();for(let y=0;y<160;y++)for(let x=0;x<160;x++){
   if(kind==='linear')f.put(x,y,100+Math.floor(x/2)+Math.floor(y/4));
   if(kind==='curved')f.put(x,y,Math.min(250,180+Math.floor(.2*((x-32)**2+(y-32)**2))));
  }
  if(kind==='bright')f.put(32,32,240);
  if(kind==='interior')f.put(70,70,200);
  assert.equal(create(f.input)(kind==='interior'?70:32,kind==='interior'?70:32),false,kind);
 }
});
test('both flanks need three opaque, locally linear observations with enough contrast',()=>{
 const noisy=fixture();noisy.put(32,32,200);
 for(const [dx,dy]of[[0,1],[1,0],[1,1],[1,-1]])for(const sign of[-1,1])noisy.put(32+sign*4*dx,32+sign*4*dy,230);
 assert.equal(create(noisy.input)(32,32),false);
 const weak=fixture();weak.put(32,32,215);assert.equal(create(weak.input)(32,32),false);
 const oneSide=fixture();oneSide.put(32,32,210);
 for(const [dx,dy]of[[0,1],[1,0],[1,1],[1,-1]])for(const step of[3,4,5])oneSide.put(32+step*dx,32+step*dy,210);
 assert.equal(create(oneSide.input)(32,32),false);
 const alpha=fixture();alpha.put(32,32,210,0);assert.equal(create(alpha.input)(32,32),false);
 const flanks=fixture();flanks.put(32,32,210);
 for(const [dx,dy]of[[0,1],[1,0],[1,1],[1,-1]])for(const sign of[-1,1])flanks.put(32+sign*3*dx,32+sign*3*dy,220,0);
 assert.equal(create(flanks.input)(32,32),false);
});
test('unknown cores, window boundaries and offset typed arrays never read outside observed source strips',()=>{
 const f=fixture(),bytes=Buffer.alloc(24*24*4+80,255),rgba=new Uint8Array(bytes.buffer,bytes.byteOffset+40,24*24*4);
 f.input.strips=[{window:{x:20,y:20,w:24,h:24},raster:{width:24,height:24,rgba}}];
 rgba.set([230,230,230,255],((32-20)*24+32-20)*4);
 const read=create(f.input);assert.equal(read(32,32),true);assert.equal(read(10,10),false);
 assert.equal(read(20,20),false);assert.equal(read(70,70),false);
 for(const value of[NaN,Infinity,-1,1.5,16384,{},new Proxy({},{get(){throw new Error('hook');}})])assert.equal(read(value,32),false);
});
test('geometry exhaustion is terminal and cannot return a partial positive',()=>{
 const f=fixture();f.put(32,32,200);f.work.checks=3999999;const read=create(f.input);
 assert.equal(read(32,32),false);assert.equal(f.work.exhausted,true);assert.equal(f.work.checks,4000001);
 const before=f.work.checks;assert.equal(read(32,32),false);assert.equal(f.work.checks,before);
});
test('invalid and hostile controls fail with a fixed error before executing hooks',()=>{
 const make=()=>fixture().input;let calls=0;
 const proxy=new Proxy({}, {get(){calls++;throw new Error('secret');},ownKeys(){calls++;throw new Error('secret');}});
 const getter={get hint(){calls++;throw new Error('secret');}};
 const values=[null,[],proxy,getter,{...make(),margin:NaN},{...make(),margin:7},{...make(),margin:29},
  {...make(),hint:{x:16380,y:0,w:100,h:100}},{...make(),hint:{x:0,y:0,w:Infinity,h:1}},
  {...make(),strips:[]},{...make(),strips:new Array(1)},{...make(),strips:[proxy]},
  {...make(),strips:Array(5).fill(make().strips[0])},{...make(),work:Object.freeze({checks:0,exhausted:false})},
  {...make(),work:{checks:4000002,exhausted:false}},{...make(),work:{checks:0,exhausted:'false'}}];
 const malformed=make();malformed.strips[0].raster.rgba=proxy;values.push(malformed);
 const wrong=make();wrong.strips[0].raster.width=159;values.push(wrong);
 const short=make();short.strips[0].raster.rgba=new Uint8Array(4);values.push(short);
 const shared=make();shared.strips[0].raster.rgba=new Uint8Array(new SharedArrayBuffer(160*160*4));values.push(shared);
 const meta=make();Object.defineProperty(meta.strips[0].raster.rgba,'buffer',{get(){calls++;throw new Error('secret');}});
 assert.doesNotThrow(()=>create(meta));
 for(const value of values)assert.throws(()=>create(value),{name:'TypeError',message:'Scene frame ridge controls are invalid'});
 assert.equal(calls,0);
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
