'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {parseSurfacePaths}=require('../packages/slideclone-core/source-scene-surface-paths');
const {parsePrimitiveCandidate,constructPrimitiveCandidate}=require('../packages/slideclone-core/source-scene-primitive-candidate');
const {parseSceneNativeGeometry,expandSceneNativeGeometry,sceneNativeGeometrySchema}=require('../packages/slideclone-core/source-scene-native-geometry');
const {compileScenePrimitiveProgram}=require('../packages/slideclone-core/source-scene-primitive-program');
const {primitiveProgramPaths}=require('../packages/slideclone-core/source-scene-primitive-paths');
const {fitScenePrimitiveCandidate}=require('../packages/slideclone-core/source-scene-primitive-fit');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const line=(a,b)=>({filled:false,segments:[{type:'moveTo',points:[a]},{type:'lnTo',points:[b]}]});
const paths=[line({x:0,y:0},{x:.3,y:0}),line({x:.7,y:0},{x:1,y:0}),line({x:1,y:0},{x:1,y:1}),line({x:.6,y:0},{x:.6,y:1})];
const recipe={id:'unit',kind:'openPaths',box:{x:30,y:30,w:100,h:100},fill:'#FFFFFF',stroke:'#202020',strokeWidthPx:1,paths};
const frame={widthPx:200,heightPx:200,widthPt:200,heightPt:200};

test('transparent whole-program construction preserves every independent path and heading gap without closing or filling',()=>{
 const result=constructPrimitiveCandidate(recipe,frame);
 assert.equal(result.shapes.length,4);assert.equal(result.sourceAuthorized,false);assert.equal(result.portsAuthorized,false);
 assert.equal(result.labelsCompleted,false);
 for(const [i,s]of result.shapes.entries()){
  assert.equal(s.style.fill,'none');assert.deepEqual(s.style.freeformSegments,paths[i].segments);
  assert.equal(s.style.freeformSegments.some(p=>p.type==='close'),false);
  assert.notEqual(s.style.freeformSegments,paths[i].segments);
 }
 assert.deepEqual(recipe.paths,paths);
 assert.equal(primitiveProgramPaths(parsePrimitiveCandidate(recipe),{width:200,height:200}).withinSurface,false);
 const parsed=parseSceneNativeGeometry(expandSceneNativeGeometry([6,null,null,null,null,paths]));
 assert.equal(parsed.kind,'openPaths');assert.deepEqual(parsed.paths,paths);
 assert.equal(sceneNativeGeometrySchema().properties.kind.enum.includes('openPaths'),true);
 assert.throws(()=>parseSurfacePaths(paths),TypeError); // Existing surface mode still needs its actual exterior.
});

test('transparent geometry rejects filled faces, hidden closure, invalid points, excess capacity, getters and proxies',()=>{
 const closed={...paths[0],segments:[...paths[0].segments,{type:'close',points:[]}]};
 let reads=0;const getter={get filled(){reads++;throw Error('private');},segments:paths[0].segments};
 const proxy=new Proxy(paths[0],{get(){reads++;throw Error('private');}});
 const badPoint=line({x:0,y:0},{x:Infinity,y:1});
 const extraPoint=line({x:0,y:0},{x:1,y:1});extraPoint.segments[1].points.push({x:1,y:0});
 for(const value of [null,[],Array(17).fill(paths[0]),[{...paths[0],filled:true}],[closed],[badPoint],[extraPoint],[getter],[proxy],
  [{...paths[0],sourceAuthorized:true}]])assert.throws(()=>parseSurfacePaths(value,true),TypeError);
 assert.equal(reads,0);assert.throws(()=>parseSurfacePaths(paths,'open'),TypeError);
 const many=Array.from({length:16},()=>({...paths[0],segments:[paths[0].segments[0],...Array(4).fill(paths[0].segments[1])]}));
 assert.throws(()=>parseSurfacePaths(many,true),TypeError);
 assert.throws(()=>parsePrimitiveCandidate({...recipe,paths:[{...paths[0],filled:true}]}),TypeError);
 assert.throws(()=>fitScenePrimitiveCandidate({recipe,frame}),/representation is unsupported/u);
});

