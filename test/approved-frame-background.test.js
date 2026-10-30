'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildApprovedFrameMask,signedDistance,digest}=require('../packages/slideclone-core/scene-plan/approved-frame-mask.js');
const {buildBackgroundPlan,applyBackgroundPlan}=require('../packages/slideclone-core/scene-plan/approved-frame-background.js');
const HASH='a'.repeat(64),FIT='b'.repeat(64),EVIDENCE='c'.repeat(64);
function fixture(){
 const width=64,height=48,rgba=Buffer.alloc(width*height*4),f={x:8,y:8,w:48,h:30,radius:6};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sd=signedDistance(f,x,y),color=Math.abs(sd)<=.7?[225,235,230]:sd<0?[242,249,245]:[251,250,248],at=(y*width+x)*4;for(let c=0;c<3;c++)rgba[at+c]=color[c];rgba[at+3]=255;}
 const data={approvalId:'user-20261023-approx-frame',source:{width,height,rgba},sourceSha256:HASH,fitSha256:FIT,frames:[{status:'fitted',id:'region-n6',source:{width,height,sha256:HASH},geometry:{boxPx:{x:8,y:8,w:48,h:30},radiusPx:6,strokeWidthPx:2,strokeColor:'#E1EBE6'},approximation:{approvalId:'user-20261023-approx-frame'}}],protections:[],supplement:[],supplementEvidenceSha256:EVIDENCE};
 data.originalMaskSha256=buildApprovedFrameMask(data).maskSha256;return data;
}
test('normal: interpolate bounded inside/outside pale backgrounds, do not create white transparent holes',()=>{
 const data=fixture(),before=Buffer.from(data.source.rgba),plan=buildBackgroundPlan(data),index=8*64+30;
 assert.equal(plan.repairMask[index],1);assert.deepEqual(Array.from(plan.replacementRGBA.subarray(index*4,index*4+4)),[247,250,247,255]);
 const output=applyBackgroundPlan({asset:data.source,source:data.source,plan,registration:{x:0,y:0,w:64,h:48}});
 assert.ok(output.newlyReconstructed>100);assert.equal(output.rgba[index*4+3],255);assert.deepEqual(data.source.rgba,before);assert.equal(plan.inferredFill,true);assert.equal(plan.strictAccepted,false);
 for(let n=0;n<plan.unionMask.length;n++)if(!plan.unionMask[n])assert.deepEqual(output.rgba.subarray(n*4,n*4+4),before.subarray(n*4,n*4+4));
});
test('empty: no frames yields no repair and an identical independent output buffer',()=>{
 const data=fixture();data.frames=[];data.originalMaskSha256=buildApprovedFrameMask(data).maskSha256;const plan=buildBackgroundPlan(data);
 assert.equal(plan.repairMask.some(Boolean),false);const output=applyBackgroundPlan({asset:data.source,source:data.source,plan,registration:{x:0,y:0,w:64,h:48}});assert.deepEqual(output.rgba,data.source.rgba);assert.notEqual(output.rgba,data.source.rgba);
});
test('protection: visible crossing and missing protected witness preserve source rather than broadening sampling',()=>{
 const data=fixture();data.protections=[{id:'crossing',kind:'polyline',points:[{x:20,y:0},{x:20,y:45}],widthPx:2,marginPx:1},{id:'inside-witness-route',kind:'polyline',points:[{x:29,y:14},{x:31,y:14}],widthPx:2,marginPx:1}];data.originalMaskSha256=buildApprovedFrameMask(data).maskSha256;
 const plan=buildBackgroundPlan(data);assert.equal(plan.unionMask[8*64+20],0);assert.equal(plan.repairMask[8*64+30],0);assert.ok(plan.failures['background-not-visible-pale']>0);
});
test('source matching: opaque conflicts and pre-existing hidden transparent RGBA are preserved',()=>{
 const data=fixture(),plan=buildBackgroundPlan(data),asset={width:64,height:48,rgba:Buffer.from(data.source.rgba)},a=(8*64+24)*4,b=(8*64+25)*4;
 asset.rgba[a]=123;asset.rgba[b]=17;asset.rgba[b+3]=0;const output=applyBackgroundPlan({asset,source:data.source,plan,registration:{x:0,y:0,w:64,h:48}});
 assert.equal(output.rgba[a],123);assert.deepEqual(Array.from(output.rgba.subarray(b,b+4)),Array.from(asset.rgba.subarray(b,b+4)));assert.equal(output.sourceConflictCount,1);assert.ok(output.alreadyTransparent>0);
});
test('supplement: audited rail cells get an exact union addition; protected cells remain excluded; distant forged rails reject',()=>{
 const data=fixture(),n=11*64+30; // 3 px inside; original color background fails original mask.
 data.supplement=[{frameId:'region-n6',x:30,y:11,sourceRGBA:Array.from(data.source.rgba.subarray(n*4,n*4+4))}];
 const plan=buildBackgroundPlan(data);assert.equal(plan.supplementReport.addedOutsideOriginal,1);assert.equal(plan.unionMask[n],1);
 const invalid=fixture(),i=20*64+30;invalid.supplement=[{frameId:'region-n6',x:30,y:20,sourceRGBA:Array.from(invalid.source.rgba.subarray(i*4,i*4+4))}];assert.throws(()=>buildBackgroundPlan(invalid),/rail-outside-local-band/);
 const protectedData=fixture();protectedData.protections=[{id:'grid',kind:'polyline',points:[{x:20,y:11},{x:40,y:11}],widthPx:1,marginPx:1}];protectedData.originalMaskSha256=buildApprovedFrameMask(protectedData).maskSha256;protectedData.supplement=data.supplement;
 assert.equal(buildBackgroundPlan(protectedData).supplementReport.protectedExcluded,1);
});
test('failure: missing/unsafe background keeps old source, hashes and registration fail closed',()=>{
 const data=fixture();for(const y of[14,15]){const i=(y*64+30)*4;data.source.rgba[i]=0;}data.originalMaskSha256=buildApprovedFrameMask(data).maskSha256;
 const plan=buildBackgroundPlan(data);assert.equal(plan.repairMask[8*64+30],0);
 assert.throws(()=>applyBackgroundPlan({asset:data.source,source:data.source,plan:{...plan,replacementRgbaSha256:FIT},registration:{x:0,y:0,w:64,h:48}}),/plan-bytes-binding/);
 assert.throws(()=>applyBackgroundPlan({asset:data.source,source:data.source,plan,registration:{x:.5,y:0,w:64,h:48}}),/registration-mismatch/);
});
test('invalid/extreme/security: proxies and getters execute no traps; sparse supplements, stale original mask and extreme dimensions reject',()=>{
 let calls=0;const proxy=new Proxy({},{get(){calls++;throw new Error('trap');}});assert.throws(()=>buildBackgroundPlan(proxy));const revoked=Proxy.revocable({},{});revoked.revoke();assert.throws(()=>buildBackgroundPlan(revoked.proxy));
 const getter=fixture();Object.defineProperty(getter,'supplement',{get(){calls++;throw new Error('getter');}});assert.throws(()=>buildBackgroundPlan(getter));
 const sparse=fixture();sparse.supplement=new Array(1);sparse.supplement[Symbol('padding')]=1;assert.throws(()=>buildBackgroundPlan(sparse));
 const stale=fixture();stale.originalMaskSha256=FIT;assert.throws(()=>buildBackgroundPlan(stale),/original-mask-binding/);
 const extreme=fixture();extreme.source.width=32768;extreme.source.height=32768;assert.throws(()=>buildBackgroundPlan(extreme));assert.equal(calls,0);
});
