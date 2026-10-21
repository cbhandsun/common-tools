"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceRingEnclosesFill:encloses}=require("../packages/slideclone-core/source-ring-fill-containment");
function fixture(){const width=24,height=24,box={x:3,y:3,w:16,h:16},ringPixels=[];
 for(let y=3;y<19;y++)for(let x=3;x<19;x++)if(x===3||x===18||y===3||y===18)ringPixels.push(y*width+x);
 return {width,height,box,ringPixels,fillPixels:new Set([8*width+8,9*width+9])};}
test("observed closed walls enclose fill cells without changing controls or reading source pixels",()=>{
 const f=fixture(),before=structuredClone(f);assert.equal(encloses(f),true);assert.deepEqual(f,before);
 assert.equal(encloses({...f,fillPixels:new Set([4*24+4,17*24+17])}),true);
 assert.equal(encloses({...f,fillPixels:new Set([3*24+8])}),false);
 assert.equal(encloses({...f,fillPixels:new Set([20*24+8])}),false);
});
test("a single open wall or concave exterior defeats bounding-box containment",()=>{
 const f=fixture();f.ringPixels=f.ringPixels.filter(n=>n!==3*24+10);assert.equal(encloses(f),false);
 const width=24,polygon=[];
 // L-shaped enclosure: the upper-right quadrant is outside its bbox.
 for(let y=3;y<=8;y++)polygon.push(y*width+10);
 for(let x=10;x<=18;x++)polygon.push(8*width+x);
 for(let x=3;x<=10;x++)polygon.push(3*width+x);
 for(let x=3;x<=18;x++)polygon.push(18*width+x);
 for(let y=3;y<=18;y++)polygon.push(y*width+3);
 for(let y=8;y<=18;y++)polygon.push(y*width+18);
 const shape={...fixture(),ringPixels:polygon};assert.equal(encloses({...shape,fillPixels:new Set([5*width+15])}),false);
 assert.equal(encloses({...shape,fillPixels:new Set([12*width+15])}),true);
});
test("empty and oversized observed windows never gain enclosure authority",()=>{
 const f=fixture();assert.equal(encloses({...f,fillPixels:new Set()}),false);assert.equal(encloses({...f,ringPixels:[]}),false);
 assert.equal(encloses({...f,width:600,height:600,box:{x:0,y:0,w:600,h:600}}),false);
});
test("unsafe, sparse, forged and invalid cell controls fail without invoking accessors",()=>{
 let calls=0;const hostile={get width(){calls++;throw Error("private-token");}};
 const f=fixture(),sparse=new Array(1),getter=[];Object.defineProperty(getter,"0",{get(){calls++;throw Error("private-token");}});
 for(const v of [null,{},hostile,new Proxy(f,{}),{...f,box:{...f.box,w:Infinity}},{...f,width:16385},
  {...f,ringPixels:sparse},{...f,ringPixels:getter},{...f,ringPixels:new Proxy(f.ringPixels,{})},
  {...f,fillPixels:new Proxy(f.fillPixels,{})},{...f,fillPixels:new Set([NaN])},{...f,fillPixels:new Set([-1])},
  {...f,ringPixels:[24*24]},{...f,ringPixels:Array(262145).fill(1)}]){
  assert.throws(()=>encloses(v),e=>e instanceof TypeError&&!e.message.includes("private-token"));
 }
 assert.equal(calls,0);
});
test("serialized fill handles cannot borrow measured source cells",()=>{
 const {measureSceneFillWindow,sceneFillEnclosedByRing}=require("../packages/slideclone-core/source-scene-fill-window");
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4,255)},ring=[];
 for(let y=20;y<60;y++)for(let x=20;x<60;x++)image.rgba.set([140,190,230,255],(y*80+x)*4);
 for(let x=19;x<=60;x++){ring.push(19*80+x,60*80+x);}for(let y=20;y<60;y++)ring.push(y*80+19,y*80+60);
 const fit=measureSceneFillWindow({image,hint:{x:20,y:20,w:40,h:40},fill:[140,190,230],color:"#8CBEE6",budget:{used:0},marginX:8,marginY:8}).fit;
 assert.ok(fit);const outline={box:{x:19,y:19,w:42,h:42},sourcePixels:ring};
 assert.equal(sceneFillEnclosedByRing(fit,image,outline),true);
 assert.equal(sceneFillEnclosedByRing(structuredClone(fit),image,outline),false);
 assert.equal(sceneFillEnclosedByRing(new Proxy(fit,{}),image,outline),false);
 assert.equal(sceneFillEnclosedByRing(fit,{...image,rgba:Buffer.from(image.rgba)},outline),false);
 const {includesSuite}=require("../scripts/test-suites");assert.equal(includesSuite(__filename,"unit"),true);
});
