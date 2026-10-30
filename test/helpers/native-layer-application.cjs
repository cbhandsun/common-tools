'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {writePng}=require('../../packages/slideclone-core/png');
const {digest}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-files');
const {fingerprint}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-input');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-layer-application-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('native-layer-application-'));fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'assets'));
 const png=(file,w=10,h=8,color=255)=>writePng(file,{width:w,height:h,rgba:Buffer.alloc(w*h*4,color)});
 const sourceFile=path.join(root,'assets/source.png'),underlay=path.join(root,'assets/underlay.png'),icon=path.join(root,'assets/icon.png');
 png(sourceFile);png(underlay,10,8,80);png(icon,2,2,120);
 const sourceHash=digest(fs.readFileSync(sourceFile));
 const page={shapes:[{id:'card',type:'rect',box:{x:10,y:10,w:40,h:30},style:{fill:'#EEEEEE',stroke:'none'},source:{sceneInventoryId:'card'}},
  {id:'route',type:'freeform',box:{x:50,y:20,w:30,h:20},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,freeformPath:'[[0,0,0],[1,1,1]]'},source:{sceneRelationId:'relation',connector:true}}],
  images:[{id:'underlay',assetPath:'assets/underlay.png',style:{assetPath:'assets/underlay.png'},box:{x:0,y:0,w:100,h:80},source:{fullSlideResidual:true}},
   {id:'icon',assetPath:'assets/icon.png',source:{protectedMinimumUnit:true}}],
  textBoxes:[{id:'label',text:'Label',box:{x:15,y:15,w:30,h:10},style:{fontSizePt:12}}],source:{sourceScene:{sourceHash}}};
 const deck={slideSize:{widthPt:100,heightPt:80},pages:[page],meta:{sourceSceneCompilation:{regionPrograms:{completed:12},resolvedRelations:11},retained:true}};
 const context={deck,root,sourceFile,isCancellationRequested:async()=>false};
 function bundle(api){
  const binding=api.captureNativeLayerBinding(context);
  const review={version:1,reviewId:'fixture-review',sourceHash,pageFingerprint:binding.pageFingerprint,
   addedShapes:[{id:'new-background',type:'rect',box:{x:0,y:0,w:100,h:80},style:{fill:'#FAFAFA',stroke:'none'}}],
   shapeOrder:['new-background','card','route'],shapeChanges:[{id:'card',beforeFingerprint:fingerprint(page.shapes[0]),style:{...page.shapes[0].style,fill:'#DDDDDD'}}],
   removedImageIds:['underlay'],textChanges:[{id:'label',beforeFingerprint:fingerprint(page.textBoxes[0]),style:{fontSizePt:12,textOutlineColor:'#000000',textOutlineWidthPt:.2}}]};
  return {version:1,approvalId:'synthetic-approved-layer',binding,review};
 }
 return {root,context,deck,page,sourceFile,underlay,icon,png,bundle};
}
module.exports={fixture};
