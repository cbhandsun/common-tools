"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sampleAtomInteriorFill,sampleAtomInteriorFillSeeds}=require("../packages/slideclone-core/scene-plan/visual-atom-interior-fill");
const {flowNodeShape}=require("../packages/slideclone-core/archetypes/relationship-native-shapes");
function raster(color){const rgba=Buffer.alloc(100*100*4);for(let i=0;i<rgba.length;i+=4)rgba.set([...color,255],i);return {width:100,height:100,rgba};}

test("OCR rectangles do not hide a locally uniform background seed or authorize its physical body",()=>{
 const {measureSceneContainer}=require("../packages/slideclone-core/scene-plan/source-scene-container");
 const image=raster([255,255,255]),hint={x:15,y:20,w:70,h:60};
 for(let y=20;y<80;y++)for(let x=15;x<85;x++)image.rgba.set([120,220,160,255],(y*100+x)*4);
 for(let y=35;y<65;y++)for(let x=25;x<75;x++)if(x%12<4)image.rgba.set([0,0,0,255],(y*100+x)*4);
 const before=Buffer.from(image.rgba),seeds=sampleAtomInteriorFillSeeds(image,hint,[hint],true);
 assert.ok(seeds.some(seed=>seed.color==="#78DCA0"));assert.ok(seeds.length<=4);
 assert.ok(seeds.every(seed=>seed.samples>=12&&seed.support/seed.samples>=.82));
 assert.equal(measureSceneContainer(image,hint,[hint],{used:0}),null,"unwitnessed OCR boxes retain their ownership boundary");
 assert.equal(measureSceneContainer(image,hint,[hint],{used:0},{}),null,"cloned tokens cannot authorize a seed");
 assert.deepEqual(image.rgba,before);
 // A white viewport behind colored glyphs never becomes a measured panel.
 image.rgba.fill(255);for(let y=35;y<65;y++)for(let x=25;x<75;x++)if(x%12<4)image.rgba.set([120,220,160,255],(y*100+x)*4);
 assert.equal(measureSceneContainer(image,hint,[hint],{used:0}),null);
});
test("local tile fallback reuses the same 2304 samples, preserves successful seeds and ignores transparent colors",()=>{
 const image=raster([120,220,160]),hint={x:0,y:0,w:100,h:100},expected=sampleAtomInteriorFillSeeds(image,hint);
 let reads=0;const observed={...image,rgba:new Proxy(image.rgba,{get(target,key){if(typeof key==="string"&&/^\d+$/u.test(key))reads++;return Reflect.get(target,key,target);}})};
 const seeds=sampleAtomInteriorFillSeeds(observed,hint,[hint],true);assert.equal(seeds[0].color,"#78DCA0");assert.ok(reads<=2304*4);
 assert.deepEqual(sampleAtomInteriorFillSeeds(observed,hint),expected);
 image.rgba.fill(0);assert.deepEqual(sampleAtomInteriorFillSeeds(image,hint,[hint]),[]);
 assert.deepEqual(sampleAtomInteriorFillSeeds(image,{...hint,x:-1}),[]);
 assert.deepEqual(sampleAtomInteriorFillSeeds(raster([120,220,160]),hint,[hint]),[],"empty masked tiles remain empty evidence");
});
test("native flow nodes use measured interior fill rather than foreground component color",()=>{
 const image=raster([254,235,183]);for(let y=30;y<55;y++)for(let x=25;x<75;x++)image.rgba.set([29,6,0,255],(y*100+x)*4);
 const box={x:0,y:0,w:100,h:100},interiorFill=sampleAtomInteriorFill(image,box,[{x:25,y:30,w:50,h:25}]);
 assert.equal(interiorFill.color,"#FEEBB7");assert.equal(flowNodeShape({id:"node"},{box,color:"#1D0600",interiorFill}).style.fill,"#FEEBB7");
});
test("interior sampling preserves dark panels and rejects empty or invalid evidence",()=>{
 const box={x:0,y:0,w:100,h:100};assert.equal(sampleAtomInteriorFill(raster([0,0,0]),box).color,"#000000");
 assert.equal(sampleAtomInteriorFill(raster([255,255,255]),box,[box]),null);
 assert.equal(sampleAtomInteriorFill(raster([0,0,0]),{...box,w:Infinity}),null);
 assert.equal(sampleAtomInteriorFill(raster([0,0,0]),{...box,x:1}),null);
 const varied=raster([255,255,255]);for(let y=0;y<50;y++)for(let x=0;x<100;x++)varied.rgba.set([0,0,0,255],(y*100+x)*4);
 assert.equal(sampleAtomInteriorFill(varied,box),null);
});

test("a color cluster crossing a bin boundary still requires the original source support",()=>{
 const image=raster([31,31,31]),box={x:0,y:0,w:100,h:100};
 // A disconnected color population must remain nonuniform.
 // Neither candidate center can pass the original 82% support gate.
 for(let row=0;row<24;row++)for(let col=0;col<24;col++){
  const x=Math.floor(100*(.18+.64*(col+.5)/24)),y=Math.floor(100*(.18+.64*(row+.5)/24));
  const n=row*24+col,v=n<220?10:n<330?31:40;image.rgba.set([v,v,v,255],(y*100+x)*4);
 }
 // Dominant bin has 330 samples: median 10 supports 220/576; the
 // full median 31 supports 356/576, so both must reject.
 assert.equal(sampleAtomInteriorFill(image,box),null);
 // 31 is a shared center within 18 of both tails. Quantization puts
 // 240 low + 60 center in one bin, 276 high in another. Bin median
 // 15 supports only 300; population median 31 supports all 576.
 for(let row=0;row<24;row++)for(let col=0;col<24;col++){
  const x=Math.floor(100*(.18+.64*(col+.5)/24)),y=Math.floor(100*(.18+.64*(row+.5)/24));
  const n=row*24+col,v=n<240?15:n<300?31:45;image.rgba.set([v,v,v,255],(y*100+x)*4);
 }
 const sample=sampleAtomInteriorFill(image,box);assert.equal(sample.color,'#1F1F1F');assert.equal(sample.support,576);
 image.rgba.fill(0);assert.equal(sampleAtomInteriorFill(image,box),null);
});
