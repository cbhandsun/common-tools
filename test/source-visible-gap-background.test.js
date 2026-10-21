'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceVisibleGapBackground:background}=require('../packages/slideclone-core/source-visible-gap-background');
function fixture(vertical=false){
 const width=vertical?25:40,height=vertical?40:25,rgba=Buffer.alloc(width*height*4,255),foreign=new Uint8Array(width*height);
 for(let a=0;a<3;a++)for(let c=0;c<25;c++){
  const n=vertical?(height-1-a)*width+c:c*width+width-1-a;foreign[n]=1;rgba.set([247,228,230,255],n*4);
 }
 return {width,height,rgba,foreign,horizontal:!vertical,work:{checks:0}};
}
test('a privately identified node fringe cannot masquerade as the visible gap backdrop',()=>{
 for(const vertical of [false,true]){const f=fixture(vertical),before=Buffer.from(f.rgba),result=background(f);
  assert.deepEqual(result,[255,255,255]);assert.deepEqual(f.rgba,before);assert.ok(f.work.checks<=4000000);
  assert.equal(background({...f,foreign:new Uint8Array(f.foreign.length)}),null,'unowned colored corners still reject');
 }
});
test('visible background evidence retains four source samples, color stability and work limits',()=>{
 const f=fixture(),all=fixture();all.foreign.fill(1);assert.equal(background(all),null);
 const gradient=fixture();gradient.rgba.set([90,30,20,255],0);assert.equal(background(gradient),null);
 const thin={width:1,height:25,rgba:Buffer.alloc(100,255),foreign:new Uint8Array(25),horizontal:true,work:{checks:0}};
 assert.equal(background(thin),null,'a shared point cannot count twice as independent evidence');
 const capped=fixture();capped.work.checks=4000000;assert.equal(background(capped),null);
 const {includesSuite}=require('../scripts/test-suites');assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
 assert.ok(background(f));
});
