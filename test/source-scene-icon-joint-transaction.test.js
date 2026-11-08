'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {diagonalGapFixture}=require('./helpers/scene-diagonal-gap.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
function fixture(t,{broken=false,coupled=false,multipart=false,ordinary=false}={}){
 const f=diagonalGapFixture(),image={width:440,height:220,rgba:Buffer.alloc(440*220*4,255)};
 for(let y=0;y<220;y++)for(const offset of [0,220])f.image.rgba.copy(image.rgba,(y*440+offset)*4,y*220*4,(y+1)*220*4);
 if(multipart)for(const offset of [0,220])for(let y=125;y<129;y++)for(let x=165;x<169;x++)image.rgba.set([30,60,90,255],(y*440+x+offset)*4);
 if(ordinary)for(const offset of [0,220])for(let y=135;y<139;y++)for(let x=170;x<174;x++)image.rgba.set([30,60,90,255],(y*440+x+offset)*4);
 const objects=[],relations=[];
 for(const offset of [0,220]){
  const suffix=offset?'second':'first';
  objects.push({id:'object-node-'+suffix,regionId:'region-root',kind:'container',box:{...f.from.box,x:f.from.box.x+offset}},
   {id:'object-icon-'+suffix,regionId:'region-root',kind:'icon',box:ordinary?{x:135+offset,y:135,w:45,h:45}:{x:125+offset,y:125,w:45,h:45}});
  relations.push({id:'relation-'+suffix,regionId:'region-root',fromId:'object-node-'+suffix,toId:'object-icon-'+suffix,
   direction:broken&&offset?'backward':'forward',shaftBox:{...f.shaftBox,x:f.shaftBox.x+offset}});
 }
 if(coupled)relations.push({id:'relation-dependency',regionId:'region-root',fromId:'object-icon-first',toId:'object-icon-second',direction:'unknown'});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-joint-transaction-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:440,heightPx:220,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:440,h:220}}],objects,relations};
 const compile=options=>compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:440,heightPt:220},preflight:true,...options});
 return {compile,sourceFile};
}
test('real compiler atomically adopts complete source-proven icons and connectors, with an unchanged default path',t=>{
 const f=fixture(t),before=fs.readFileSync(f.sourceFile),plain=f.compile({jointIconRelations:false}),joint=f.compile({jointIconRelations:true});
 assert.equal(plain.evidence.icons,0);assert.equal(plain.evidence.resolvedRelations,0);
 assert.equal(joint.evidence.icons,2);assert.equal(joint.evidence.resolvedRelations,2);assert.deepEqual(joint.evidence.unresolved,[]);
 assert.deepEqual(joint.page.images,[]);assert.deepEqual(fs.readFileSync(f.sourceFile),before);
 for(const suffix of ['first','second']){
  const line=joint.page.shapes.find(s=>s.source?.sceneRelationId==='relation-'+suffix);assert.ok(line);
  assert.ok(joint.page.shapes.some(s=>s.id===line.style.endAnchor.elementId));
 }
});

test('ordinary isolated multipart icons use unique source-proven members after model-axis resolution fails',t=>{
 const f=fixture(t,{ordinary:true}),result=f.compile({jointIconRelations:false});
 assert.equal(result.evidence.icons,2);assert.equal(result.evidence.resolvedRelations,2);
 assert.equal(result.evidence.sourceIconEndpointGaps,2);assert.deepEqual(result.evidence.unresolved,[]);
 assert.equal(result.page.images.length,0);
 const broken=fixture(t,{ordinary:true,broken:true}).compile({jointIconRelations:false});
 assert.equal(broken.evidence.icons,2);assert.equal(broken.evidence.resolvedRelations,1);
 assert.ok(broken.evidence.unresolved.some(r=>r.id==='relation-second'));
});
test('independent failed dependencies retain unresolved status and cannot block a separate complete group',t=>{
 const f=fixture(t,{broken:true}),result=f.compile({jointIconRelations:true});
 assert.equal(result.evidence.icons,1);assert.equal(result.evidence.resolvedRelations,1);
 assert.ok(result.evidence.unresolved.some(r=>r.id==='object-icon-second'&&r.reason==='icon-isolation'));
 assert.ok(result.evidence.unresolved.some(r=>r.id==='relation-second'));
 assert.ok(!result.page.shapes.some(s=>s.id?.includes('object-icon-second')||s.source?.sceneRelationId==='relation-second'));
 assert.equal(result.evidence.jointIconRelations.groups.length,2);
});
test('connected pending icons commit as one group and leak neither candidate when either proof fails',t=>{
 const f=fixture(t,{broken:true,coupled:true}),result=f.compile({jointIconRelations:true});
 assert.equal(result.evidence.icons,0);assert.equal(result.evidence.resolvedRelations,0);
 assert.equal(result.evidence.jointIconRelations.groups.length,1);
 assert.equal(result.evidence.unresolved.filter(r=>r.reason==='icon-isolation').length,2);
 assert.ok(!result.page.shapes.some(s=>s.id?.includes('scene-icon-')||s.source?.sceneRelationId));
 for(const value of [null,1,'true',{},[]])assert.throws(()=>f.compile({jointIconRelations:value}),TypeError);
});
test('joint compiler regression is discovered by the unified CI entry',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-icon-joint-transaction.test.js'));
});

test('default compiler proves the unique contacted native member of a complete multipart icon',t=>{
 const f=fixture(t,{multipart:true}),result=f.compile({});
 assert.equal(result.evidence.icons,2);assert.equal(result.evidence.resolvedRelations,2);assert.deepEqual(result.evidence.unresolved,[]);
 for(const suffix of ['first','second']){
  const members=result.page.shapes.filter(s=>s.id?.startsWith('scene-icon-object-icon-'+suffix));assert.ok(members.length>=2);
  const relation=result.page.shapes.find(s=>s.source?.sceneRelationId==='relation-'+suffix);assert.ok(relation);
  assert.ok(members.some(s=>s.id===relation.style.endAnchor.elementId));
 }
});
