"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {residualTextPlans}=require('../packages/slideclone-core/residual-text-erasure');
const {restoreResidualNativeFillBackground}=require('../packages/slideclone-core/residual-native-fill-background');
const {eraseMasks}=require('../packages/slideclone-core/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/residual-pixel-ownership');
function fixture(alpha=255){
 const source={width:80,height:50,rgba:Buffer.alloc(80*50*4,255)},fill=[220,170,205];
 for(let y=15;y<35;y++)for(let x=20;x<60;x++)source.rgba.set([...fill,alpha],(y*80+x)*4);
 for(let y=19;y<31;y++)for(let x=36;x<40;x++)source.rgba.set([20,20,20,255],(y*80+x)*4);
 const text={x:14,y:9,w:52,h:32,textInk:{color:[20,20,20],polygon:[[20,15],[60,15],[60,35],[20,35]]}};
 return {source,fill,text,panel:{x:20,y:15,w:40,h:20,sourceFill:fill}};
}
test('native matte corroboration preserves every source core and ownership decision',()=>{
 const f=fixture(),before=Buffer.from(f.source.rgba),plain=residualTextPlans(f.source,[f.text])[0],resolved=residualTextPlans(f.source,[f.text,f.panel])[0];
 assert.deepEqual(resolved.owned,plain.owned);assert.deepEqual(resolved.core,plain.core);
 assert.equal(resolved.corePixels,plain.corePixels);assert.equal(resolved.ownedPixels,plain.ownedPixels);
 assert.equal(resolved.rejectedBoundaryPixels,plain.rejectedBoundaryPixels);assert.equal(resolved.rejectedSupportPixels,plain.rejectedSupportPixels);
 assert.ok(resolved.scannedPixels>plain.scannedPixels);assert.deepEqual(f.source.rgba,before);
 const i=(25-resolved.bounds.y)*resolved.bounds.w+38-resolved.bounds.x;
 assert.deepEqual([...resolved.background.subarray(i*3,i*3+3)],f.fill);
 const residual=eraseMasks(f.source,[f.text,f.panel]);
 assert.deepEqual([...residual.rgba.subarray((25*80+38)*4,(25*80+38)*4+4)],[...f.fill,255]);
});
test('unwitnessed paint and translucent source patches cannot change a text background',()=>{
 for(const alpha of [255,200]){
  const f=fixture(alpha);if(alpha===255)for(let y=15;y<35;y++)for(let x=20;x<60;x++){
   if(x>=36&&x<40&&y>=19&&y<31)continue;f.source.rgba.set([255,255,255,255],(y*80+x)*4);
  }
  const plain=residualTextPlans(f.source,[f.text])[0],resolved=residualTextPlans(f.source,[f.text,f.panel])[0];
  assert.deepEqual(resolved.background,plain.background);assert.deepEqual(resolved.owned,plain.owned);
 }
});
test('a stable antialias shade within an owned glyph cannot nominate its own background',()=>{
 const f=fixture(),gray=[160,160,160];
 for(let y=15;y<35;y++)for(let x=20;x<60;x++)f.source.rgba.set([255,255,255,255],(y*80+x)*4);
 for(let y=19;y<31;y++)for(let x=34;x<44;x++)f.source.rgba.set([...(x===34||x===43?[20,20,20]:gray),255],(y*80+x)*4);
 const plain=residualTextPlans(f.source,[f.text])[0],resolved=residualTextPlans(f.source,[f.text,{...f.panel,sourceFill:gray}])[0];
 assert.deepEqual(resolved.background,plain.background);assert.deepEqual(resolved.core,plain.core);
});
test('different overlapping witnessed paints keep their existing background instead of guessing layer order',()=>{
 const f=fixture(),other=[180,215,245];
 for(let y=15;y<35;y++)for(let x=45;x<60;x++)f.source.rgba.set([...other,255],(y*80+x)*4);
 const a=f.panel,b={...f.panel,sourceFill:other},plain=residualTextPlans(f.source,[f.text])[0];
 const first=residualTextPlans(f.source,[f.text,a,b])[0],second=residualTextPlans(f.source,[b,a,f.text])[0];
 assert.deepEqual(first.background,plain.background);assert.deepEqual(second.background,first.background);
 assert.deepEqual(first.owned,plain.owned);
});
test('native matte probes respect the remaining scan allowance and do not modify unowned pixels',()=>{
 const f=fixture(),make=()=>({...residualTextPlans(f.source,[f.text])[0],overlaps:[{mask:f.panel,bounds:f.panel,fill:f.fill}]});
 const empty=make(),before=empty.background.slice(),samples=empty.scannedPixels;
 assert.deepEqual(restoreResidualNativeFillBackground(f.source,[empty],0),{samples:0,restoredPixels:0});
 assert.deepEqual(empty.background,before);assert.equal(empty.scannedPixels,samples);
 const plan=make(),allowed=restoreResidualNativeFillBackground(f.source,[plan],64);
 assert.ok(allowed.samples<=64);assert.equal(plan.scannedPixels,samples+allowed.samples);
 for(let i=0;i<plan.owned.length;i++)if(!plan.owned[i])assert.deepEqual(plan.background.subarray(i*3,i*3+3),before.subarray(i*3,i*3+3));
 assert.deepEqual(restoreResidualNativeFillBackground(f.source,[],64),{samples:0,restoredPixels:0});
});
test('a witnessed matte does not erase or hide boundary-connected rejected cores',()=>{
 // Keep the line open after the planner's existing one-time context expansion.
 // A line ending at the initial bounds is isolated by that expansion and is
 // correctly admitted; it does not exercise the rejected-component boundary.
 const f=fixture();for(let x=0;x<80;x++)f.source.rgba.set([20,20,20,255],(25*80+x)*4);
 const masks=[f.text,f.panel],residual=eraseMasks(f.source,masks,{transparent:true}),report=auditResidualPixelOwnership({source:f.source,residual,masks});
 assert.equal(report.passed,false);assert.ok(report.remainingTextCorePixels>0);
 const plans=residualTextPlans(f.source,masks),original=residualTextPlans(f.source,[f.text]);
 assert.ok(original[0].rejectedBoundaryPixels>0);
 assert.deepEqual(plans[0].core,original[0].core);assert.deepEqual(plans[0].owned,original[0].owned);
});
test('existing public admission rejects hostile native paint fields without executing getters',()=>{
 const f=fixture();let calls=0;const hostile=Object.defineProperty({...f.panel},'sourceFill',{get(){calls++;throw Error('PRIVATE');},enumerable:true});
 assert.throws(()=>residualTextPlans(f.source,[f.text,hostile]),e=>!e.message.includes('PRIVATE'));
 assert.throws(()=>residualTextPlans(f.source,[f.text,{...f.panel,sourceFill:[-1,0,0]}]),TypeError);
 assert.equal(calls,0);
});
test('native matte regression and runtime module are included in the unified CI surfaces',()=>{
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.classifyTestFile(__filename),'unit');assert.equal(suites.includesSuite(__filename,'unit'),true);assert.equal(suites.includesSuite(__filename,'all'),true);
 assert.ok(runtime.REQUIRED_FILES.includes('packages/slideclone-core/residual-native-fill-background.js'));
});
