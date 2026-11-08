'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {readPng}=require('../packages/slideclone-core/png');
const {issueSceneGlyphRecovery,sceneGlyphRecoveryLines,withSceneGlyphRecovery,resolveSceneGlyphRecoveries,
 sealSceneGlyphRecoveryDeck,verifySceneGlyphRecoveryPage}=require('../packages/slideclone-core/scene-plan/source-glyph-recovery');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
function fixture(t){
 const temporary=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temporary,'scene-glyph-'));
 t.after(()=>{
  const absolute=path.resolve(root);assert.equal(path.dirname(absolute),temporary);assert.ok(path.basename(absolute).startsWith('scene-glyph-'));
  fs.rmSync(absolute,{recursive:true,force:true});
 });
 const sourceFile=path.join(root,'source.png');
 fs.copyFileSync(path.join(__dirname,'fixtures/source-dot-row/three-dot-source.png'),sourceFile);
 const image=readPng(sourceFile),outer={x:0,y:0,w:image.width,h:image.height};
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:image.width,heightPx:image.height,
  regions:[{id:'region-parent',kind:'section',parentId:null,box:{...outer}}],objects:[{id:'object-parent',regionId:'region-parent',kind:'container',box:{...outer},pictorialContent:'absent'}],relations:[],
  admission:{complete:false,rejections:[{collection:'missingText',index:0,reason:'glyph-source-unit'},{collection:'missingText',index:1,reason:'confidence'}]}};
 const proposal={index:0,text:null,confidence:0,box:{...outer},objectId:'object-parent',labelCandidate:true};
 const observation={index:0,text:'...',confidence:.98,box:{x:3,y:3,w:19,h:7},contextBox:outer,color:'#8AA69C'};
 const observations=[[observation],[structuredClone(observation)]],budget={used:0};
 const request={plan,sourceFile,proposal,observations,budget};
 const size={widthPt:52,heightPt:26};
 const page={shapes:[],images:[],textBoxes:[{id:'ocr-recovered',text:'...',box:{x:8,y:8,w:36,h:10},font:{family:'Arial',sizePt:9,color:'#8AA69C'},
  source:{evidenceBox:{x:8,y:8,w:36,h:10},confidence:.98}}]};
 return {root,image,request,plan,budget,size,page,sourceFile};
}
function resolve(f,overrides={}){
 return resolveSceneGlyphRecoveries({plan:f.plan,image:f.image,page:f.page,slideSize:f.size,budget:f.budget,preflight:false,...overrides});
}
function deck(f,report){
 f.page.source={sourceScene:{version:1,sourceHash:f.plan.sourceHash,unresolved:[],missingGlyphRecovery:report}};
 return {slideSize:f.size,pages:[f.page]};
}
test('independent source glyphs require real native output and a final per-run seal',async t=>{
 const f=fixture(t),before=structuredClone(f.plan),token=issueSceneGlyphRecovery(f.request),charged=f.budget.used;
 assert.ok(charged>0);assert.deepEqual(sceneGlyphRecoveryLines(token),[{text:'...',confidence:.98,box:{x:4,y:4,w:18,h:5}}]);
 await withSceneGlyphRecovery(token,()=>{
  assert.equal(resolve(f,{preflight:true}),null);
  const report=resolve(f);assert.equal(report.items[0].index,0);assert.ok(f.budget.used>charged);
  const d=deck(f,report);assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),false);
  sealSceneGlyphRecoveryDeck(d);assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),true);
  assert.ok(!auditNativeComponentQuality(d).findings.some(row=>row.code==='source-scene-glyph-recovery-unverified'));
  assert.throws(()=>sealSceneGlyphRecoveryDeck(d),/Scene glyph recovery/);
 });
 assert.deepEqual(f.plan,before);assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),false);
 assert.throws(()=>sceneGlyphRecoveryLines(token),/Scene glyph recovery/);
 await assert.rejects(withSceneGlyphRecovery(token,()=>{}),/Scene glyph recovery/);
});
test('normal compiler recovers only the measured proposal while preserving original admission and other failures',async t=>{
 const f=fixture(t),before=structuredClone(f.plan),token=issueSceneGlyphRecovery(f.request);
 const input={page:f.page,plan:f.plan,sourceFile:f.sourceFile,root:f.root,slideSize:f.size};
 const ordinary=compileSourceScene(input);
 assert.ok(ordinary.evidence.unresolved.some(row=>row.id==='proposal-missingText-0'));
 await withSceneGlyphRecovery(token,()=>{
  const preflight=compileSourceScene({...input,preflight:true});
  assert.ok(preflight.evidence.unresolved.some(row=>row.id==='proposal-missingText-0'));
  const compiled=compileSourceScene(input);
  assert.ok(!compiled.evidence.unresolved.some(row=>row.id==='proposal-missingText-0'));
  assert.ok(compiled.evidence.unresolved.some(row=>row.id==='proposal-missingText-1'&&row.reason==='confidence'));
  assert.equal(compiled.evidence.missingGlyphRecovery.items[0].textId,'ocr-recovered');
  assert.equal(compiled.evidence.admissionRecovery.unresolved,1);
  assert.equal(compiled.evidence.admissionRecovery.resolvedTexts,1);
  assert.equal(compiled.page.textBoxes.filter(row=>row.text==='...').length,1);
  sealSceneGlyphRecoveryDeck({slideSize:f.size,pages:[compiled.page]});
  assert.equal(verifySceneGlyphRecoveryPage(compiled.page,f.size),true);
 });
 assert.deepEqual(f.plan,before);
});
test('no context, JSON reports and forged tokens cannot grant recovery',async t=>{
 const f=fixture(t);assert.equal(resolve(f),null);assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),true);
 deck(f,{version:1,items:[]});assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),false);
 for(const value of[undefined,null,{},[],new Proxy({},{}),JSON.parse(JSON.stringify(issueSceneGlyphRecovery(f.request)))]){
  assert.throws(()=>sceneGlyphRecoveryLines(value),/Scene glyph recovery/);
  await assert.rejects(withSceneGlyphRecovery(value,()=>{}),/Scene glyph recovery/);
 }
 assert.ok(auditNativeComponentQuality({slideSize:f.size,pages:[f.page]}).findings.some(row=>row.code==='source-scene-glyph-recovery-unverified'));
});
test('invalid inputs reject before getters, proxies or unbounded collections execute',t=>{
 const f=fixture(t);let reads=0;
 const getter=Object.defineProperty({},'plan',{enumerable:true,get(){reads++;throw Error('secret');}});
 const proxy=new Proxy({}, {ownKeys(){reads++;throw Error('secret');}});
 for(const value of[undefined,null,{},getter,proxy,{...f.request,extra:true},{...f.request,budget:{used:-1}},
  {...f.request,budget:{used:NaN}},{...f.request,budget:{used:4000001}}, {...f.request,observations:new Array(1000001)},
  {...f.request,sourceFile:'relative.png'}, {...f.request,observations:[]}])assert.throws(()=>issueSceneGlyphRecovery(value),/Scene glyph recovery/);
 assert.equal(reads,0);
});
test('confidence, literal disagreement, source-unit rejection, crop bounds and original rejection remain hard gates',t=>{
 const f=fixture(t);
 for(const change of[{confidence:.89},{text:'..'},{text:null},{rejection:'source-unit'},{box:{x:25,y:12,w:9,h:9}},{index:1},{text:'x\u0000'}]){
  const request=structuredClone(f.request);Object.assign(request.observations[1][0],change);
  assert.throws(()=>issueSceneGlyphRecovery(request));
 }
 for(const change of[
  r=>{r.plan.admission.rejections=[];}, r=>{r.proposal.box.w--;},r=>{r.plan.objects.push(structuredClone(r.plan.objects[0]));},
  r=>{r.plan.sourceHash='0'.repeat(64);},r=>{r.plan.widthPx++;},r=>{r.proposal.objectId='unknown';}
 ]){const request=structuredClone(f.request);change(request);assert.throws(()=>issueSceneGlyphRecovery(request),/Scene glyph recovery/);}
 assert.throws(()=>issueSceneGlyphRecovery({...f.request,budget:{used:4000000}}),/budget/);
});

