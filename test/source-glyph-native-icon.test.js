'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
const {readPng,writePng}=require('../packages/slideclone-core/png');
const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {matchSourceLocalGlyphDetailed}=require('../packages/slideclone-core/scene-plan/source-local-glyph');
const {captureNativeGlyphIcon,finalNativeGlyphIcon}=require('../packages/slideclone-core/scene-plan/source-glyph-native-icon');
const {issueSceneGlyphRecovery,withSceneGlyphRecovery,sceneGlyphRecoveryLines,sealSceneGlyphRecoveryDeck,verifySceneGlyphRecoveryPage}=require('../packages/slideclone-core/scene-plan/source-glyph-recovery');
const {encodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
function fixture(t){
 const root=createTemporaryTestDirectory('native-glyph-icon-');t.after(()=>removeTemporaryTestDirectory(root));
 const sourceFile=path.join(root,'source.png');fs.copyFileSync(path.join(__dirname,'fixtures/source-tinted-glyph/checkmark-source.png'),sourceFile);
 const image=readPng(sourceFile),owner={x:3.042,y:1.568,w:23.892,h:26.064},size={widthPt:30,heightPt:30};
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:30,heightPx:30,
  regions:[{id:'region',kind:'section',parentId:null,box:{x:0,y:0,w:30,h:30}}],objects:[{id:'badge',kind:'icon',regionId:'region',box:owner}],relations:[],
  admission:{complete:false,rejections:[{collection:'missingText',index:0,reason:'glyph-source-unit'}]}};
 const proposal={index:0,text:null,confidence:0,box:owner,objectId:'badge'},view={index:0,text:'✓',confidence:.98,color:'#FFFFFF'};
 const a={x:8.04,y:9.105,w:13.952,h:11.985},b={x:7.872,y:9.035,w:14.208,h:10.778};
 const request={plan,sourceFile,proposal,observations:[[{...view,box:a}],[{...view,box:b}]],budget:{used:0},representation:'native-icon'};
 const iconRequest={image,box:owner,id:'badge',regionId:'region',root,slideSize:size,textBoxes:[],budget:{used:0}};
 const cells=matchSourceLocalGlyphDetailed(image,owner,a,b,{used:0}).cells;
 return {root,image,sourceFile,plan,size,request,iconRequest,cells};
}
test('complete native icon proof rejects the baseline vectorization that drops a measured glyph',t=>{
 const f=fixture(t),baseline=compileSceneIcon(f.iconRequest,{preflight:true,nativePictorial:true,parentObjectId:''});
 assert.ok(baseline.shapes.length>0);
 assert.equal(captureNativeGlyphIcon({image:f.image,compiled:baseline,parentId:'badge',cells:f.cells,slideSize:f.size,budget:{used:0}}),null);
 const complete=compileSceneIcon(f.iconRequest,{preflight:true,nativePictorial:true,parentObjectId:'',preserveStructureBudget:false});
 const budget={used:0},proof=captureNativeGlyphIcon({image:f.image,compiled:complete,parentId:'badge',cells:f.cells,slideSize:f.size,budget});
 assert.ok(proof);assert.ok(budget.used>0&&budget.used<=4000000);assert.ok(proof.ids.length<=32);
 assert.ok(finalNativeGlyphIcon({shapes:complete.shapes,images:[]},proof));
 assert.equal(captureNativeGlyphIcon({image:f.image,compiled:structuredClone(complete),parentId:'badge',cells:f.cells,slideSize:f.size,budget:{used:0}}),null);
 assert.throws(()=>captureNativeGlyphIcon({image:f.image,compiled:complete,parentId:'badge',cells:f.cells,slideSize:f.size,budget:{used:4000000}}),/budget/);
});
test('normal compiler emits the complete native pictorial owner once, retains historical failure and seals its glyph',async t=>{
 const f=fixture(t),before=structuredClone(f.plan),token=issueSceneGlyphRecovery(f.request);
 assert.deepEqual(sceneGlyphRecoveryLines(token),[]);
 await withSceneGlyphRecovery(token,()=>{
  const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan:f.plan,sourceFile:f.sourceFile,root:f.root,slideSize:f.size,pictorialMode:'source-crop'});
  assert.ok(!compiled.evidence.unresolved.some(r=>r.id==='proposal-missingText-0'));
  const report=compiled.evidence.missingGlyphRecovery;assert.equal(report.items.length,1);assert.equal(report.items[0].representation,'native-icon');
  assert.equal(compiled.page.textBoxes.length,0);assert.ok(!compiled.page.images.some(i=>i.id==='scene-icon-badge'));
  assert.equal(report.items[0].nativePartIds.length,compiled.page.shapes.filter(s=>s.id.startsWith('scene-icon-badge-')).length);
  const deck={slideSize:f.size,pages:[compiled.page]};
  // Exercise the exact reversible transport normalization used in production.
  for(const shape of compiled.page.shapes)if(shape.style?.freeformSegments){shape.style.freeformPath=encodeNativeFreeformPath(shape.style.freeformSegments);delete shape.style.freeformSegments;}
  sealSceneGlyphRecoveryDeck(deck);assert.equal(verifySceneGlyphRecoveryPage(compiled.page,f.size),true);
  const part=compiled.page.shapes.find(s=>report.items[0].nativePartIds.includes(s.id));part.style.fill='#000000';
  assert.equal(verifySceneGlyphRecoveryPage(compiled.page,f.size),false);
 });assert.deepEqual(f.plan,before);
});
test('native icon proof rejects missing, duplicated, hidden, replaced and non-native members',t=>{
 const f=fixture(t),compiled=compileSceneIcon(f.iconRequest,{preflight:true,nativePictorial:true,parentObjectId:'',preserveStructureBudget:false});
 const proof=captureNativeGlyphIcon({image:f.image,compiled,parentId:'badge',cells:f.cells,slideSize:f.size,budget:{used:0}});assert.ok(proof);
 const original={shapes:compiled.shapes,images:[]};
 for(const change of[p=>p.shapes.pop(),p=>p.shapes.push(structuredClone(p.shapes[0])),p=>p.shapes[0].style.opacity=0,
  p=>p.shapes.push({...structuredClone(p.shapes[0]),id:'renamed-duplicate'}),
  p=>p.shapes[0].style.gradient={type:'linear'},p=>p.images.push({id:'scene-icon-badge'}),p=>p.shapes[0].source.editable=false,
  p=>p.shapes[0].box.x+=1,p=>p.shapes[0].style.freeformPath='bad']){
  const p=structuredClone(original);change(p);let result;try{result=finalNativeGlyphIcon(p,proof);}catch{result=null;}assert.equal(result,null);
 }
});
test('invalid representation and a non-icon owner cannot acquire native glyph recovery',t=>{
 const f=fixture(t);
 for(const representation of['picture','',{},null])assert.throws(()=>issueSceneGlyphRecovery({...f.request,representation}),/Scene glyph recovery/);
 const plan=structuredClone(f.plan);plan.objects[0].kind='container';assert.throws(()=>issueSceneGlyphRecovery({...f.request,plan}),/Scene glyph recovery/);
});
test('one bounded batch seals native icon and positioned text recovery without nested scopes or duplicate glyphs',async t=>{
 const f=fixture(t),dots=readPng(path.join(__dirname,'fixtures/source-dot-row/three-dot-source.png'));
 const image={width:60,height:30,rgba:Buffer.alloc(60*30*4,255)};
 for(let y=0;y<30;y++)f.image.rgba.copy(image.rgba,y*60*4,y*30*4,(y+1)*30*4);
 for(let y=0;y<dots.height;y++)dots.rgba.copy(image.rgba,((y+5)*60+32)*4,y*dots.width*4,(y+1)*dots.width*4);
 writePng(f.sourceFile,image);const plan=structuredClone(f.plan);
 plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');plan.widthPx=60;plan.regions[0].box.w=60;
 const outer={x:32,y:5,w:26,h:13};plan.objects.push({id:'dots',kind:'container',pictorialContent:'absent',regionId:'region',box:outer});
 plan.admission.rejections.push({collection:'missingText',index:1,reason:'glyph-source-unit'});
 const native=issueSceneGlyphRecovery({...f.request,plan}),observation={index:1,text:'...',confidence:.98,box:{x:35,y:8,w:19,h:7},contextBox:outer,color:'#8AA69C'};
 const text=issueSceneGlyphRecovery({plan,sourceFile:f.sourceFile,proposal:{index:1,text:null,confidence:0,box:outer,objectId:'dots'},observations:[[observation],[structuredClone(observation)]],budget:{used:0}});
 const tokens=[text,native],lines=sceneGlyphRecoveryLines(tokens);assert.equal(lines.length,1);
 await withSceneGlyphRecovery(tokens,()=>{
  const size={widthPt:60,heightPt:30},page={shapes:[],images:[],textBoxes:[{id:'text-dots',text:'...',box:lines[0].box,font:{family:'Arial',sizePt:9,color:'#8AA69C'},source:{evidenceBox:lines[0].box}}]};
  const compiled=compileSourceScene({page,plan,sourceFile:f.sourceFile,root:f.root,slideSize:size,pictorialMode:'source-crop'});
  assert.equal(compiled.evidence.missingGlyphRecovery.items.length,2);
  assert.ok(!compiled.evidence.unresolved.some(r=>r.id==='proposal-missingText-0'||r.id==='proposal-missingText-1'));
  assert.equal(compiled.page.textBoxes.length,1);
  sealSceneGlyphRecoveryDeck({slideSize:size,pages:[compiled.page]});assert.equal(verifySceneGlyphRecoveryPage(compiled.page,size),true);
  compiled.page.textBoxes.push({id:'duplicate',text:'✓',box:{x:8,y:9,w:15,h:12}});assert.equal(verifySceneGlyphRecoveryPage(compiled.page,size),false);
 });assert.throws(()=>sceneGlyphRecoveryLines(tokens),/Scene glyph recovery/);
});
test('batch errors are atomic, source-bound, capped and reject reused, copied or overlapping recovery capabilities',async t=>{
 const f=fixture(t),token=issueSceneGlyphRecovery(f.request);
 for(const tokens of[[],[token,token],[token,{}],new Array(33),new Array(1000001),new Proxy([token],{})])
  await assert.rejects(withSceneGlyphRecovery(tokens,()=>assert.fail('invalid batch executed')),/Scene glyph recovery/);
 assert.deepEqual(sceneGlyphRecoveryLines(token),[]);
 const clone=structuredClone(f.request);clone.proposal.index=1;clone.observations.forEach(rows=>rows[0].index=1);clone.plan.admission.rejections.push({collection:'missingText',index:1,reason:'glyph-source-unit'});
 await assert.rejects(withSceneGlyphRecovery([token,issueSceneGlyphRecovery(clone)],()=>{}),/Scene glyph recovery/);
 assert.deepEqual(sceneGlyphRecoveryLines(token),[]);
});
test('native glyph regression stays in the unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-glyph-native-icon.test.js'));
});
