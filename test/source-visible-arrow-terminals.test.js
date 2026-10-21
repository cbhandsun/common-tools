'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceVisibleArrowTerminals:terminals}=require('../packages/slideclone-core/source-visible-arrow-terminals');
const {sourceVisibleGapProfile:profile}=require('../packages/slideclone-core/source-visible-gap-profile');
const {readPng}=require('../packages/slideclone-core/png');
const widths=[1,2,4,5,6,7,8,10,11,12,12,...Array(16).fill(4),12,12,10,9,8,6,5,4,3,2];
test('narrow taper columns do not veto the separately witnessed unique central shaft',()=>{
 const counts=[...widths],before=[...widths],work={checks:0};
 assert.deepEqual(terminals({widths,counts,leftArrow:true,rightArrow:true,work}),{widthPx:4,firstBody:11,lastBody:26});
 assert.deepEqual(widths,before);assert.ok(work.checks>0&&work.checks<=4000000);
 assert.equal(terminals({widths,counts,leftArrow:false,rightArrow:true}),null);
 const broken=widths.map((w,i)=>i===18?12:w);
 assert.equal(terminals({widths:broken,counts:broken,leftArrow:true,rightArrow:true}),null);
 const capped={checks:4000000};assert.equal(terminals({widths,counts,leftArrow:true,rightArrow:true,work:capped}),null);
});
test('real JPEG arrow corridors preserve whole-path paint, direction and continuity gates',()=>{
 for(const [file,background]of [['source-double-arrow-taper-jpeg.png',[245,250,255]],['source-double-arrow-solid-jpeg.png',[245,249,255]]]){
  const image=readPng(path.join(__dirname,'fixtures',file)),cells=[];
  for(let n=0;n<image.width*image.height;n++)if(background.some((v,c)=>Math.abs(v-image.rgba[n*4+c])>=42))cells.push(n);
  const input={...image,cells,horizontal:true,direction:'both',increasing:true,background,work:{checks:0}};
  const result=profile(input);assert.ok(result);assert.equal(result.support,1);assert.ok(result.widthPx>=1&&result.widthPx<=5);
  assert.equal(profile({...input,direction:'forward',work:{checks:0}}),null);
  const split=cells.filter(n=>n%image.width!==20);
  assert.equal(profile({...input,cells:split,work:{checks:0}}),null);
 }
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
