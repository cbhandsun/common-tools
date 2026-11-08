'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildApprovedFrameMask,applyRegisteredMask,digest,signedDistance}=require('../packages/slideclone-core/scene-plan/approved-frame-mask.js');
const HASH='a'.repeat(64),FIT='b'.repeat(64);
function fixture(){
  const width=64,height=48,rgba=Buffer.alloc(width*height*4,255);
  const geometry={boxPx:{x:8,y:8,w:48,h:30},radiusPx:6,strokeWidthPx:2,strokeColor:'#E1EBE6'};
  const f={status:'fitted',id:'region-n6',source:{width,height,sha256:HASH},geometry,approximation:{approvalId:'user-20261023-approx-frame'}};
  const sdf={x:8,y:8,w:48,h:30,radius:6};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.abs(signedDistance(sdf,x,y))<=.7){const i=(y*width+x)*4;rgba[i]=225;rgba[i+1]=235;rgba[i+2]=230;}
  return{approvalId:'user-20261023-approx-frame',source:{width,height,rgba},sourceSha256:HASH,fitSha256:FIT,frames:[f],protections:[]};
}
test('normal: narrow pale stroke is selected, interior and original RGBA stay unchanged',()=>{
  const input=fixture(),before=Buffer.from(input.source.rgba),result=buildApprovedFrameMask(input);
  assert.ok(result.reports[0].selectedCells>100);assert.equal(result.mask[20*64+30],0);assert.equal(result.mask[8*64+30],1);
  assert.deepEqual(input.source.rgba,before);assert.equal(result.strictAccepted,false);assert.equal(result.reports[0].halfBandPx,3);
  assert.equal(result.maskSha256,digest(result.mask));assert.deepEqual(buildApprovedFrameMask(input).mask,result.mask);
});
test('color: dark text, strong route, unpainted white and exact local background remain',()=>{
  const input=fixture();
  for(const [x,color] of [[20,[10,10,10]],[21,[0,150,180]],[22,[255,255,255]]]){const i=(8*64+x)*4;color.forEach((v,c)=>input.source.rgba[i+c]=v);}
  const result=buildApprovedFrameMask(input);for(const x of[20,21,22])assert.equal(result.mask[8*64+x],0);
});
test('protection: exact stroke corridor and polygon protect crossings without whole-bbox wipe',()=>{
  const input=fixture();input.protections=[{id:'route-1',kind:'polyline',points:[{x:20,y:0},{x:20,y:45}],widthPx:2,marginPx:1},
    {id:'filled-route',kind:'polygon',points:[{x:30,y:5},{x:35,y:8},{x:30,y:11}],widthPx:0,marginPx:1}];
  const result=buildApprovedFrameMask(input);assert.equal(result.mask[8*64+20],0);assert.equal(result.conflictMask[8*64+20],1);
  assert.equal(result.mask[8*64+30],0);assert.equal(result.mask[8*64+26],1);assert.ok(result.reports[0].protectedCells>0);
});
test('copy-on-write: crop registration changes only selected nontransparent cells',()=>{
  const input=fixture(),result=buildApprovedFrameMask(input),asset={width:16,height:16,rgba:Buffer.alloc(16*16*4)};
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let c=0;c<4;c++)asset.rgba[(y*16+x)*4+c]=input.source.rgba[((y+4)*64+x+16)*4+c];
  const hidden=4*16*4+4*4;asset.rgba[hidden+3]=0;const before=Buffer.from(asset.rgba);
  const source={width:64,height:48,rgba:input.source.rgba,rgbaSha256:result.sourceRgbaSha256,mask:result.mask,maskSha256:result.maskSha256};
  const output=applyRegisteredMask({asset,source,registration:{x:16,y:4,w:16,h:16}});
  assert.ok(output.changed>0);assert.deepEqual(asset.rgba,before);assert.deepEqual(output.rgba.subarray(hidden,hidden+4),before.subarray(hidden,hidden+4));
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(!result.mask[(y+4)*64+x+16]||before[(y*16+x)*4+3]===0)assert.deepEqual(output.rgba.subarray((y*16+x)*4,(y*16+x)*4+4),before.subarray((y*16+x)*4,(y*16+x)*4+4));
});
test('empty: no frames yields all-zero mask; transparent input yields no selected paint',()=>{
  const input=fixture();input.frames=[];assert.equal(buildApprovedFrameMask(input).mask.some(Boolean),false);
  const transparent=fixture();for(let i=3;i<transparent.source.rgba.length;i+=4)transparent.source.rgba[i]=0;assert.equal(buildApprovedFrameMask(transparent).mask.some(Boolean),false);
});
test('invalid: approval, fit binding, geometry and duplicate frames reject',()=>{
  for(const mutate of [x=>x.approvalId='no',x=>x.frames[0].id='region-n9',x=>x.frames[0].source.sha256=FIT,x=>x.frames[0].geometry.radiusPx=NaN,x=>x.frames[0].geometry.boxPx.w=10000,x=>x.frames.push(x.frames[0]),x=>x.frames[0].geometry.strokeColor='#000000']){const input=fixture();mutate(input);assert.throws(()=>buildApprovedFrameMask(input));}
});
test('security: proxies including revoked, accessors, sparse and Symbol-padded arrays reject without executing traps',()=>{
  let calls=0;const proxy=new Proxy({},{get(){calls++;throw new Error('trap');},getPrototypeOf(){calls++;throw new Error('trap');}});
  assert.throws(()=>buildApprovedFrameMask(proxy));const revoked=Proxy.revocable({},{});revoked.revoke();assert.throws(()=>buildApprovedFrameMask(revoked.proxy));
  const getter=fixture();Object.defineProperty(getter,'frames',{get(){calls++;throw new Error('getter');}});assert.throws(()=>buildApprovedFrameMask(getter));
  const sparse=fixture();sparse.frames=new Array(1);sparse.frames[Symbol('pad')]=sparse.frames;assert.throws(()=>buildApprovedFrameMask(sparse));
  const nested=fixture();nested.frames[0].geometry=new Proxy({},{get(){calls++;throw new Error('trap');}});assert.throws(()=>buildApprovedFrameMask(nested));
  const binary=fixture();binary.source.rgba=new Proxy(binary.source.rgba,{get(){calls++;throw new Error('trap');}});assert.throws(()=>buildApprovedFrameMask(binary));
  assert.equal(calls,0);
});
test('extreme: image area, protection count, radius and typed-array lengths are bounded',()=>{
  const input=fixture();input.source.width=32768;input.source.height=32768;assert.throws(()=>buildApprovedFrameMask(input),/image-boundary/);
  const count=fixture();count.protections=Array(513).fill({});assert.throws(()=>buildApprovedFrameMask(count));
  const length=fixture();length.source.rgba=Buffer.alloc(1);assert.throws(()=>buildApprovedFrameMask(length),/rgba-length/);
});
test('failure: wrong mask hash, fractional/cropped registration and asset bounds fail without mutation',()=>{
  const input=fixture(),result=buildApprovedFrameMask(input),source={width:64,height:48,rgba:input.source.rgba,rgbaSha256:result.sourceRgbaSha256,mask:result.mask,maskSha256:result.maskSha256};
  const asset={width:16,height:16,rgba:Buffer.alloc(16*16*4,255)},before=Buffer.from(asset.rgba);
  for(const registration of[{x:1.2,y:0,w:16,h:16},{x:0,y:0,w:17,h:16},{x:63,y:0,w:16,h:16}])assert.throws(()=>applyRegisteredMask({source,asset,registration}));
  assert.throws(()=>applyRegisteredMask({source:{...source,maskSha256:FIT},asset,registration:{x:0,y:0,w:16,h:16}}),/mask-binding/);assert.deepEqual(asset.rgba,before);
});
test('source conflicts: altered opaque RGB or alpha is preserved and reported; source and mask data are hash-bound',()=>{
  const input=fixture(),result=buildApprovedFrameMask(input),asset={width:64,height:48,rgba:Buffer.from(input.source.rgba)};
  const a=(8*64+20)*4,b=(8*64+21)*4;asset.rgba[a]=200;asset.rgba[b+3]=128;
  const source={width:64,height:48,rgba:input.source.rgba,rgbaSha256:result.sourceRgbaSha256,mask:result.mask,maskSha256:result.maskSha256};
  const output=applyRegisteredMask({asset,source,registration:{x:0,y:0,w:64,h:48}});
  assert.deepEqual(output.sourceConflicts,[8*64+20,8*64+21]);assert.equal(output.rgba[a],200);assert.equal(output.rgba[b+3],128);
  assert.throws(()=>applyRegisteredMask({asset,source:{...source,rgbaSha256:FIT},registration:{x:0,y:0,w:64,h:48}}),/source-rgba-binding/);
  const malformed=Uint8Array.from(result.mask);malformed[0]=2;assert.throws(()=>applyRegisteredMask({asset,source:{...source,mask:malformed,maskSha256:digest(malformed)},registration:{x:0,y:0,w:64,h:48}}),/invalid-mask-cell/);
});