test('source-proven ellipsis spelling agreement survives normal compilation and final output sealing without removing history',async t=>{
 const f=fixture(t),before=structuredClone(f.plan);
 f.request.observations[1][0].text='…';f.page.textBoxes[0].text='…';
 const token=issueSceneGlyphRecovery(f.request);
 assert.deepEqual(sceneGlyphRecoveryLines(token),[{text:'…',confidence:.98,box:{x:4,y:4,w:18,h:5}}]);
 await withSceneGlyphRecovery(token,()=>{
  const compiled=compileSourceScene({page:f.page,plan:f.plan,sourceFile:f.sourceFile,root:f.root,slideSize:f.size});
  assert.ok(!compiled.evidence.unresolved.some(row=>row.id==='proposal-missingText-0'));
  assert.ok(compiled.evidence.unresolved.some(row=>row.id==='proposal-missingText-1'));
  assert.equal(compiled.evidence.missingGlyphRecovery.items[0].textId,'ocr-recovered');
  sealSceneGlyphRecoveryDeck({slideSize:f.size,pages:[compiled.page]});
  assert.equal(verifySceneGlyphRecoveryPage(compiled.page,f.size),true);
 });
 assert.deepEqual(f.plan,before);
});
test('source replacement, parent mutations and removed original failures cannot reuse issued evidence',async t=>{
 const f=fixture(t),request=structuredClone(f.request);
 fs.appendFileSync(f.sourceFile,Buffer.from([0]));assert.throws(()=>issueSceneGlyphRecovery(request),/Scene glyph recovery/);
 fs.copyFileSync(path.join(__dirname,'fixtures/source-dot-row/three-dot-source.png'),f.sourceFile);
 for(const change of[
  x=>{x.plan.objects[0].box.w--;}, x=>{x.plan.objects[0].kind='icon';},x=>{x.plan.admission.rejections=[];},
  x=>{x.plan.sourceHash='0'.repeat(64);},x=>{x.image={...x.image,rgba:Buffer.from(x.image.rgba)};x.image.rgba[0]^=1;}
 ]){
  const token=issueSceneGlyphRecovery(f.request),saved=structuredClone(f.plan),image=f.image;
  change(f);await withSceneGlyphRecovery(token,()=>assert.throws(()=>resolve(f),/Scene glyph recovery/));
  Object.assign(f.plan,saved);f.image=image;
 }
});
test('missing, duplicated, stale or overlapping labels cannot discharge source proof',async t=>{
 const f=fixture(t),original=structuredClone(f.page);
 for(const change of[
  p=>{p.textBoxes=[];},p=>{p.textBoxes.push(structuredClone(p.textBoxes[0]));},p=>{p.textBoxes[0].text='…';},
  p=>{delete p.textBoxes[0].source.evidenceBox;},p=>{p.textBoxes[0].source.evidenceBox.x++;},
  p=>{p.textBoxes.push({...structuredClone(p.textBoxes[0]),id:'other',text:'other'});}
 ]){
  f.page=structuredClone(original);change(f.page);
  await withSceneGlyphRecovery(issueSceneGlyphRecovery(f.request),()=>assert.equal(resolve(f),null));
 }
});
test('deletion, duplication, metadata downgrade and rendering edits invalidate a sealed output',async t=>{
 const f=fixture(t);
 await withSceneGlyphRecovery(issueSceneGlyphRecovery(f.request),()=>{
  const d=deck(f,resolve(f));sealSceneGlyphRecoveryDeck(d);const clean=structuredClone(f.page);
  for(const mutate of[
   p=>{p.textBoxes=[];},p=>{p.textBoxes.push(structuredClone(p.textBoxes[0]));},p=>{delete p.source.sourceScene.missingGlyphRecovery;},
   p=>{p.textBoxes[0].font.color='#FFFFFF';},p=>{p.textBoxes[0].text='... ';},p=>{p.textBoxes[0].box.x++;},
   p=>{p.source.sourceScene.missingGlyphRecovery.items[0].index=1;}
  ]){const page=structuredClone(clean);mutate(page);assert.equal(verifySceneGlyphRecoveryPage(page,f.size),false);}
  assert.equal(verifySceneGlyphRecoveryPage(clean,{...f.size,widthPt:53}),false);
  assert.equal(verifySceneGlyphRecoveryPage(new Proxy({}, {get(){throw Error('secret');}}),f.size),false);
 });
});
test('hidden labels and conflicting native runs cannot be sealed as visible recovered text',async t=>{
 for(const change of[
  text=>{text.font.opacity=0;},text=>{text.style={visibility:'hidden'};},text=>{text.style={opacity:0};},
  text=>{text.font.sizePt=0;},text=>{text.runs=[{text:'wrong'}];},text=>{text.positionedRuns=[];},
  text=>{text.runs=[{text:'...',font:{opacity:0}}];},text=>{text.positionedRuns=[{text:'...',box:{x:100,y:0,w:10,h:5}}];}
 ]){
  const f=fixture(t);
  await withSceneGlyphRecovery(issueSceneGlyphRecovery(f.request),()=>{
   const d=deck(f,resolve(f));change(f.page.textBoxes[0]);
   assert.throws(()=>sealSceneGlyphRecoveryDeck(d),/Scene glyph recovery/);
   assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),false);
  });
 }
});
test('expired tokens, nested scopes, escaped tasks and failures cannot keep a recovery alive',async t=>{
 const f=fixture(t),token=issueSceneGlyphRecovery(f.request),realNow=Date.now;
 try{Date.now=()=>realNow()+31*60*1000;assert.throws(()=>sceneGlyphRecoveryLines(token),/Scene glyph recovery/);}
 finally{Date.now=realNow;}
 let escaped;
 await withSceneGlyphRecovery(token,async()=>{
  const second=issueSceneGlyphRecovery(f.request);
  await assert.rejects(withSceneGlyphRecovery(second,()=>{}),/Scene glyph recovery/);
  deck(f,resolve(f));sealSceneGlyphRecoveryDeck({slideSize:f.size,pages:[f.page]});
  escaped=new Promise(resolveLater=>setImmediate(()=>resolveLater(verifySceneGlyphRecoveryPage(f.page,f.size))));
 });
 assert.equal(await escaped,false);
 const failed=issueSceneGlyphRecovery(f.request);
 await assert.rejects(withSceneGlyphRecovery(failed,()=>{throw Error('operation failed');}),/operation failed/);
 await assert.rejects(withSceneGlyphRecovery(failed,()=>{}),/Scene glyph recovery/);
});
test('concurrent jobs retain separate labels, seals and charged budgets',async t=>{
 const a=fixture(t),b=fixture(t);b.page.textBoxes[0].id='ocr-other';
 await Promise.all([a,b].map(async f=>withSceneGlyphRecovery(issueSceneGlyphRecovery(f.request),async()=>{
  const d=deck(f,resolve(f));await new Promise(resolveLater=>setImmediate(resolveLater));sealSceneGlyphRecoveryDeck(d);
  assert.equal(verifySceneGlyphRecoveryPage(f.page,f.size),true);
  assert.equal(verifySceneGlyphRecoveryPage(f===a?b.page:a.page,f.size),false);
  assert.ok(f.budget.used>0&&f.budget.used<4000000);
 })));
});
