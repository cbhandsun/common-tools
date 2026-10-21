"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
const {parseRegionPrograms,prepareRegionProgramLabels}=require('../packages/slideclone-core/source-scene-region-program');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {boundedOcrSourceDeck,expandPositionedMixedColorTextSegments}=require('../packages/slideclone-core/ocr-source-deck');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const dimensions={widthPx:100,heightPx:100},slideSize={widthPt:100,heightPt:100};
const box={x:20,y:20,w:40,h:10},ref=sourceLabelIdentity(box,dimensions);
function controls(){return {version:1,sourceHash:'a'.repeat(64),...dimensions,
 regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],objects:[],relations:[],
 regionPrograms:[{regionId:'region-root',objects:[],relations:[],labels:[{refs:[ref],family:'KaiTi',weight:'bold',sizePt:18}]}]};}
function label(){return {id:'label',text:'visible text',box:{...box},font:{family:'Arial',color:'#224466',sizePt:12},
 source:{editable:true,evidenceBox:{...box},ocrLabelBox:{...box},ocrLabelRef:ref},
 positionedRuns:[{text:'visible text',box:{...box},fontOverride:{family:'Arial'}}]};}

test('semantic roles reach typography through admitted source label bindings',()=>{
 const plan=controls();plan.regionPrograms[0].labels[0].role='body';
 const result=prepareRegionProgramLabels({textBoxes:[label()]},plan,slideSize).page.textBoxes[0];
 assert.equal(result.source.typographyRole,'body');assert.equal(result.source.typographyRoleEvidence,'scene-proposal');
 const raw=[{regionId:'root',objects:[],relations:[],labels:[{refs:[0],role:'script'}]}];
 assert.throws(()=>parseRegionPrograms(raw,{regions:[{id:'root'}],objects:[],relations:[]},[ref],v=>v),/role/u);
 const {expandCompactProgramScene}=require('../packages/slideclone-core/source-scene-compact-program');
 const expanded=expandCompactProgramScene({format:'compact-v8',regions:[],inventory:[],objects:[],relations:[],programs:[['root',[[[0],null,null,null,3]]]]});
 assert.equal(expanded.programs[0].labels[0].role,'body');
});

test('bound region typography remains independent from inferred outer-region styles',()=>{
 const {proposeParagraphTypography}=require('../packages/slideclone-core/paragraph-typography');
 const plan=controls();plan.regionPrograms[0].labels[0].role='body';
 const text=label();delete text.positionedRuns;text.source.sceneRegionId='outer';
 text.box={x:20,y:20,w:40,h:30};
 const bound=prepareRegionProgramLabels({textBoxes:[text]},plan,slideSize).page.textBoxes[0];
 const sibling={...structuredClone(text),id:'sibling',text:'outer',box:{x:20,y:60,w:40,h:10},
  font:{family:'Arial',sizePt:12},source:{sceneRegionId:'outer',evidenceBox:{x:20,y:60,w:40,h:10}}};
 const result=proposeParagraphTypography({slideSize,pages:[{textBoxes:[bound,sibling],shapes:[]}]});
 assert.equal(result.report.sharedStyles,2);
 assert.equal(result.deck.pages[0].textBoxes[0].font.family,'KaiTi');
 assert.equal(result.deck.pages[0].textBoxes[1].font.family,'Arial');
 assert.equal(result.deck.pages[0].textBoxes[0].source.sceneRegionId,'outer');
 assert.deepEqual(result.deck.pages[0].textBoxes[0].source.evidenceBox,box);
});

