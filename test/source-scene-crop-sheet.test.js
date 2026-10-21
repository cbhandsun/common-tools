"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSceneCropSheet}=require("../packages/slideclone-core/source-scene-crop-sheet");
function fixture(){
 const image={width:180,height:150,rgba:Buffer.alloc(180*150*4,255)};
 for(let y=0;y<150;y++)for(let x=0;x<180;x++)image.rgba.set([x,y,(x+y)%256,255],(y*180+x)*4);
 return {image,targets:[{index:7,cropBox:{x:10,y:20,w:35,h:40},candidateBox:{x:5.5,y:6.5,w:20,h:15}},
  {index:1,cropBox:{x:100,y:70,w:45,h:60},candidateBox:{x:3,y:4,w:30,h:45}}]};
}

test('source-grid floating ULP overflow canonicalizes inward without changing observed pixels or real bounds',()=>{
 const image=fixture().image,before=Buffer.from(image.rgba);
 for(const candidate of [{x:0,y:0,w:36,h:51.00000000000001},{x:0,y:1.1368683772161603e-13,w:37.00000000000001,h:58}]){
  const cropBox={x:10,y:20,w:Math.round(candidate.w),h:Math.round(candidate.h)},original={...candidate};
  const out=createSceneCropSheet({image,targets:[{index:159,cropBox,candidateBox:candidate}]}).targets[0];
  assert.ok(out.candidateBox.x+out.candidateBox.w<=out.cropBox.x+out.cropBox.w);
  assert.ok(out.candidateBox.y+out.candidateBox.h<=out.cropBox.y+out.cropBox.h);
  assert.deepEqual(candidate,original);assert.deepEqual(image.rgba,before);
 }
 for(const excess of [1e-8,.001,1,Infinity])assert.throws(()=>createSceneCropSheet({image,targets:[{index:159,
  cropBox:{x:10,y:20,w:36,h:51},candidateBox:{x:0,y:0,w:36,h:51+excess}}]}),TypeError);
});
test("compact crop sheet preserves source pixels, IDs and exact fractional candidate transforms",()=>{
 const input=fixture(),before=Buffer.from(input.image.rgba),result=createSceneCropSheet(input);
 assert.deepEqual(result.targets.map(t=>t.index),[7,1]);assert.deepEqual(input.image.rgba,before);
 for(let i=0;i<input.targets.length;i++){
  const source=input.targets[i],output=result.targets[i];
  assert.equal(output.candidateBox.x-output.cropBox.x,source.candidateBox.x);
  assert.equal(output.candidateBox.y-output.cropBox.y,source.candidateBox.y);
  assert.equal(output.candidateBox.w,source.candidateBox.w);
  for(let y=0;y<source.cropBox.h;y++)for(let x=0;x<source.cropBox.w;x++){
   const a=((source.cropBox.y+y)*input.image.width+source.cropBox.x+x)*4;
   const b=((output.cropBox.y+y)*result.image.width+output.cropBox.x+x)*4;
   assert.deepEqual([...result.image.rgba.subarray(b,b+4)],[...input.image.rgba.subarray(a,a+4)]);
  }
 }
 assert.equal(result.pixels,result.image.width*result.image.height);
});
test("identical source windows share pixels while preserving all 32 target identities",()=>{
 const image={width:400,height:150,rgba:Buffer.alloc(400*150*4,255)};
 const targets=Array.from({length:32},(_,index)=>({index,cropBox:{x:10,y:10,w:25,h:50},candidateBox:{x:2,y:3,w:20,h:40}}));
 const result=createSceneCropSheet({image,targets});assert.ok(Math.max(result.image.width,result.image.height)<500);
 const boxes=result.targets.map(t=>t.cropBox);
 assert.deepEqual(result.targets.map(t=>t.index),targets.map(t=>t.index));
 for(const b of boxes)assert.deepEqual(b,boxes[0]);
});
test("visible IDs occupy only existing gutters even for tiny crops and maximum IDs",()=>{
 const image={width:20,height:20,rgba:Buffer.alloc(20*20*4,179)};
 const targets=[0,9,10,165,511].map((index,i)=>({index,cropBox:{x:i,y:i,w:1,h:1},candidateBox:{x:0,y:0,w:1,h:1}}));
 const before=Buffer.from(image.rgba),result=createSceneCropSheet({image,targets});
 assert.deepEqual(image.rgba,before);
 for(const target of result.targets){
  const label=String(target.index),spacing=1;
  const patterns=["111101101101111","010110010010111","111001111100111","111001111001111","101101111001001",
   "111100111001111","111100111101111","111001001001001","111101111101111","111101111001111"];
  for(let i=0;i<label.length;i++)for(let row=0;row<5;row++)for(let col=0;col<3;col++){
   const x=target.cropBox.x+i*(3+spacing)+col,y=target.cropBox.y-7+row;
   assert.ok(x<result.image.width&&y>=0);
   assert.ok(result.targets.every(t=>y<t.cropBox.y||y>=t.cropBox.y+t.cropBox.h||x<t.cropBox.x||x>=t.cropBox.x+t.cropBox.w));
   const offset=(y*result.image.width+x)*4;
   assert.deepEqual([...result.image.rgba.subarray(offset,offset+4)],patterns[Number(label[i])][row*3+col]==="1"?[0,0,0,255]:[255,255,255,255]);
  }
  assert.equal(result.image.rgba[(target.cropBox.y*result.image.width+target.cropBox.x)*4],179);
 }
 assert.equal(result.pixels,result.image.width*result.image.height);
});
test("empty, invalid, duplicate, out-of-source and out-of-crop targets fail closed",()=>{
 for(const mutate of [f=>f.targets=[],f=>f.targets=Array(33).fill(f.targets[0]),f=>f.targets[1].index=7,
  f=>f.targets[0].index=512,f=>f.targets[0].cropBox.x=.5,f=>f.targets[0].cropBox.x=160,
  f=>f.targets[0].candidateBox.x=-1,f=>f.targets[0].candidateBox.w=100,f=>f.image.width=Infinity,
  f=>f.image.rgba=new Uint8Array(4)]){
  const f=fixture();mutate(f);assert.throws(()=>createSceneCropSheet(f),/Scene sheet/);
 }
 assert.throws(()=>createSceneCropSheet(null),/Scene sheet/);
});
test("oversized source views and packed sheets cannot expand the pixel budget",()=>{
 const f=fixture();f.image.width=16385;assert.throws(()=>createSceneCropSheet(f),/source/);
 const image={width:4096,height:1024,rgba:Buffer.alloc(4096*1024*4)};
 assert.throws(()=>createSceneCropSheet({image,targets:[{index:0,cropBox:{x:0,y:0,w:4096,h:1024},candidateBox:{x:0,y:0,w:1,h:1}}]}),/budget/);
});
test("proxies, accessors, sparse arrays and shared pixel stores never execute getters",()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,"index",{enumerable:true,get(){calls++;throw Error("private-token");}});
 for(const value of [new Proxy(fixture(),{}),{...fixture(),targets:new Array(1)},{...fixture(),targets:[hostile]},
  {...fixture(),targets:new Proxy(fixture().targets,{})}])assert.throws(()=>createSceneCropSheet(value),e=>!e.message.includes("private-token"));
 const f=fixture();f.image.rgba=new Uint8Array(new SharedArrayBuffer(180*150*4));assert.throws(()=>createSceneCropSheet(f),/source/);
 assert.equal(calls,0);
});

