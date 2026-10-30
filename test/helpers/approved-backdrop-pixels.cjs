'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {writePng,readPng}=require('../../packages/slideclone-core/png');
const {fingerprint}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {backdropImageFingerprint,backdropPageFingerprint}=require('../../packages/slideclone-core/scene-plan/approved-backdrop-pixel-input');
const {createApprovedBackdropPixelApplication}=require('../../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application');
const {finalizeWithApprovedFrames}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {withApprovedBackdropBudget,recordSharedResidualChecks}=require('../../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t){
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'approved-backdrop-test-'));fs.mkdirSync(path.join(root,'assets'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith('approved-backdrop-test-'));fs.rmSync(root,{recursive:true,force:true});});
 const sourceFile=path.join(root,'assets/source.png');writePng(sourceFile,{width:10,height:8,rgba:Buffer.alloc(320,255)});
 const pixels=[{cell:0,color:[10,20,30],kind:'source-interpolation'},{cell:11,color:[40,50,60],kind:'source-interpolation'},
  {cell:23,color:[70,80,90],kind:'neighbor-inference'}];
 const raster={width:10,height:8,rgba:Buffer.alloc(320,200)};for(let i=0;i<80;i++)raster.rgba[i*4+3]=255;
 for(const p of pixels)raster.rgba[p.cell*4+3]=0;writePng(path.join(root,'assets/full.png'),raster);
 const overlap={width:4,height:3,rgba:Buffer.alloc(48,150)};for(let i=0;i<12;i++)overlap.rgba[i*4+3]=255;
 for(const [x,y] of [[0,0],[2,1]])overlap.rgba[(y*4+x)*4+3]=0;writePng(path.join(root,'assets/overlap.png'),overlap);
 const page={source:{original:'keep'},shapes:[{id:'whole-route',type:'freeform',style:{fill:'none'},source:{sceneRelationId:'r1'}}],
  textBoxes:[{id:'text',text:'unchanged'}],images:[{id:'full',assetPath:'assets/full.png',box:{x:0,y:0,w:10,h:8},style:{assetPath:'assets/full.png'}},
   {id:'overlap',assetPath:'assets/overlap.png',box:{x:1,y:1,w:4,h:3}}]};
 const deck={slideSize:{widthPt:10,heightPt:8},pages:[page],meta:{sourceSceneCompilation:{passed:false,rejections:['strict-failure']}}};
 const source={width:10,height:8,sha256:hash(sourceFile)},review={approvalId:'user-exact-reviewed-pixels',source,pixels,scopeFingerprint:fingerprint({source,pixels}),
  pageFingerprint:backdropPageFingerprint(deck,page),assets:page.images.map(image=>({imageId:image.id,beforeSha256:hash(path.join(root,image.assetPath)),imageFingerprint:backdropImageFingerprint(image)}))};
 const context={deck,root,sourceFile,isCancellationRequested:async()=>false};
 const run=(finalize=()=>deck,checks=0)=>withApprovedBackdropBudget(()=>{
  recordSharedResidualChecks(checks);return finalizeWithApprovedFrames(createApprovedBackdropPixelApplication(review),context,finalize);
 });
 const rebind=()=>{review.scopeFingerprint=fingerprint({source:review.source,pixels:review.pixels});review.pageFingerprint=backdropPageFingerprint(deck,page);
  review.assets=page.images.map(image=>({imageId:image.id,beforeSha256:hash(path.join(root,image.assetPath)),imageFingerprint:backdropImageFingerprint(image)}));};
 return {root,sourceFile,deck,page,review,context,run,rebind,hash,readPng,
  directories:()=>fs.readdirSync(path.join(root,'assets')).filter(name=>name.startsWith('approved-frames-'))};
}
module.exports={fixture};