test('production OCR source frames survive scaled region binding and paragraph planning',()=>{
 const {proposeParagraphTypography}=require('../packages/slideclone-core/paragraph-typography');
 const secondBox={x:20,y:33,w:40,h:10};
 const deck=boundedOcrSourceDeck({metadata:{dimensions},sourceImage:'source.png',ocr:{lines:[
  {text:'第一行 Ω',confidence:.99,box},{text:'第二行 Ж',confidence:.99,box:secondBox}]}});
 const observed=deck.pages[0].textBoxes.map(t=>structuredClone(t.source.evidenceBox));
 const plan=controls();plan.regionPrograms[0].labels[0].role='body';
 plan.regionPrograms[0].labels[0].refs.push(sourceLabelIdentity(secondBox,dimensions));
 deck.pages[0].textBoxes[0].box.h*=2;
 deck.pages[0].textBoxes[1].box.x+=30;
 const bound=prepareRegionProgramLabels(deck.pages[0],plan,deck.slideSize);
 assert.equal(bound.evidence.prepared,1);
 const proposal=proposeParagraphTypography({...deck,pages:[bound.page]});
 assert.equal(proposal.report.mergedLines,1);assert.equal(proposal.report.sharedStyles,1);
 const paragraph=proposal.deck.pages[0].textBoxes[0];
 assert.equal(paragraph.text,'第一行 Ω\n第二行 Ж');assert.equal(paragraph.font.family,'KaiTi');
 assert.deepEqual(paragraph.source.typographyMembers.map(m=>m.source.evidenceBox),observed);
 assert.notEqual(observed[0].w,box.w);
});

test('regional typography reaches ordinary rich text runs while preserving content, color, geometry and source identity',()=>{
 const text=label();delete text.positionedRuns;
 text.runs=[{text:'visible ',font:{family:'Arial',sizePt:12,color:'#FF0000'},hyperlink:'https://example.com'},
  {text:'text',font:{family:'Arial',sizePt:12,color:'#008800'}}];
 const before=structuredClone(text),result=prepareRegionProgramLabels({textBoxes:[text]},controls(),slideSize);
 assert.equal(result.evidence.prepared,1);
 const changed=result.page.textBoxes[0];
 assert.deepEqual(changed.box,before.box);assert.equal(changed.text,before.text);assert.equal(changed.source.ocrLabelRef,ref);
 assert.equal(changed.runs.length,2);assert.equal(changed.runs[0].hyperlink,before.runs[0].hyperlink);
 for(let i=0;i<changed.runs.length;i++){
  assert.equal(changed.runs[i].text,before.runs[i].text);assert.equal(changed.runs[i].font.color,before.runs[i].font.color);
  assert.equal(changed.runs[i].font.family,'KaiTi');assert.equal(changed.runs[i].font.weight,'bold');assert.equal(changed.runs[i].font.sizePt,18);
 }
 assert.deepEqual(text,before);
 for(const runs of [[],[{text:'visible text'}]]){
  const input={...text,runs},output=prepareRegionProgramLabels({textBoxes:[input]},controls(),slideSize).page.textBoxes[0];
  assert.equal(output.runs.length,runs.length);if(runs.length)assert.equal(output.runs[0].font.family,'KaiTi');
 }
});

test('regional styles reach canonical positioned font overrides without adding unsupported run fields',()=>{
 const {validatePositionedTextLayout}=require('../packages/slideclone-core/positioned-text-layout');
 const text={...label(),wrap:false,style:{wrap:false,fit:'none',textWarp:'textPlain'}};
 text.positionedRuns[0].fontOverride={family:'Arial',latinFamily:'Calibri',weight:'regular'};
 const before=structuredClone(text);
 validatePositionedTextLayout(text);
 const changed=prepareRegionProgramLabels({textBoxes:[text]},controls(),slideSize).page.textBoxes[0];
 validatePositionedTextLayout(changed);
 assert.deepEqual(changed.positionedRuns[0].fontOverride,{family:'KaiTi',latinFamily:'KaiTi',eastAsianFamily:'KaiTi',complexScriptFamily:'KaiTi',weight:'bold'});
 assert.equal(changed.positionedRuns[0].font,undefined);
 assert.equal(changed.font.sizePt,18);assert.equal(changed.font.color,before.font.color);
 assert.deepEqual(changed.positionedRuns[0].box,before.positionedRuns[0].box);
 assert.equal(changed.positionedRuns[0].text,before.positionedRuns[0].text);
 assert.deepEqual(text,before);
 const noStyle=controls();noStyle.regionPrograms[0].labels[0]={refs:[ref]};
 assert.deepEqual(prepareRegionProgramLabels({textBoxes:[text]},noStyle,slideSize).page.textBoxes[0].positionedRuns[0].fontOverride,before.positionedRuns[0].fontOverride);
 const noOverrides=structuredClone(text);delete noOverrides.positionedRuns[0].fontOverride;
 validatePositionedTextLayout(prepareRegionProgramLabels({textBoxes:[noOverrides]},controls(),slideSize).page.textBoxes[0]);
});

