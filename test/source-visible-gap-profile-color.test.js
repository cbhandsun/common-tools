"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceVisibleGapProfile:profile}=require('../packages/slideclone-core/source-visible-gap-profile');
function fixture(vertical=false){
 // Keep the original twelve-column terminal witness monotonically widening.
 // The hollow base then tapers to a separately observed contiguous shaft.
 const width=60,rgba=Buffer.alloc(width*60*4,255),head=[2,4,6,8,10,12,12,12,12,12,12,12,10,6],widths=[...head,...Array(12).fill(3),...head.toReversed()],cells=[];
 for(const [column,w]of widths.entries()){
  const first=25-Math.floor(w/2);
  for(let offset=0;offset<w;offset++){
   if(w>=6&&offset>=2&&offset<w-2)continue;
   const x=vertical?first+offset:column+5,y=vertical?column+5:first+offset,n=y*width+x;
   rgba.set([30,60,90,255],n*4);cells.push(n);
  }
 }
 return {cells,width,horizontal:!vertical,rgba,direction:'both',increasing:true,work:{checks:0}};
}
test('a complete hollow terminal samples color from its admitted ink cells rather than empty geometric centers',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical),before=Buffer.from(f.rgba),result=profile(f);
  assert.ok(result);assert.equal(result.color,'#1E3C5A');assert.equal(result.widthPx,3);assert.equal(result.support,1);
  assert.deepEqual(f.rgba,before);assert.ok(f.work.checks<=4000000);
 }
});
test('ink sampling retains uniform-color, direction, continuity and work-budget rejection gates',()=>{
 const paint=fixture();for(const n of paint.cells){const x=n%paint.width;if(x>=16&&x<=24)paint.rgba.set([160,20,90,255],n*4);}
 assert.equal(profile(paint),null);
 assert.equal(profile({...fixture(),direction:'forward'}),null);
 const broken=fixture();broken.cells=broken.cells.filter(n=>n%broken.width!==19);assert.equal(profile(broken),null);
 assert.equal(profile({...fixture(),cells:[]}),null);
 const capped=fixture();capped.work.checks=4000000;assert.equal(profile(capped),null);
 const {includesSuite}=require('../scripts/test-suites');assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});

test('observed terminal coverage keeps the original color error and whole-component support gates',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical);
  for(const n of f.cells){const along=vertical?Math.floor(n/f.width):n%f.width;
   if(along<19||along>=31)f.rgba.set([143,158,173,255],n*4);
  }
  const before=Buffer.from(f.rgba),out=profile({...f,background:[255,255,255]});
  assert.ok(out);assert.equal(out.color,'#1E3C5A');assert.deepEqual(f.rgba,before);
  assert.equal(profile(f),null,'a source backdrop is required for coverage evidence');
  const competing=fixture(vertical);
  for(const n of competing.cells){const along=vertical?Math.floor(n/competing.width):n%competing.width;
   if(along<19)competing.rgba.set([170,30,40,255],n*4);
  }
  assert.equal(profile({...competing,background:[255,255,255]}),null,'a different terminal paint cannot be treated as coverage');
  const neutral=fixture(vertical);
  for(const n of neutral.cells){const along=vertical?Math.floor(n/neutral.width):n%neutral.width;
   neutral.rgba.set(along<19?[160,160,160,255]:[30,30,30,255],n*4);
  }
  assert.equal(profile({...neutral,background:[255,255,255]}),null,'real gray paint remains ambiguous');
 }
});