test("two uneven real-size review sheets preserve exact source rows within the shared budget",()=>{
 const image={width:2304,height:1728,rgba:Buffer.alloc(2304*1728*4,179)};
 const local=[[341,134],[146,148],[127,111],[125,117],[132,133],[119,133],[128,124],[118,124],[402,276],[428,294],[402,352],[428,346],[470,372]];
 const context=[[745,612],[354,356],[305,289],[301,293],[316,317],[303,317],[306,302],[290,296],[566,440],[604,470],[566,516],[604,522],[571,574]];
 let total=0;
 for(const dimensions of [local,context]){
  const targets=dimensions.map(([w,h],index)=>({index,cropBox:{x:20,y:20,w,h},candidateBox:{x:.5,y:.25,w:w-1,h:h-1}}));
  const result=createSceneCropSheet({image,targets});total+=result.pixels;
  assert.equal(result.targets.length,targets.length);
  for(let i=0;i<targets.length;i++){
   const original=targets[i],mapped=result.targets[i];assert.equal(original.index,mapped.index);
   assert.equal(mapped.candidateBox.x-mapped.cropBox.x,.5);assert.equal(mapped.candidateBox.y-mapped.cropBox.y,.25);
   assert.equal(mapped.candidateBox.w,original.candidateBox.w);assert.equal(mapped.candidateBox.h,original.candidateBox.h);
   for(let y=0;y<original.cropBox.h;y++){
    const a=((original.cropBox.y+y)*image.width+original.cropBox.x)*4,b=((mapped.cropBox.y+y)*result.image.width+mapped.cropBox.x)*4;
    assert.equal(result.image.rgba.subarray(b,b+original.cropBox.w*4).equals(image.rgba.subarray(a,a+original.cropBox.w*4)),true);
   }
  }
 }
 assert.ok(total<=4000000);
});
