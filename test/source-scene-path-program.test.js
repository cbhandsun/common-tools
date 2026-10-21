"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {parseScenePathProgram,sourceRouteMatchesProgram,sourceRouteComponentIsComplete}=require('../packages/slideclone-core/source-scene-path-program');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const frame={widthPx:800,heightPx:600,coordinateSpace:'normalized-1000',owner:{x:0,y:0,w:800,h:600}};
const program=()=>({kind:'polyline',dash:'solid',vertices:[{x:100,y:100},{x:100,y:700},{x:800,y:700},{x:800,y:100}]});
function planProposal(){return {coordinateSpace:'normalized-1000',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:1000}}],
 objects:[{id:'a',regionId:'root',kind:'container',box:{x:50,y:50,w:100,h:100}},{id:'b',regionId:'root',kind:'container',box:{x:750,y:50,w:100,h:100}}],
 relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward',visiblePath:program()}]};}
test('the previously discarded complete path survives strict plan parsing in the source coordinate frame',()=>{
 const source={sourceHash:'a'.repeat(64),widthPx:800,heightPx:600};
 const parsed=parseSourceScenePlan(planProposal(),source);
 assert.deepEqual(parsed.relations[0].visiblePath.vertices,[{x:80,y:60},{x:80,y:420},{x:640,y:420},{x:640,y:60}]);
 assert.equal(parsed.relations.length,1);assert.equal(parsed.objects.length,2);
 const raw=planProposal();delete raw.relations[0].visiblePath;
 assert.equal(parseSourceScenePlan(raw,source).relations[0].visiblePath,undefined);
 const invalid=planProposal();invalid.relations[0].visiblePath.dash='dashed';
 assert.throws(()=>parseSourceScenePlan(invalid,source),/unsupported/);
 const admitted=admitSourceScenePlan(invalid,source);assert.equal(admitted.admission.complete,false);
 assert.equal(admitted.relations.length,0);assert.equal(admitted.objects.length,2);
 assert.equal(admitted.admission.rejections[0].collection,'relation');
});
test('path proposals snapshot normal inputs and reject empty, invalid, extreme, and unsupported programs',()=>{
 const raw=program(),parsed=parseScenePathProgram(raw,frame);raw.vertices[0].x=999;
 assert.equal(parsed.vertices[0].x,80);assert.equal(parseScenePathProgram(undefined,frame),undefined);
 for(const edit of [p=>p.kind='bezier',p=>p.dash='dashed',p=>p.vertices=[],p=>p.vertices=new Array(2),
  p=>p.vertices=Array(17).fill({x:100,y:100}),p=>p.vertices[0].x=NaN,p=>p.vertices[0].x=1001,
  p=>p.vertices[0].x=-1,p=>p.vertices[0].x=.1,p=>p.vertices[1]={...p.vertices[0]},p=>p.color='private-token']){
  const invalid=program();edit(invalid);assert.throws(()=>parseScenePathProgram(invalid,frame),TypeError);
 }
 assert.throws(()=>parseScenePathProgram(program(),{...frame,shaftBox:{x:0,y:0,w:100,h:100}}),/scope/);
 assert.throws(()=>parseScenePathProgram(program(),{...frame,owner:{x:100,y:100,w:300,h:300}}),/scope/);
 assert.throws(()=>parseScenePathProgram(program(),{...frame,widthPx:16385}),/frame/);
 assert.throws(()=>parseScenePathProgram(program(),{...frame,coordinateSpace:'pixels'}),/frame/);
});
test('untrusted path records and arrays never execute getters or Proxy traps',()=>{
 let reads=0;const hostile={};Object.defineProperty(hostile,'x',{get(){reads++;throw Error('private-token');},enumerable:true});
 const traps={get(){reads++;throw Error('private-token');},getPrototypeOf(){reads++;throw Error('private-token');},ownKeys(){reads++;throw Error('private-token');}};
 for(const value of [new Proxy(program(),traps),{...program(),vertices:new Proxy([],traps)},
  {...program(),vertices:[hostile,{x:100,y:100}]},Object.assign(Object.create({secret:true}),program())])
  assert.throws(()=>parseScenePathProgram(value,frame),e=>!e.message.includes('private-token'));
 assert.equal(reads,0);
});
test('compact-v6 preserves explicit complete programs, legacy null paths, and independent rejection without increasing slots',()=>{
 const source={sourceHash:'b'.repeat(64),widthPx:800,heightPx:600};
 const compact={format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[['root',null,'section',[0,0,1000,1000]]],inventory:[['root',2,0,1]],
  objects:[['a','root','container',[50,50,150,150],'absent'],['b','root','container',[50,750,150,850],'absent']],
  relations:[['ab','root','a','b','forward',[90,90,710,810],[[100,100],[100,700],[800,700],[800,100]]]]};
 const parsed=parseSourceScenePlan(compact,source);
 assert.deepEqual(parsed.relations[0].visiblePath,parseSourceScenePlan(planProposal(),source).relations[0].visiblePath);
 assert.equal(parsed.objects.length,2);assert.equal(parsed.relations.length,1);
 const legacy=structuredClone(compact);legacy.relations[0][6]=null;
 assert.equal(parseSourceScenePlan(legacy,source).relations[0].visiblePath,undefined);
 for(const mutate of [r=>r.relations[0][6]=[],r=>r.relations[0][6]=new Array(2),r=>r.relations[0][6]=new Proxy([],{get(){throw Error('private');}}),
  r=>r.relations[0][6][0]=[100,100,100],r=>r.relations[0].pop(),r=>r.relations=Array(25).fill(r.relations[0])]){
  const raw=structuredClone(compact);mutate(raw);assert.throws(()=>parseSourceScenePlan(raw,source),e=>!e.message.includes('private'));
 }
 const bad=structuredClone(compact);bad.relations[0][6][1]=[-1,700];
 const retained=admitSourceScenePlan(bad,source);assert.equal(retained.relations.length,0);assert.equal(retained.objects.length,2);
 assert.equal(retained.admission.complete,false);
});
test('the source route must cover the whole declared program and all work uses the existing geometry cap',()=>{
 const proposed={kind:'polyline',dash:'solid',vertices:[{x:5,y:5},{x:5,y:10},{x:10,y:10}]};
 const observed=[{x:5,y:5},{x:5,y:6},{x:5,y:7},{x:5,y:8},{x:5,y:9},{x:5,y:10},{x:6,y:10},{x:7,y:10},{x:8,y:10},{x:9,y:10},{x:10,y:10}];
 assert.equal(sourceRouteMatchesProgram(observed,proposed,{checks:0}),true);
 assert.equal(sourceRouteMatchesProgram([{x:5,y:5},{x:10,y:10}],proposed,{checks:0}),false);
 assert.equal(sourceRouteMatchesProgram(observed,{...proposed,vertices:[{x:0,y:0},{x:10,y:10}]},{checks:0}),false);
 assert.equal(sourceRouteMatchesProgram(observed,proposed,{checks:4000000}),false);
 const mask=new Uint8Array(20*20);for(const p of observed)mask[p.y*20+p.x]=1;
 assert.equal(sourceRouteComponentIsComplete(mask,20,20,observed,{checks:0}),true);
 for(let y=0;y<5;y++)mask[y*20+5]=1;
 assert.equal(sourceRouteComponentIsComplete(mask,20,20,observed,{checks:0}),false);
 assert.equal(sourceRouteComponentIsComplete(mask,20,20,observed,{checks:4000000}),false);
});
function completeRegions(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-path-program-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:520,height:180,rgba:Buffer.alloc(520*180*4,255)};
 const put=(x,y,c=[30,60,90])=>image.rgba.set([...c,255],(y*image.width+x)*4);
 const proposal={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:520,h:180}}],objects:[],relations:[]};
 for(const offset of [0,260]){
  const id=offset?'second':'first',a={x:20+offset,y:20,w:50,h:40},b={x:170+offset,y:20,w:50,h:40};
  proposal.regions.push({id,parentId:'root',kind:'diagram',box:{x:offset,y:0,w:240,h:180}});
  for(const [name,box]of [['a',a],['b',b]]){
   proposal.objects.push({id:id+name,regionId:id,kind:'container',box,pictorialContent:'absent'});
   for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)put(x,y,
    x<box.x+2||x>=box.x+box.w-2||y<box.y+2||y>=box.y+box.h-2?[15,15,15]:[210,230,245]);
  }
  for(let y=60;y<=130;y++)for(let d=-1;d<=1;d++){put(45+offset+d,y);put(195+offset+d,y);}
  for(let x=45+offset;x<=195+offset;x++)for(let d=-1;d<=1;d++)put(x,130+d);
  for(let y=60;y<=65;y++)for(let x=195+offset-(y-60);x<=195+offset+(y-60);x++)put(x,y);
  // Unrelated source mark on the original route window boundary. It is
  // never erased, cropped out, included in the route or used as evidence.
  put(36+offset,100,[20,20,20]);
  proposal.relations.push({id:id+'loop',regionId:id,fromId:id+'a',toId:id+'b',direction:'forward',shaftBox:{x:38+offset,y:59,w:165,h:76},
   visiblePath:{kind:'polyline',dash:'solid',vertices:[{x:45+offset,y:60},{x:45+offset,y:130},{x:195+offset,y:130},{x:195+offset,y:60}]}});
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const source={sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:image.width,heightPx:image.height};
 return {root,sourceFile,image,proposal,source,slideSize:{widthPt:520,heightPt:180},page:{shapes:[],images:[],textBoxes:[]}};
}
test('the real compiler consumes complete programs in two regions and emits complete editable routes under one source session',t=>{
 const input=completeRegions(t),plan=parseSourceScenePlan(input.proposal,input.source),before=Buffer.from(input.image.rgba);
 const plain=structuredClone(input.proposal);plain.relations.forEach(r=>delete r.visiblePath);
 const baseline=compileSourceScene({...input,plan:parseSourceScenePlan(plain,input.source)});
 // Independent perimeter marks no longer require provider geometry to avoid
 // a whole-window veto. Both paths still need complete measured source ink.
 assert.equal(baseline.evidence.sourceRoutes,2,JSON.stringify(baseline.evidence.sourceRouteRejected));
 const result=compileSourceScene({...input,plan});
 assert.equal(result.evidence.sourceRoutes,2,JSON.stringify(result.evidence));assert.equal(result.evidence.resolvedRelations,2);
 assert.equal(result.evidence.unresolved.length,0);
 for(const relation of plan.relations){
  const parts=result.page.shapes.filter(s=>s.source?.sceneRelationId===relation.id),lines=parts.filter(s=>s.type==='line');
  assert.ok(lines.length>=3);assert.ok(parts.length<=32);
  assert.ok(lines.every(s=>s.source.editable===true&&s.source.sceneRegionId===relation.regionId));
  assert.equal(lines[0].style.startAnchor.elementId,'scene-outline-'+relation.fromId);
  assert.equal(lines.at(-1).style.endAnchor.elementId,'scene-outline-'+relation.toId);
  assert.ok(lines.some(s=>s.box.y>=129));
 }
 assert.equal(result.page.images.length,0);assert.deepEqual(input.image.rgba,before);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 const capped=compileSourceScene({...input,plan,preflight:true});assert.ok(capped.compilationSession);
 assert.equal(compileSourceScene({...input,plan,compilationSession:capped.compilationSession}).evidence.sourceRoutes,2);
});
test('mismatched turns, clipped branches, text contact, wrong direction and blank source never authorize the proposed output',t=>{
 for(const mode of ['mismatch','clipped','text','direction','blank']){
  const f=completeRegions(t),raw=structuredClone(f.proposal),page=structuredClone(f.page);
  if(mode==='mismatch')raw.relations.forEach(r=>r.visiblePath.vertices[1].y=120);
  if(mode==='direction')raw.relations.forEach(r=>r.direction='backward');
  if(mode==='blank')f.image.rgba.fill(255);
  if(mode==='text')page.textBoxes=[{text:'Private glyphs',box:{x:110,y:126,w:20,h:10},source:{editable:true,evidenceBox:{x:110,y:126,w:20,h:10}}}];
  if(mode==='clipped')for(const offset of [0,260])for(let y=100;y<=136;y++)for(let x=119+offset;x<=121+offset;x++)f.image.rgba.set([30,60,90,255],(y*f.image.width+x)*4);
  writePng(f.sourceFile,f.image);f.source.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
  const result=compileSourceScene({...f,page,plan:parseSourceScenePlan(raw,f.source)});
  assert.equal(result.evidence.sourceRoutes,mode==='text'?1:0,mode);
  assert.ok(result.evidence.unresolved.some(r=>r.reason==='relation-source-evidence'),mode);
 }
});
