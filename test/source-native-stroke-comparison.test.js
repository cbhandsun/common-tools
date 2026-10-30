'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareNativeStrokeRender}=require('../packages/slideclone-core/routing/source-native-stroke-comparison');
const {compareNativeSourceRender}=require('../packages/slideclone-core/scene-plan/source-native-render-comparison');
const W=64,H=48,BG=[250,244,238];
/** Anti-aliased stroke renderer: coverage of a w-wide segment set, supersampled.
 * @param {{segments:number[][],color:number[],width?:number,dx?:number,dy?:number}[]} strokes */
function draw(strokes){
 const rgba=new Uint8Array(W*H*4);
 for(let n=0;n<W*H;n++)rgba.set([...BG,255],n*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(const s of strokes){
  const half=(s.width??3)/2;let hit=0;
  for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
   const px=x+(sx+.5)/4-(s.dx??0),py=y+(sy+.5)/4-(s.dy??0);
   if(s.segments.some(([ax,ay,bx,by])=>{const vx=bx-ax,vy=by-ay,l=vx*vx+vy*vy;
    const t=l?Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/l)):0;return Math.hypot(px-ax-t*vx,py-ay-t*vy)<=half;}))hit++;
  }
  if(!hit)continue;const a=hit/16,n=(y*W+x)*4;
  for(let c=0;c<3;c++)rgba[n+c]=Math.round((rgba[n+c]??0)*(1-a)+(s.color[c]??0)*a);
 }
 return {width:W,height:H,rgba};
}
/** A T junction whose two branches carry slightly different paint, as in AI diagrams. */
const tee=(o={})=>[{segments:[[8,12,56,12]],color:[190,93,44],...o},{segments:[[32,12,32,40]],color:[209,84,54],...o}];
const mask=img=>{const m=new Uint8Array(W*H);for(let n=0;n<W*H;n++)m[n]=[0,1,2].some(c=>Math.abs((BG[c]??0)-(img.rgba[n*4+c]??0))>=42)?1:0;return m;};
const compare=(source,rendered,fn=compareNativeStrokeRender)=>fn({source,rendered,sourceMask:mask(source),background:BG,work:{checks:0}});

test('positive controls: identical geometry under sub-pixel phase and 1px placement passes',()=>{
 const source=draw(tee());
 for(const shift of [{dx:0,dy:0},{dx:.5,dy:0},{dx:.5,dy:.5},{dx:1,dy:0},{dx:0,dy:-1}])
  assert.equal(compare(source,draw(tee(shift))).paintMatched,true,JSON.stringify(shift));
});
test('the legacy per-pixel comparator rejects a half-pixel copy of the source (documented defect)',()=>{
 const source=draw(tee());
 assert.equal(compare(source,draw(tee({dx:.5,dy:.5})),compareNativeSourceRender).paintMatched,false);
});
test('negative controls: displaced, missing, extra, misrouted and recoloured strokes fail',()=>{
 const source=draw(tee());
 const cases={
  displaced3px:tee({dx:3,dy:0}),
  missingBranch:[tee()[0]],
  extraBranch:[...tee(),{segments:[[56,12,56,40]],color:[190,93,44]}],
  wrongTarget:[tee()[0],{segments:[[20,12,20,40]],color:[209,84,54]}],
  wrongColour:tee({color:[40,120,200]}),
  thinFaint:tee({width:1,color:[236,214,200]}),
 };
 for(const [name,strokes]of Object.entries(cases))
  assert.equal(compare(source,draw(/** @type {any} */(strokes))).paintMatched,false,name);
});
test('empty, transparent and malformed inputs never pass',()=>{
 const source=draw(tee());
 const empty=compareNativeStrokeRender({source,rendered:source,sourceMask:new Uint8Array(W*H),background:BG,work:{checks:0}});
 assert.equal(empty.paintMatched,false);
 const alpha=draw(tee());alpha.rgba[3]=0;assert.equal(compare(source,alpha).status,'alpha-rejected');
 for(const value of [null,[],{},new Proxy({},{get(){throw new Error('trap');}})])
  assert.throws(()=>compareNativeStrokeRender(value),/controls are invalid/u);
 const bad=mask(source);bad[0]=2;
 assert.throws(()=>compareNativeStrokeRender({source,rendered:source,sourceMask:bad,background:BG,work:{checks:0}}),/mask is invalid/u);
 assert.throws(()=>compareNativeStrokeRender({source,rendered:{...source,width:W+1},sourceMask:mask(source),background:BG,work:{checks:0}}),/rasters are invalid/u);
});
test('the work budget is charged atomically and exhaustion yields no partial support',()=>{
 const source=draw(tee()),work={checks:4000000-10};
 const result=compareNativeStrokeRender({source,rendered:source,sourceMask:mask(source),background:BG,work});
 assert.equal(result.status,'budget-exhausted');assert.equal(result.paintMatched,false);assert.equal(work.checks,4000001);
});
test('regression is discovered by the unified unit CI entrypoint',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(row=>row.file.replaceAll('\\','/')==='test/source-native-stroke-comparison.test.js'));
});
