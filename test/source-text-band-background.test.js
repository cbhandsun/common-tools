"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSourceTextBandBackgrounds:propose}=require('../packages/slideclone-core/source-text-band-background');
const {eraseObjectMask}=require('../packages/slideclone-core/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/residual-primitive-erasure');
function fixture(){
 const width=160,height=200,rgba=Buffer.alloc(width*height*4,255);
 for(let y=190;y<200;y++)for(let x=0;x<width;x++)rgba.set([34,68,102,255],(y*width+x)*4);
 const plate={id:'label-background',type:'roundRect',box:{x:20,y:192,w:30,h:4},style:{fill:'#224466',stroke:'none'},source:{editable:true,nativeRebuild:true,detector:'sampled-text-backplate'}};
 return {image:{width,height,rgba},slideSize:{widthPt:160,heightPt:200},shapes:[plate]};
}
test('a short text backplate reconstructs its complete witnessed source band, without residual omission authority',()=>{
 const input=fixture();input.image.rgba.set([255,255,255,255],(194*160+40)*4);
 const before=structuredClone(input);before.image.rgba=Buffer.from(before.image.rgba);const result=propose(input);
 assert.equal(result.backgrounds.length,1);assert.deepEqual(input,before);
 const bg=result.backgrounds[0];assert.deepEqual(bg.box,{x:0,y:190,w:160,h:10});
 assert.equal(bg.source.foregroundOwnership,undefined);assert.equal(bg.source.sourceBandEvidence.foregroundOwnership,false);
 assert.equal(bg.source.fullSlideResidualOmitted,undefined);assert.equal(bg.source.componentQualityIgnore,undefined);
 const mask=eraseObjectMask(bg,input.image,{x:0,y:0,w:160,h:200});
 const residual=eraseMasks(input.image,[mask],{transparent:true});
 assert.equal(residual.rgba[(194*160+40)*4+3],255,'source foreground is not erased by the native background');
 assert.equal(residual.rgba[(193*160+40)*4+3],0);
});
test('band evidence follows geometry and scale in either orientation',()=>{
 const input=fixture(),rgba=Buffer.alloc(200*160*4,255);
 for(let y=0;y<160;y++)for(let x=190;x<200;x++)rgba.set([34,68,102,255],(y*200+x)*4);
 input.image={width:200,height:160,rgba};input.slideSize={widthPt:400,heightPt:320};input.shapes[0].box={x:384,y:40,w:8,h:60};
 assert.deepEqual(propose(input).backgrounds[0].box,{x:380,y:0,w:20,h:320});
});
test('source bands are invariant under recoloring, translation, orientation, point scale and seed geometry',()=>{
 for(const color of ['#7352a1','#197b53','#a56328'])for(const offset of [0,90,190])
 for(const vertical of [false,true])for(const scale of [1,2])for(const type of ['rect','roundRect']){
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const width=vertical?200:160,height=vertical?160:200,rgba=Buffer.alloc(width*height*4,255);
  for(let along=0;along<160;along++)for(let across=offset;across<offset+10;across++){
   const x=vertical?across:along,y=vertical?along:across;rgba.set([...rgb,255],(y*width+x)*4);
  }
  const box=vertical?{x:offset+2,y:20,w:4,h:30}:{x:20,y:offset+2,w:30,h:4};
  const input={image:{width,height,rgba},slideSize:{widthPt:width*scale,heightPt:height*scale},
   shapes:[{...fixture().shapes[0],type,box:Object.fromEntries(Object.entries(box).map(([key,value])=>[key,value*scale])),
    style:{fill:color,stroke:'none'}}]};
  const result=propose(input),expected=vertical?{x:offset*scale,y:0,w:10*scale,h:160*scale}:{x:0,y:offset*scale,w:160*scale,h:10*scale};
  assert.equal(result.exhausted,false);assert.equal(result.backgrounds.length,1);
  assert.deepEqual(result.backgrounds[0].box,expected);
  assert.equal(result.backgrounds[0].style.fill,color);
  assert.equal(result.backgrounds[0].source.sourceBandEvidence.foregroundOwnership,false);
 }
});
test('empty and absent source seeds leave the page alone',()=>{
 const input=fixture();input.shapes=[];assert.deepEqual(propose(input),{backgrounds:[],checks:0,exhausted:false});
 input.shapes=[{id:'unrelated',type:'rect'}];assert.equal(propose(input).backgrounds.length,0);
});
test('ordinary disconnected panels and broad page fills cannot become source bands',()=>{
 const panel=fixture();for(let y=190;y<200;y++)panel.image.rgba.set([255,255,255,255],(y*160+80)*4);
 assert.equal(propose(panel).backgrounds.length,0);
 const broad=fixture();for(let n=0;n<160*200;n++)broad.image.rgba.set([34,68,102,255],n*4);
 assert.equal(propose(broad).backgrounds.length,0);
});
test('an L shaped connected patch cannot authorize a rectangle',()=>{
 const input=fixture();for(let y=191;y<200;y++)for(let x=100;x<160;x++)input.image.rgba.set([255,255,255,255],(y*160+x)*4);
 assert.equal(propose(input).backgrounds.length,0);
});
test('non-native, invalid, duplicate and stale source backplates are rejected',()=>{
 for(const mutate of [i=>{i.shapes[0].source.editable=false;},i=>{i.shapes[0].box.x=-1;},i=>{i.shapes[0].style.fill='secret';},i=>{i.shapes[0].box.y=10;},i=>{i.shapes.push({id:'label-background-source-band'});}]){
  const input=fixture();mutate(input);assert.equal(propose(input).backgrounds.length,0);
 }
 const input=fixture();input.shapes.push(structuredClone(input.shapes[0]));assert.equal(propose(input).backgrounds.length,1);
});
test('external invalid, accessor and proxy inputs never run their code',()=>{
 for(const input of [null,{}, {...fixture(),image:{width:Infinity,height:2,rgba:Buffer.alloc(4)}}, {...fixture(),slideSize:{widthPt:0,heightPt:1}}])assert.throws(()=>propose(input),TypeError);
 let calls=0;const input=fixture();Object.defineProperty(input,'shapes',{get(){calls++;throw Error('unsafe');}});
 assert.throws(()=>propose(input),TypeError);assert.equal(calls,0);
 const proxy=new Proxy({}, {get(){calls++;throw Error('unsafe');}});assert.throws(()=>propose(proxy),TypeError);assert.equal(calls,0);
 const nested=fixture();Object.defineProperty(nested.shapes[0],'style',{get(){calls++;throw Error('unsafe');}});assert.equal(propose(nested).backgrounds.length,0);assert.equal(calls,0);
});
test('oversized optional evidence is skipped and scan exhaustion publishes no partial paint',()=>{
 const large=fixture();large.image={width:2001,height:2000,rgba:Buffer.alloc(2001*2000*4)};
 assert.equal(propose(large).exhausted,true);
 const input=fixture();input.image={width:400,height:400,rgba:Buffer.alloc(400*400*4)};
 for(let n=0;n<400*400;n++)input.image.rgba.set([34,68,102,255],n*4);
 input.slideSize={widthPt:400,heightPt:400};input.shapes=Array.from({length:32},(_,n)=>({...fixture().shapes[0],id:'seed-'+n}));
 const result=propose(input);assert.equal(result.exhausted,true);assert.equal(result.checks,4000000);assert.deepEqual(result.backgrounds,[]);
});
