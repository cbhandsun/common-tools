"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSourceWordTypographicGeometry:measure}=require("../packages/slideclone-core/typography/source-word-typographic-geometry");
function fixture(){
 const width=16,height=16,ink=new Uint8Array(width*height),rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=3;y<13;y++)for(let x=3;x<13;x++){const n=y*width+x,edge=x===3||x===12||y===3||y===12;ink[n]=1;rgba.set(edge?[195,195,195,255]:[15,15,15,255],n*4);}
 return{width,height,left:0,top:0,ink,rgba,background:[255,255,255],color:[15,15,15],runs:[{text:"A",box:{x:3,y:3,w:10,h:10}}]};
}
test("continuous half-coverage bounds describe native typography without removing physical antialiasing evidence",()=>{
 const input=fixture(),before=structuredClone(input),result=measure(input);assert.equal(result.length,1);assert.equal(result[0].text,"A");
 assert.ok(Math.abs(result[0].box.x-23/6)<1e-12);assert.ok(Math.abs(result[0].box.y-23/6)<1e-12);
 assert.ok(Math.abs(result[0].box.w-25/3)<1e-12);assert.ok(Math.abs(result[0].box.h-25/3)<1e-12);
 assert.deepEqual(input,before);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result[0].box));
 assert.equal(result[0].source,undefined);assert.equal(result[0].pixels,undefined);
});
test("opaque glyphs, empty ink, empty runs and zero contrast retain ordinary measured bounds",()=>{
 const opaque=fixture();for(let n=0;n<opaque.ink.length;n++)if(opaque.ink[n])opaque.rgba.set([15,15,15,255],n*4);
 assert.equal(measure(opaque),null);const empty=fixture();empty.ink.fill(0);assert.equal(measure(empty),null);
 assert.equal(measure({...fixture(),runs:[]}),null);assert.equal(measure({...fixture(),color:[255,255,255]}),null);
});
test("sparse dark cores cannot collapse legitimate pale glyphs to a few isolated pixels",()=>{
 const input=fixture();for(let n=0;n<input.ink.length;n++)if(input.ink[n])input.rgba.set([195,195,195,255],n*4);
 for(let x=4;x<11;x++)input.rgba.set([15,15,15,255],(7*16+x)*4);
 assert.equal(measure(input),null);
});
test("light text on a dark source background uses the same coverage geometry and polarity",()=>{
 const input=fixture();for(let n=0;n<input.rgba.length;n+=4)for(let c=0;c<3;c++)input.rgba[n+c]=255-input.rgba[n+c];
 input.background=[0,0,0];input.color=[240,240,240];assert.deepEqual(measure(input),measure(fixture()));
});
test("multiple source units keep their text, ordering, separation and original frames",()=>{
 const base=fixture(),input={...base,width:36,ink:new Uint8Array(36*16),rgba:new Uint8Array(36*16*4).fill(255),runs:[base.runs[0],{text:"B",box:{x:20,y:3,w:10,h:10}}]};
 for(const dx of [0,17])for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=y*36+x+dx,old=y*16+x;input.ink[n]=base.ink[old];input.rgba.set(base.rgba.subarray(old*4,old*4+4),n*4);}
 const result=measure(input);assert.deepEqual(result.map(run=>run.text),["A","B"]);assert.ok(result[0].box.x+result[0].box.w<result[1].box.x);
 for(let i=0;i<result.length;i++){const b=result[i].box,old=input.runs[i].box;assert.ok(b.x>=old.x&&b.y>=old.y&&b.x+b.w<=old.x+old.w&&b.y+b.h<=old.y+old.h);}
});
test("invalid, overlapping and unsafe source runs fail without including input content",()=>{
 for(const runs of [[{text:"private-token\n",box:fixture().runs[0].box}],[{text:"A",box:{x:2.5,y:3,w:10,h:10}}],
  [{text:"A",box:{x:3,y:3,w:20,h:10}}],[fixture().runs[0],fixture().runs[0]],[{text:"",box:fixture().runs[0].box}],new Array(1)]){
  assert.throws(()=>measure({...fixture(),runs}),error=>error instanceof TypeError&&!error.message.includes("private-token"));
 }
});
test("malformed raster, color, coverage and out-of-budget windows are rejected",()=>{
 const invalid=[null,{...fixture(),width:0},{...fixture(),left:-1},{...fixture(),left:16380},
  {...fixture(),width:513,height:513},{...fixture(),rgba:new Uint8Array(3)},{...fixture(),background:[NaN,0,0]},
  {...fixture(),color:[0,256,0]},{...fixture(),background:[0,0]}];
 const badMask=fixture();badMask.ink[0]=2;invalid.push(badMask);const transparent=fixture();transparent.rgba[3]=239;invalid.push(transparent);
 for(const input of invalid)assert.throws(()=>measure(input),TypeError);
});
test("proxies, accessors, shadowed lengths and shared buffers cannot supply private raster evidence",()=>{
 let calls=0;const accessor={};Object.defineProperty(accessor,"width",{get(){calls++;throw Error("private-token");}});
 const proxy=new Proxy({}, {get(){calls++;throw Error("private-token");},ownKeys(){calls++;throw Error("private-token");}});
 const bytesProxy=new Proxy(new Uint8Array(256),{get(){calls++;throw Error("private-token");}});
 const shadow=new Uint8Array(256);Object.defineProperty(shadow,"length",{get(){calls++;throw Error("private-token");}});
 for(const input of [accessor,proxy,{...fixture(),ink:bytesProxy},{...fixture(),ink:shadow},
  {...fixture(),ink:new Uint8Array(new SharedArrayBuffer(256))},{...fixture(),runs:[proxy]}])assert.throws(()=>measure(input),TypeError);
 assert.equal(calls,0);
});
test("the maximum existing source window remains bounded and accepts buffer views without copying the source",()=>{
 const width=512,height=512,ink=Buffer.alloc(width*height),rgba=Buffer.alloc(width*height*4,255);
 assert.equal(measure({width,height,left:15872,top:15872,ink,rgba,background:[255,255,255],color:[0,0,0],runs:[]}),null);
 assert.deepEqual(ink,Buffer.alloc(width*height));
});