test('regional positioned font overrides reject malformed and hostile values without executing accessors',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-positioned-font');};
 for(const fontOverride of [42,[],{family:'\u0000'},{weight:'bolder'},{sizePt:20},{color:'#FF0000'},
  new Proxy({},{get:trap,ownKeys:trap}),{get family(){return trap();}}]){
  const text=label();text.positionedRuns[0].fontOverride=fontOverride;
  assert.throws(()=>prepareRegionProgramLabels({textBoxes:[text]},controls(),slideSize),error=>error instanceof TypeError&&!error.message.includes('private-positioned-font'));
 }
 assert.equal(calls,0);
});

test('ordinary rich text run boundaries reject sparse, oversized and hostile inputs without executing them',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-token');};
 for(const runs of [null,new Array(1),Array(513).fill({text:'x'}),new Proxy([],{get:trap,ownKeys:trap}),
  [{get font(){return trap();}}],[{font:new Proxy({},{get:trap,ownKeys:trap})}]]){
  assert.throws(()=>prepareRegionProgramLabels({textBoxes:[{...label(),runs}]},controls(),slideSize),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 }
 const text={...label(),runs:[{text:'original',font:{family:'Arial'}}]},missing=controls();missing.regionPrograms[0].labels[0].refs=['label-'+'b'.repeat(24)];
 assert.deepEqual(prepareRegionProgramLabels({textBoxes:[text]},missing,slideSize).page.textBoxes[0],text);
 assert.equal(calls,0);
});
test('source label identity follows source geometry across OCR filtering and native layout',()=>{
 const ocr={lines:[{text:'graphic',confidence:.95,box:{x:1,y:1,w:10,h:10}},{text:'kept',confidence:.99,box}]};
 const make=ocr=>boundedOcrSourceDeck({metadata:{dimensions},sourceImage:'source.png',ocr});
 const before=make(ocr),after=make({lines:[ocr.lines[1]]});
 assert.notEqual(before.pages[0].textBoxes[1].id,after.pages[0].textBoxes[0].id);
 assert.equal(before.pages[0].textBoxes[1].source.ocrLabelRef,after.pages[0].textBoxes[0].source.ocrLabelRef);
 const shifted=label();shifted.box={x:80,y:90,w:5,h:5};
 const result=prepareRegionProgramLabels({textBoxes:[shifted]},controls(),slideSize);
 assert.equal(result.evidence.prepared,1);assert.equal(result.page.textBoxes[0].font.family,'KaiTi');
 assert.deepEqual(result.page.textBoxes[0].box,shifted.box);assert.equal(result.page.textBoxes[0].text,shifted.text);
 assert.equal(result.page.textBoxes[0].font.color,'#224466');
 assert.equal(result.page.textBoxes[0].positionedRuns[0].fontOverride.family,'KaiTi');
 assert.equal(shifted.font.family,'Arial');
});
test('wire indices bind before graphic filtering; a changed source rectangle cannot borrow the old identity',()=>{
 const raw={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],objects:[],relations:[],
 programs:[{regionId:'root',objects:[],relations:[],labels:[{refs:[1],family:'KaiTi'}]}]};
 const plan=parseSourceScenePlan(raw,{...dimensions,sourceHash:'a'.repeat(64),labelRefs:[sourceLabelIdentity({x:1,y:1,w:10,h:10},dimensions),ref]});
 assert.deepEqual(plan.regionPrograms[0].labels[0].refs,[ref]);
 const changed=label();changed.source.evidenceBox.x++;
 const result=prepareRegionProgramLabels({textBoxes:[changed]},plan,slideSize);
 assert.equal(result.evidence.prepared,0);assert.equal(result.evidence.rejected[0].reason,'source-label-binding');
 assert.equal(result.page.textBoxes[0].font.family,'Arial');
});
test('legitimate complete mixed-color partitions keep the full label reference and every source ink rectangle',()=>{
 const original=label();original.source.positionedMixedColorTextSegments=[
  {text:'visible',box:{x:20,y:20,w:18,h:10},color:'#FF0000',startIndex:0,endIndex:7},
  {text:'text',box:{x:40,y:20,w:20,h:10},color:'#008800',startIndex:8,endIndex:12}];
 const segments=expandPositionedMixedColorTextSegments([original]),before=structuredClone(segments);
 const result=prepareRegionProgramLabels({textBoxes:segments},controls(),slideSize);
 assert.equal(result.evidence.prepared,1);
 for(let i=0;i<segments.length;i++){
  assert.equal(result.page.textBoxes[i].source.ocrLabelRef,ref);
  assert.deepEqual(result.page.textBoxes[i].source.evidenceBox,before[i].source.evidenceBox);
  assert.deepEqual(result.page.textBoxes[i].source.ocrLabelBox,box);
  assert.equal(result.page.textBoxes[i].font.color,before[i].font.color);
  assert.equal(result.page.textBoxes[i].font.family,'KaiTi');assert.equal(result.page.textBoxes[i].text,before[i].text);
 }
 for(const mutate of [rows=>rows.pop(),rows=>rows[1].source.mixedColorTextSegment=1,rows=>rows[1].source.segmentStartIndex=2,
  rows=>rows[1].source.segmentedOcrLineId='another',rows=>rows[1].source.evidenceBox.x=99]){
  const broken=structuredClone(segments);mutate(broken);assert.equal(prepareRegionProgramLabels({textBoxes:broken},controls(),slideSize).evidence.prepared,0);
 }
});

