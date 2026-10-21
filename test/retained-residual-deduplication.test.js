"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {retainResidualDeduplication:retain}=require('../packages/slideclone-worker-adapter/retained-residual-deduplication');
function fixture(){
 const local={id:'local',assetPath:'assets/local.png',box:{x:20,y:20,w:5,h:5},source:{residualCrop:true,pageImage:'assets/source.png'}};
 const baseline={pages:[{images:[{...local,id:'full',box:{x:0,y:0,w:100,h:100}},local]}]};
 return {baseline,candidate:{pages:[{images:[structuredClone(local)]}]},previous:{passed:true,candidateObjects:4,erasedObjects:4}};
}
test('removing a full residual retains the original erasure proof for its unchanged local subset',()=>{
 const {baseline,candidate,previous}=fixture();assert.deepEqual(retain(baseline,candidate,previous),{candidateObjects:4,erasedObjects:4});
});
test('new, changed, moved and ambiguous residuals cannot inherit unrelated evidence',()=>{
 for(const mode of ['asset','geometry','source','id','duplicate','page']){
  const {baseline,candidate,previous}=fixture(),image=candidate.pages[0].images[0];
  if(mode==='asset')image.assetPath='assets/new.png';if(mode==='geometry')image.box.w++;
  if(mode==='source')image.source.pageImage='assets/other.png';if(mode==='id')image.id='new';
  if(mode==='duplicate')baseline.pages[0].images.push(structuredClone(baseline.pages[0].images[1]));
  if(mode==='page')candidate.pages.push({images:[]});
  assert.deepEqual(retain(baseline,candidate,previous),{candidateObjects:0,erasedObjects:0},mode);
 }
});
test('absent, failed, empty and malformed erasure counters never become positive evidence',()=>{
 const {baseline,candidate}=fixture();
 for(const previous of [undefined,{}, {passed:false,candidateObjects:4,erasedObjects:4},{passed:true,candidateObjects:0,erasedObjects:0},{passed:true,candidateObjects:4,erasedObjects:3},{passed:true,candidateObjects:Infinity,erasedObjects:Infinity}])
  assert.deepEqual(retain(baseline,candidate,previous),{candidateObjects:0,erasedObjects:0});
 assert.deepEqual(retain({pages:[]},{pages:[]},{passed:true,candidateObjects:1,erasedObjects:1}),{candidateObjects:1,erasedObjects:1});
});
