'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSourceRouteBackdrop}=require('../packages/slideclone-core/scene-plan/source-route-backdrop-proposal');
const {encodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
const {eraseObjectMask}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {pointInMask}=require('../packages/slideclone-core/scene-plan/raster-native-detection');
function fixture(){
 const image={width:100,height:100,rgba:Buffer.alloc(40000)};
 for(let n=0;n<10000;n++)image.rgba.set([240,242,244,255],n*4);
 for(let y=20;y<=80;y++)for(let x=18;x<=22;x++)image.rgba.set([180,60,30,255],(y*100+x)*4);
 for(let x=20;x<=80;x++)for(let y=18;y<=22;y++)image.rgba.set([180,60,30,255],(y*100+x)*4);
 const shape={type:'freeform',box:{x:20,y:20,w:60,h:60},source:{connector:true},style:{fill:'none',stroke:'#B43C1E',strokeWidthPt:5,closed:false,
  freeformPath:encodeNativeFreeformPath([{type:'moveTo',points:[{x:1,y:0}]},{type:'lnTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:0,y:1}]}])}};
 return {image,residual:{...image,rgba:Buffer.from(image.rgba)},shape,slideSize:{w:100,h:100}};
}

test('bent route shaft outside the legacy chord receives a review-only background proposal',()=>{
 const input=fixture(),before=Buffer.from(input.residual.rgba),source=Buffer.from(input.image.rgba),cell=60*100+20;
 const legacy=eraseObjectMask(input.shape,input.image,input.slideSize);
 assert.equal(legacy.some(m=>pointInMask(20,60,m)),false);
 const result=proposeSourceRouteBackdrop(input),pixel=result.pixels.find(p=>p.cell===cell);
 assert.ok(pixel);assert.deepEqual(pixel.color,[240,242,244]);assert.deepEqual(pixel.before,[180,60,30,255]);
 assert.equal(result.reviewOnly,true);assert.equal(result.applicationAuthorized,false);assert.equal(result.approximation,true);
 assert.equal(new Set(result.pixels.map(p=>p.cell)).size,result.pixels.length);
 assert.deepEqual(result.pixels.map(p=>p.cell),result.pixels.map(p=>p.cell).sort((a,b)=>a-b));
 assert.deepEqual(input.residual.rgba,before);assert.deepEqual(input.image.rgba,source);
 assert.ok(result.checks>0&&result.checks<=4000000);
});

test('empty background and an already transparent route have no new targets',()=>{
 const input=fixture();input.image.rgba.fill(255);input.residual.rgba.fill(255);
 assert.deepEqual(proposeSourceRouteBackdrop(input).pixels,[]);
 const painted=fixture();for(let n=3;n<40000;n+=4)painted.residual.rgba[n]=0;
 assert.deepEqual(proposeSourceRouteBackdrop(painted).pixels,[]);
});

test('changed opaque and partial-alpha targets are preserved rather than reauthorized',()=>{
 const input=fixture(),cell=60*100+20;
 for(const rgba of [[180,61,30,255],[180,60,30,128]]){
  input.residual.rgba.set(rgba,cell*4);const result=proposeSourceRouteBackdrop(input);
  assert.ok(!result.pixels.some(p=>p.cell===cell));assert.ok(result.rejected.changedTarget>0);
 }
});

test('matching stroke ink on the legacy diagonal is excluded when outside the actual native path',()=>{
 const input=fixture(),cell=50*100+50;
 for(const im of [input.image,input.residual])im.rgba.set([180,60,30,255],cell*4);
 const result=proposeSourceRouteBackdrop(input);
 assert.ok(!result.pixels.some(p=>p.cell===cell));
 const {createApprovedBackdropPixelApplication}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application');
 assert.throws(()=>createApprovedBackdropPixelApplication(result),TypeError);
 assert.throws(()=>createApprovedBackdropPixelApplication(JSON.parse(JSON.stringify(result))),TypeError);
});

test('unrelated foreground, nonopaque flanks and disagreeing background nominate nothing at that source cell',()=>{
 for(const scenario of ['foreground','alpha','conflict']){
  const input=fixture(),cell=60*100+20;
  if(scenario==='foreground')for(const im of [input.image,input.residual])im.rgba.set([0,200,0,255],cell*4);
  else if(scenario==='alpha')input.image.rgba[(60*100+13)*4+3]=0;
  else for(const x of [27,28])input.image.rgba.set([20,40,60,255],(60*100+x)*4);
  assert.ok(!proposeSourceRouteBackdrop(input).pixels.some(p=>p.cell===cell));
 }
});

test('antialiased route ink on inner flanks is resolved against independently agreeing outer backgrounds',()=>{
 const input=fixture(),cell=60*100+20;
 // The inner flank is half source stroke, half independently known background.
 // It is not within 18 of the opaque stroke palette.
 for(const im of [input.image,input.residual])im.rgba.set([210,151,137,255],(60*100+27)*4);
 const before=Buffer.from(input.image.rgba),residual=Buffer.from(input.residual.rgba);
 const result=proposeSourceRouteBackdrop(input),pixel=result.pixels.find(p=>p.cell===cell);
 assert.ok(pixel);assert.deepEqual(pixel.color,[240,242,244]);
 assert.ok(pixel.samples.every(n=>n!==60*100+27));
 assert.deepEqual(input.image.rgba,before);assert.deepEqual(input.residual.rgba,residual);
 assert.equal(result.applicationAuthorized,false);
});

test('a recognized route flank cannot hide unrelated foreground on another flank',()=>{
 const input=fixture(),cell=60*100+20;
 input.image.rgba.set([180,60,30,255],(60*100+12)*4);
 input.image.rgba.set([0,200,0,255],(60*100+27)*4);
 assert.ok(!proposeSourceRouteBackdrop(input).pixels.some(p=>p.cell===cell));
});

test('clipped flanks are refused and no returned source sample is outside the raster',()=>{
 const input=fixture();input.shape.box.x=1;
 const result=proposeSourceRouteBackdrop(input);assert.ok(result.rejected.clipped>0);
 for(const row of result.pixels)assert.ok(row.samples.every(n=>Number.isInteger(n)&&n>=0&&n<10000));
});

test('triangular source arrow outside the shaft corridor is nominated without extending past the tip',()=>{
 const input=fixture();input.shape.style.endArrow='triangle';
 for(let y=65;y<=80;y++)for(let x=20-Math.floor((80-y)/2);x<=20+Math.floor((80-y)/2);x++){
  for(const im of [input.image,input.residual])im.rgba.set([180,60,30,255],(y*100+x)*4);
 }
 const result=proposeSourceRouteBackdrop(input);
 assert.ok(result.pixels.some(p=>p.cell===70*100+16));
 assert.ok(!result.pixels.some(p=>p.cell===85*100+20));
 assert.equal(result.applicationAuthorized,false);
});

test('valid gradient paint and native arrow sizes are bounded; unknown arrow geometry refuses the proposal',()=>{
 const input=fixture();input.shape.style.strokeGradient={type:'linear',stops:[{position:0,color:'#B43C1E'},{position:1,color:'#C43C1E'}]};
 assert.ok(proposeSourceRouteBackdrop(input).pixels.length>0);
 for(const mutation of [i=>{i.shape.style.endArrow='diamond';},i=>{i.shape.style.endArrow='triangle';i.shape.style.endArrowWidth='huge';}]){
  const invalid=fixture();mutation(invalid);assert.throws(()=>proposeSourceRouteBackdrop(invalid),TypeError);
 }
});

test('malformed dimensions, paint, paths and gradients fail with bounded safe messages',()=>{
 const changes=[i=>{i.slideSize.w=0;},i=>{i.residual.width=99;},i=>{i.shape.style.strokeWidthPt=Infinity;},
  i=>{i.shape.style.strokeWidthPt=33;},i=>{i.shape.style.stroke='private-token';},i=>{i.shape.style.freeformPath='private-token';},
  i=>{i.shape.style.strokeGradient={type:'linear',stops:[{position:0,color:'#FFFFFF'},{position:0,color:'#000000'}]};},
  i=>{i.shape.style.strokeGradient={type:'linear',stops:Array(2)};}];
 for(const change of changes){const input=fixture();change(input);assert.throws(()=>proposeSourceRouteBackdrop(input),e=>{
  assert.ok(e instanceof TypeError||e instanceof RangeError);assert.ok(!e.message.includes('private-token'));return true;
 });}
});

test('hostile getters, proxies and shared memory are rejected without invoking user code',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'image',{get(){calls++;throw Error('private-token');}});
 for(const input of [null,hostile,new Proxy(fixture(),{})])assert.throws(()=>proposeSourceRouteBackdrop(input),TypeError);
 const gradient=fixture();const stop={position:0};Object.defineProperty(stop,'color',{get(){calls++;throw Error('private-token');}});
 gradient.shape.style.strokeGradient={type:'linear',stops:[stop,{position:1,color:'#000000'}]};
 assert.throws(()=>proposeSourceRouteBackdrop(gradient),TypeError);
 const shared=fixture();shared.image.rgba=new Uint8Array(new SharedArrayBuffer(40000));
 assert.throws(()=>proposeSourceRouteBackdrop(shared),TypeError);assert.equal(calls,0);
});

test('extreme native corridor cannot exceed the review work or pixel limits',()=>{
 const input=fixture();input.image={width:2000,height:2000,rgba:Buffer.alloc(16000000,255)};input.residual=input.image;
 input.slideSize={w:2000,h:2000};input.shape.box={x:1,y:1,w:1998,h:1998};
 input.shape.style.freeformPath=encodeNativeFreeformPath([{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:1}]}]);
 assert.throws(()=>proposeSourceRouteBackdrop(input),/budget exceeded/);
});

test('review arrays do not alias inputs or other independent calls, and the unit CI discovers the regression',()=>{
 const input=fixture(),a=proposeSourceRouteBackdrop(input),b=proposeSourceRouteBackdrop(input);
 a.pixels[0].color[0]=0;a.pixels[0].before[0]=0;
 assert.deepEqual(proposeSourceRouteBackdrop(input),b);
 const {includesSuite}=require('../scripts/test-suites');
 assert.equal(includesSuite('test/source-route-backdrop-proposal.test.js','unit'),true);
 assert.equal(includesSuite('test/source-route-backdrop-proposal.test.js','all'),true);
});