test('constructing transparent paths never falls through the closed-source verifier or spends source pixels',()=>{
 const image={width:200,height:200,rgba:Buffer.alloc(200*200*4,255)},budget={used:0};
 const result=compileScenePrimitiveProgram({image,budget,textMasks:[],slideSize:{widthPt:200,heightPt:200},
  object:{id:'unit',regionId:'owner',kind:'container',box:recipe.box,nativeGeometry:{kind:'openPaths',paths}}});
 assert.equal(result.failure,'open-program-source-evidence');assert.equal(result.constructed,4);
 assert.equal(result.shapes,undefined);assert.equal(result.portFrame,undefined);assert.equal(budget.used,0);
});

test('even one transparent path cannot borrow an independently closed body to complete its region',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'open-owner-reject-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:200,height:200,rgba:Buffer.alloc(200*200*4,255)};
 for(let y=30;y<130;y++)for(let x=30;x<130;x++)image.rgba.set([200,220,240,255],(y*200+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan=admitSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:200}},
  {id:'owner',parentId:'root',kind:'container',box:recipe.box,nativeGeometry:{kind:'openPaths',paths:[paths[0]]}}],
  objects:[],relations:[],programs:[{regionId:'root',objects:[],relations:[],labels:[]},{regionId:'owner',objects:[],relations:[],labels:[]}]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:200,heightPx:200,labelRefs:[]});
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:200,heightPt:200}});
 assert.equal(plan.regions[1].kind,'container');assert.equal(result.evidence.nativeProgram.admitted,0);
 assert.ok(result.evidence.unresolved.some(r=>r.id==='region-owner'&&r.detailCode==='open-program-source-evidence'));
 assert.ok(result.evidence.unresolved.some(r=>r.id==='region-owner'&&r.reason==='region-members-incomplete'));
 assert.equal(result.page.shapes.some(s=>s.source?.sceneRegionId==='region-owner'),false);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});

test('the real compiler admits a complete transparent region only with its full source census and final private seal',t=>{
 const {retainedOpenSceneOwnerTransaction}=require('../packages/slideclone-core/source-scene-open-owner-transaction');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'open-owner-complete-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4)};
 for(let i=0;i<64*64;i++)image.rgba.set([245,249,255,255],i*4);
 for(let x=8;x<56;x++)image.rgba.set([210,220,230,255],(8*64+x)*4);
 for(const cell of [30*64+25,30*64+26])image.rgba.set([210,215,220,255],cell*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan=admitSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'owner',parentId:null,kind:'container',box:{x:8,y:8,w:48,h:48},nativeGeometry:{kind:'openPaths',paths:[line({x:.5/48,y:.5/48},{x:47.5/48,y:.5/48})]}}],
  objects:[],relations:[],inventory:[['owner',0,0,0]],programs:[{regionId:'owner',objects:[],relations:[],labels:[]}]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:64,heightPx:64,labelRefs:[]});
 const input={page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:64,heightPt:64}};
 const result=compileSourceScene(input);
 assert.deepEqual(result.evidence.unresolved,[]);assert.equal(result.evidence.regionPrograms.completed,1);
 assert.equal(result.evidence.openOwners.counts[0].literal,2);assert.equal(result.evidence.openOwners.counts[0].unaccounted,0);
 assert.equal(retainedOpenSceneOwnerTransaction(result.openOwnerReceipt,result.page).completed,1);
 assert.equal(result.page.shapes.filter(s=>s.source?.nativeComponentRole==='unclassified-source-paint').length,1);
 const preflight=compileSourceScene({...input,preflight:true});
 assert.equal(preflight.openOwnerReceipt,undefined);assert.equal(preflight.evidence.nativeProgram.admitted,0);
});
