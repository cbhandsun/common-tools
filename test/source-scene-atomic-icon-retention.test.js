'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/source-scene-group-retention');
const {ungroupSourceNativeOverlays}=require('../packages/slideclone-core/source-native-finalization');

test('a later measured panel preserves every source-compiled icon member, including its rectangular backdrop',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-atomic-icon-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:200,height:140,rgba:Buffer.alloc(200*140*4,255)};
 for(let y=10;y<110;y++)for(let x=10;x<180;x++)image.rgba.set([230,245,250,255],(y*200+x)*4);
 for(let y=23;y<35;y++)for(let x=23;x<26;x++)image.rgba.set([0,0,0,255],(y*200+x)*4);
 for(let y=39;y<62;y++)for(let x=22;x<40;x++)image.rgba.set([0,0,0,255],(y*200+x)*4);
 for(let y=58;y<62;y++)for(let x=40;x<52;x++)image.rgba.set([0,0,0,255],(y*200+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan={version:1,sourceHash,widthPx:200,heightPx:140,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:140}},
   {id:'band',parentId:'root',kind:'container',box:{x:10,y:10,w:170,h:100}}],
  objects:[{id:'picture',regionId:'band',kind:'icon',box:{x:21,y:38,w:32,h:25},nativePictorial:true}],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'band',containers:0,icons:1,relations:0}],
  regionPrograms:[{regionId:'root',objects:[],relations:[],labels:[]},{regionId:'band',objects:['picture'],relations:[],labels:[]}]};
 const box={x:20,y:20,w:12,h:20},text={id:'caption',text:'I',box,font:{color:'#000000'},source:{evidenceBox:box}};
 const result=compileSourceScene({plan,page:{shapes:[],images:[],textBoxes:[text]},sourceFile,root,slideSize:{widthPt:200,heightPt:140}});
 const parts=result.page.shapes.filter(s=>s.source?.sceneInventoryId==='picture');
 assert(parts.some(s=>s.id==='scene-icon-backdrop-picture'),JSON.stringify({parts:parts.map(s=>s.id),unresolved:result.evidence.unresolved}));
 assert(parts.some(s=>s.type==='freeform'),'actual editable pictorial parts must survive with the backdrop');
 assert.equal(new Set(result.page.shapes.map(s=>s.id)).size,result.page.shapes.length);
 assert.equal(result.evidence.regionPrograms.completed,2,JSON.stringify(result.evidence.regionPrograms));
 assert.equal(result.evidence.regionPrograms.rejected.length,0);
 assert(result.evidence.sourceScanPixels<=4000000);
 const retained=retainedSceneGroupMembers(result.page,result.groupReceipt);
 assert(parts.every(p=>retained.has(p)),'every measured member must survive the private final group gate');
 assert.equal(retainedSceneGroupMembers(result.page,structuredClone(result.groupReceipt)).size,0);
 const partial={...result.page,shapes:result.page.shapes.filter(s=>s!==parts[0])};
 assert(parts.slice(1).every(p=>!retainedSceneGroupMembers(partial,result.groupReceipt).has(p)));
 const foreign={...parts[0],id:'foreign-member'};
 assert(parts.every(p=>!retainedSceneGroupMembers({...result.page,shapes:[...result.page.shapes,foreign]},result.groupReceipt).has(p)));
 assert.equal(retainedSceneGroupMembers(structuredClone(result.page),result.groupReceipt).size,0);
 const paint=parts[0].style.fill;parts[0].style.fill='#FF0000';
 assert(parts.every(p=>!retainedSceneGroupMembers(result.page,result.groupReceipt).has(p)));
 parts[0].style.fill=paint;
 ungroupSourceNativeOverlays(result.page,result.groupReceipt);
 assert(parts.every(p=>p.source.nativeComponentGroupId==='scene-icon-picture'));
});