test('segmented OCR output edits cannot mutate original evidence frames',()=>{
 const original=label();original.source.positionedMixedColorTextSegments=[
  {text:'visible',box:{x:20,y:20,w:18,h:10},color:'#FF0000',startIndex:0,endIndex:7},
  {text:'text',box:{x:40,y:20,w:20,h:10},color:'#008800',startIndex:8,endIndex:12}];
 const segments=expandPositionedMixedColorTextSegments([original]);
 const snapshot=structuredClone(original);
 const observed=segments.map(t=>structuredClone(t.source.evidenceBox));
 for(const text of segments){assert.notEqual(text.box,text.source.evidenceBox);text.box.x+=2;text.box.h*=2;}
 assert.deepEqual(segments.map(t=>t.source.evidenceBox),observed);
 assert.deepEqual(original,snapshot);
 assert.equal(prepareRegionProgramLabels({textBoxes:segments},controls(),slideSize).evidence.prepared,1);
});
test('missing labels, duplicate OCR rectangles and cross-region ownership reject the whole program',()=>{
 for(const texts of [[],[label(),label()],[{...label(),source:{...label().source,ocrLabelRef:'label-'+'b'.repeat(24)}}]]){
  const result=prepareRegionProgramLabels({textBoxes:texts},controls(),slideSize);assert.equal(result.evidence.prepared,0);
 }
 const plan=controls();plan.regions[0].box={x:0,y:0,w:10,h:10};
 assert.equal(prepareRegionProgramLabels({textBoxes:[label()]},plan,slideSize).evidence.prepared,0);
 assert.equal(prepareRegionProgramLabels({textBoxes:[]},{...controls(),regionPrograms:[]},slideSize).evidence.prepared,0);
});
test('program parsing retains the existing inventories and refuses omission, surplus, ambiguity and invalid style boundaries',()=>{
 const plan={regions:[{id:'root'}],objects:[{id:'node',regionId:'root'}],relations:[{id:'edge',regionId:'root'}]};
 const raw=[{regionId:'root',objects:['node'],relations:['edge'],labels:[{refs:[0],family:'Arial'}]}],scope=v=>v;
 assert.equal(parseRegionPrograms(raw,plan,[ref],scope)[0].objects.length,1);
 for(const mutate of [p=>p[0].objects=[],p=>p[0].relations=[],p=>p[0].objects.push('other'),p=>p[0].labels[0].refs.push(0),
  p=>p[0].labels[0].family='generated-font',p=>p[0].labels[0].sizePt=Infinity,p=>p[0].labels[0].sizePt=4001,
  p=>p[0].labels[0].weight='900',p=>p[0].labels[0].refs=[],p=>p[0].labels[0].refs=[1],p=>p[0].colors='secret']){
  const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>parseRegionPrograms(invalid,plan,[ref],scope),TypeError);
 }
 assert.throws(()=>parseRegionPrograms(Array(25).fill(raw[0]),plan,[ref],scope),TypeError);
 assert.throws(()=>parseRegionPrograms(raw,plan,Array(513).fill(ref),scope),TypeError);
 assert.throws(()=>parseRegionPrograms(raw,plan,[ref,ref],scope),/ambiguous/);
 assert.throws(()=>parseRegionPrograms([{...raw[0],objects:Array(65).fill('node')}],plan,[ref],scope),TypeError);
 assert.throws(()=>parseRegionPrograms([{...raw[0],relations:Array(25).fill('edge')}],plan,[ref],scope),TypeError);
});
test('untrusted references, nested frames and coercion hooks never execute getters or Proxy traps',()=>{
 let calls=0;const getter={get x(){calls++;throw Error('private-token');}},coercion={valueOf(){calls++;throw Error('private-token');}};
 const hostile=new Proxy({}, {get(){calls++;throw Error('private-token');},ownKeys(){calls++;throw Error('private-token');}});
 for(const bad of [getter,hostile,{...box,w:coercion}])assert.throws(()=>sourceLabelIdentity(bad,dimensions),e=>!e.message.includes('private-token'));
 for(const bad of [getter,hostile,{...box,w:coercion}]){
  const text=label();text.source.evidenceBox=bad;
  assert.equal(prepareRegionProgramLabels({textBoxes:[text]},controls(),slideSize).evidence.prepared,0);
 }
 for(const mutate of [p=>p.regionPrograms=hostile,p=>p.regions=hostile,p=>p.regionPrograms[0].labels=[hostile],p=>p.widthPx=Infinity]){
  const plan=controls();mutate(plan);assert.throws(()=>prepareRegionProgramLabels({textBoxes:[label()]},plan,slideSize),e=>!e.message.includes('private-token'));
 }
 assert.equal(calls,0);
});
test('one broken program retains explicit failure and independent units without accepting omitted dependencies',()=>{
 const raw={coordinateSpace:'source-pixels',regions:[{id:'a',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
  {id:'b',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
 objects:[{id:'first',regionId:'a',kind:'container',box},{id:'second',regionId:'b',kind:'container',box}],relations:[],
 programs:[{regionId:'a',objects:['first'],relations:[],labels:[{refs:[0]}]},
  {regionId:'b',objects:[],relations:[],labels:[]}]};
 const source={...dimensions,sourceHash:'a'.repeat(64),labelRefs:[ref]};
 assert.throws(()=>parseSourceScenePlan(raw,source),/incomplete/);
 const admitted=admitSourceScenePlan(raw,source);assert.equal(admitted.objects.length,2);assert.equal(admitted.regionPrograms.length,1);
 assert.equal(admitted.admission.complete,false);assert.deepEqual(admitted.admission.rejections,[{collection:'program',index:1,reason:'program-contract',detailCode:'program-inventory-incomplete'}]);
 raw.programs[1]={regionId:'b',objects:['second'],relations:[],labels:[{refs:[0]}]};
 assert.equal(admitSourceScenePlan(raw,source).regionPrograms.length,1);
 raw.programs=new Proxy([],{get(){throw Error('private');}});assert.throws(()=>admitSourceScenePlan(raw,source),e=>!e.message.includes('private'));
});
test('program admission reports fixed contract categories without accepting failed programs or logging their content',()=>{
 const source={...dimensions,sourceHash:'a'.repeat(64),labelRefs:[ref],labelBoxes:[box]};
 const fixture=()=>({coordinateSpace:'source-pixels',
  regions:[{id:'a',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
   {id:'b',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'first',regionId:'a',kind:'container',box}],relations:[],
  programs:[{regionId:'a',objects:['first'],relations:[],labels:[{refs:[0]}]},
   {regionId:'b',objects:[],relations:[],labels:[]}]});
 const variants=[
  ['program-shape',p=>{p.privateToken='private-token';}],
  ['program-owner',p=>{p.regionId='missing';}],
  ['program-member',p=>{p.objects=['missing'];}],
  ['program-inventory-incomplete',p=>{p.objects=[];}],
  ['program-collection',p=>{p.labels=Array(33).fill({refs:[0]});}],
  ['program-label-style',p=>{p.labels[0].privateToken='private-token';}],
  ['program-label-reference',p=>{p.labels[0].refs=[512];}],
  ['program-label-reference',p=>{p.labels[0].refs=['private-token'];}],
  ['program-label-reference',p=>{p.labels[0].refs=[-1];}],
  ['program-label-reference',p=>{p.labels[0].refs=[Infinity];}],
  ['program-label-ambiguous',p=>{p.labels[0].refs=[0,0];}],
  ['program-label-empty',p=>{p.labels[0].refs=[];}],
  ['program-native-family',p=>{p.labels[0].family='private-token';}],
  ['program-native-weight',p=>{p.labels[0].weight='private-token';}],
  ['program-native-size',p=>{p.labels[0].sizePt=4001;}],
  ['program-typography-role',p=>{p.labels[0].role='private-token';}]
 ];
 for(const [code,mutate]of variants){
  const raw=fixture();mutate(raw.programs[0]);const before=structuredClone(raw);
  assert.throws(()=>parseSourceScenePlan(raw,source),TypeError);
  const admitted=admitSourceScenePlan(raw,source);
  assert.deepEqual(admitted.admission.rejections,[{collection:'program',index:0,reason:'program-contract',detailCode:code}]);
  assert.equal(admitted.admission.complete,false);assert.equal(admitted.objects.length,1);
  assert.deepEqual(admitted.regionPrograms.map(p=>p.regionId),['region-b']);
  assert.ok(!JSON.stringify(admitted.admission).includes('private-token'));assert.deepEqual(raw,before);
 }
 const normal=admitSourceScenePlan(fixture(),source);assert.equal(normal.admission.complete,true);assert.equal(normal.regionPrograms.length,2);
 const empty=fixture();empty.programs=[];assert.equal(admitSourceScenePlan(empty,source).admission.complete,true);
 const boundary=fixture();boundary.programs[0].labels[0].sizePt=4000;
 assert.equal(admitSourceScenePlan(boundary,source).admission.complete,true);
});

test('program rejection diagnostics do not invoke untrusted accessors or suppress unexpected errors',()=>{
 let reads=0;const trap=()=>{reads++;throw Error('private-token');};
 const raw={coordinateSpace:'source-pixels',regions:[{id:'a',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[],relations:[],programs:[{regionId:'a',objects:[],relations:[],labels:[]}]};
 const source={...dimensions,sourceHash:'a'.repeat(64),labelRefs:[ref]};
 for(const hostile of [new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap}),Object.defineProperty({},'labels',{get:trap})]){
  raw.programs=[hostile];const admitted=admitSourceScenePlan(raw,source);
  assert.deepEqual(admitted.admission.rejections,[{collection:'program',index:0,reason:'program-contract',detailCode:'program-shape'}]);
  assert.ok(!JSON.stringify(admitted.admission).includes('private-token'));
 }
 assert.equal(reads,0);
 raw.programs=[{regionId:'a',objects:[],relations:[],labels:[]}];
 const failure=new Error('unexpected internal failure');Object.defineProperty(source,'labelRefs',{get(){throw failure;}});
 assert.throws(()=>admitSourceScenePlan(raw,source),error=>error===failure);
 const suites=require('../scripts/test-suites');assert.equal(suites.includesSuite(__filename,'unit'),true);
});

function compilerFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-region-program-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:520,height:180,rgba:Buffer.alloc(520*180*4,255)},put=(x,y,c)=>image.rgba.set([...c,255],(y*520+x)*4);
 const plan={version:1,sourceHash:'',widthPx:520,heightPx:180,regions:[],objects:[],relations:[],regionPrograms:[]},textBoxes=[];
 for(const offset of [0,260]){
  const regionId=offset?'second':'first',b={x:30+offset,y:28,w:20,h:10};
  plan.regions.push({id:regionId,parentId:null,kind:'diagram',box:{x:offset,y:0,w:250,h:180}});
  for(const [suffix,x]of [['a',20+offset],['b',170+offset]]){
   plan.objects.push({id:regionId+suffix,regionId,kind:'container',pictorialContent:'absent',box:{x,y:20,w:50,h:40}});
   for(let py=20;py<60;py++)for(let px=x;px<x+50;px++)put(px,py,px<x+2||px>=x+48||py<22||py>=58?[15,15,15]:[210,230,245]);
  }
  for(let x=70+offset;x<=168+offset;x++)for(let dy=-1;dy<=1;dy++)put(x,40+dy,[30,60,90]);
  for(let x=163+offset;x<=168+offset;x++)for(let dy=-(168+offset-x);dy<=168+offset-x;dy++)put(x,40+dy,[30,60,90]);
  plan.relations.push({id:regionId+'edge',regionId,fromId:regionId+'a',toId:regionId+'b',direction:'forward'});
  const text={id:regionId+'label',text:'label',box:{...b},font:{family:'Arial',sizePt:12,color:'#111111'},
   source:{editable:true,evidenceBox:{...b},ocrLabelBox:{...b},ocrLabelRef:sourceLabelIdentity(b,plan)}};
  textBoxes.push(text);plan.regionPrograms.push({regionId,objects:[regionId+'a',regionId+'b'],relations:[regionId+'edge'],labels:[{refs:[text.source.ocrLabelRef],family:'KaiTi',weight:'bold'}]});
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 return {root,image,sourceFile,plan,slideSize:{widthPt:520,heightPt:180},page:{shapes:[],images:[],textBoxes}};
}
test('the real compiler commits two complete regions after actual native nodes and relations succeed under the same source budget',t=>{
 const input=compilerFixture(t),baseline=compileSourceScene({...input,plan:{...input.plan,regionPrograms:undefined}}),result=compileSourceScene(input);
 assert.equal(result.evidence.regionPrograms.completed,2,JSON.stringify(result.evidence));
 assert.equal(result.evidence.unresolved.length,0);assert.equal(result.evidence.resolvedRelations,2);
 assert.equal(result.evidence.sourceScanPixels,baseline.evidence.sourceScanPixels);
 assert.deepEqual(result.page.shapes,baseline.page.shapes);assert.deepEqual(result.page.images,baseline.page.images);
 for(const text of result.page.textBoxes){assert.equal(text.font.family,'KaiTi');assert.equal(text.font.weight,'bold');assert.equal(text.source.sceneRegionProgramId,text.source.sceneRegionId);}
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 const preflight=compileSourceScene({...input,preflight:true});assert.equal(preflight.evidence.regionPrograms.completed,0);
 assert.ok(preflight.page.textBoxes.every(t=>t.font.family==='Arial'));
});
test('input objects and forged success metadata cannot close failed native dependencies or clear prior unresolved findings',t=>{
 const input=compilerFixture(t);input.image.rgba.fill(255);writePng(input.sourceFile,input.image);
 input.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(input.sourceFile)).digest('hex');
 input.page.shapes=input.plan.objects.map(o=>({id:'scene-container-'+o.id,type:'rect',box:o.box,source:{editable:true,sceneInventoryId:o.id,detector:'source-scene-container'}}));
 const result=compileSourceScene(input);
 assert.equal(result.evidence.regionPrograms.completed,0);assert.equal(result.evidence.regionPrograms.rejected.length,2);
 assert.ok(result.evidence.unresolved.some(r=>r.reason==='container-perimeter'));assert.ok(result.evidence.unresolved.some(r=>r.reason==='region-members-incomplete'));
 assert.ok(result.page.textBoxes.every(t=>t.font.family==='Arial'));
 const wrong={...input,plan:{...input.plan,sourceHash:'b'.repeat(64)}};
 assert.throws(()=>compileSourceScene(wrong),/source binding/);
});
