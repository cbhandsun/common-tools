"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {sourceSceneTextBoxes}=require('../packages/slideclone-core/scene-plan/source-scene-text-frame');

test('source frames preserve original evidence, keep legacy controls, and never mutate output typography',()=>{
 const image={width:400,height:300},size={widthPt:200,heightPt:150};
 const text={text:'Text',box:{x:80,y:40,w:35,h:12},font:{color:'#ff0000'},rotation:20,
  source:{evidenceBox:{x:20,y:20,w:40,h:15},ocrPolygonPt:[[20,20],[60,20],[60,35],[20,35]]}};
 const before=structuredClone(text),result=sourceSceneTextBoxes([text],image,size);
 assert.deepEqual(result[0].box,text.source.evidenceBox);assert.deepEqual(text,before);
 assert.equal(result[0].rotation,20);assert.deepEqual(result[0].font,text.font);
 assert.notEqual(result[0].box,text.source.evidenceBox);
 const legacy={text:'Legacy',box:{x:0,y:0,w:200,h:150}};
 assert.deepEqual(sourceSceneTextBoxes([legacy],image,size),[legacy]);
 assert.deepEqual(sourceSceneTextBoxes([],image,size),[]);
});

test('invalid source frames cannot fall back to a convenient native box or execute getters',()=>{
 const image={width:400,height:300},size={widthPt:200,heightPt:150};
 const text={text:'Text',box:{x:10,y:10,w:30,h:15},source:{evidenceBox:{x:20,y:20,w:40,h:15}}};
 for(const evidence of [null,{}, {x:-1,y:0,w:10,h:10},{x:0,y:0,w:201,h:10},{x:0,y:0,w:10,h:Infinity}])
  assert.throws(()=>sourceSceneTextBoxes([{...text,source:{evidenceBox:evidence}}],image,size),TypeError);
 const stale={...text,source:{...text.source,ocrPolygonPt:[[20,20],[59,20],[60,35],[20,35]]}};
 // A skewed but matching envelope is legal; an altered envelope is stale.
 assert.doesNotThrow(()=>sourceSceneTextBoxes([stale],image,size));
 stale.source.ocrPolygonPt[2][0]=59;
 assert.throws(()=>sourceSceneTextBoxes([stale],image,size),/stale/);
 let calls=0;const accessor={...text};Object.defineProperty(accessor,'box',{get(){calls++;throw Error('must not execute');}});
 for(const bad of [[accessor],[new Proxy(text,{get(){calls++;throw Error('must not execute');}})],new Proxy([text],{}),Array(1),Array(10001).fill(text)])
  assert.throws(()=>sourceSceneTextBoxes(bad,image,size),TypeError);
 assert.equal(calls,0);
 for(const badSize of [{widthPt:0,heightPt:150},{widthPt:200,heightPt:NaN}])
  assert.throws(()=>sourceSceneTextBoxes([text],image,badSize),TypeError);
 assert.throws(()=>sourceSceneTextBoxes([text],{width:16385,height:300},size),TypeError);
});

test('native text fitting cannot change source icon admission when OCR evidence is unchanged',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-frame-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=50;y<200;y++)for(let x=80;x<280;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 for(let y=95;y<115;y++)for(let x=130;x<150;x++)if(x<135||x>=145||y<100||y>=110)image.rgba.set([30,60,90,255],(y*400+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:400,heightPx:300,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
  objects:[{id:'icon',kind:'icon',regionId:'region',box:{x:128,y:93,w:24,h:24},nativePictorial:true}],relations:[]};
 const text={id:'label',text:'Label',box:{x:100,y:65,w:80,h:20},source:{evidenceBox:{x:100,y:65,w:80,h:20}}};
 const input={sourceFile,root,plan,slideSize:{widthPt:400,heightPt:300},preflight:true,page:{shapes:[],images:[],textBoxes:[text]}};
 const original=compileSourceScene(input);
 assert.equal(original.evidence.icons,1);assert.ok(original.page.shapes.length);
 const fitted={...text,box:{x:125,y:90,w:40,h:30}},fittedBefore=structuredClone(fitted);
 const next=compileSourceScene({...input,page:{...input.page,textBoxes:[fitted]}});
 assert.equal(next.evidence.icons,1);
 assert.deepEqual(next.page.shapes,original.page.shapes);
 assert.deepEqual(next.evidence.unresolved,original.evidence.unresolved);
 assert.equal(next.evidence.sourceScanPixels,original.evidence.sourceScanPixels);
 assert.deepEqual(fitted,fittedBefore);assert.deepEqual(next.page.textBoxes[0].box,fitted.box);
 // A real source-evidence change is still a collision, even with a clear native box.
 const movedSource={...text,source:{evidenceBox:{x:130,y:95,w:20,h:20}}};
 assert.equal(compileSourceScene({...input,page:{...input.page,textBoxes:[movedSource]}}).evidence.icons,0);
});

test('source region identity follows OCR evidence when final typography moves across regions',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-region-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:180,height:120,rgba:Buffer.alloc(180*120*4,255)};
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:180,heightPx:120,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:120}},
   {id:'left',parentId:'root',kind:'section',box:{x:0,y:0,w:90,h:120}},
   {id:'right',parentId:'root',kind:'section',box:{x:90,y:0,w:90,h:120}}],objects:[],relations:[]};
 const source={evidenceBox:{x:20,y:20,w:30,h:12},ocrPolygonPt:[[20,20],[50,20],[50,32],[20,32]]};
 const text={id:'label',text:'Label',box:{...source.evidenceBox},source};
 const input={sourceFile,root,plan,slideSize:{widthPt:180,heightPt:120},preflight:true,page:{shapes:[],images:[],textBoxes:[text]}};
 const original=compileSourceScene(input);assert.equal(original.page.textBoxes[0].source.sceneRegionId,'left');
 for(const box of [{x:75,y:20,w:30,h:12},{x:110,y:20,w:30,h:12}]){
  const fitted={...text,box},before=structuredClone(fitted);
  const next=compileSourceScene({...input,page:{...input.page,textBoxes:[fitted]}});
  assert.equal(next.page.textBoxes[0].source.sceneRegionId,'left');
  assert.deepEqual(next.page.textBoxes[0].box,box);assert.deepEqual(fitted,before);
  assert.deepEqual(next.page.shapes,original.page.shapes);assert.deepEqual(next.page.images,original.page.images);
  assert.equal(next.evidence.sourceScanPixels,original.evidence.sourceScanPixels);
 }
 const realSource={evidenceBox:{x:110,y:20,w:30,h:12},ocrPolygonPt:[[110,20],[140,20],[140,32],[110,32]]};
 assert.equal(compileSourceScene({...input,page:{...input.page,textBoxes:[{...text,source:realSource}]}}).page.textBoxes[0].source.sceneRegionId,'right');
 const legacy={id:'legacy',text:'Label',box:{x:110,y:20,w:30,h:12}};
 assert.equal(compileSourceScene({...input,page:{...input.page,textBoxes:[legacy]}}).page.textBoxes[0].source.sceneRegionId,'right');
});
