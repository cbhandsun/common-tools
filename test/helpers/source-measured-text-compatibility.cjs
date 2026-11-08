'use strict';
const assert=require('node:assert/strict');
const {fixture:cardFixture}=require('./approved-card-backdrop.cjs');
const {readPng,writePng}=require('../../packages/slideclone-core/png');
const {fingerprint}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createSourceWordLayoutSession,registerSourceWordLayout,applySourceWordLayouts}=require('../../packages/slideclone-core/typography/source-word-layout-registry');
const {measureSourceWordLayout}=require('../../packages/slideclone-core/typography/source-word-layout-evidence');
const {projectSourceWordRuns}=require('../../packages/slideclone-core/typography/source-word-layout-projection');
const {createApprovedFrameAssetApplication:create}=require('../../packages/slideclone-core/scene-plan/approved-frame-application');
const {finalizeWithApprovedFrames:finalize}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
function fixture(t,{arithmeticOnly=false,mutateScale=false}={}){
 const f=cardFixture(t),image=readPng(f.context.sourceFile),line={text:'TEST',confidence:.99,box:{x:400,y:1080,w:146,h:24}};
 for(let y=1075;y<1110;y++)for(let x=395;x<555;x++){
  const bg=[235+x%7,237+y%3,240],inside=x>=420&&x<=520&&y>=1084&&y<=1095,edge=x===420||x===520||y===1084||y===1095;
  const alpha=inside?(edge?.7:1):0;
  image.rgba.set([...bg.map((v,c)=>Math.round(v*(1-alpha)+[30,35,40][c]*alpha)),255],(y*image.width+x)*4);
 }
 writePng(f.context.sourceFile,image);f.card.source.sha256=f.hashFile(f.context.sourceFile);f.review.source.sha256=f.card.source.sha256;
 for(const fit of f.review.fits)fit.source.sha256=f.card.source.sha256;
 const session=createSourceWordLayoutSession(f.context.sourceFile),sx=960/1086,sy=1280/1448;
 const box={x:line.box.x*sx,y:line.box.y*sy,w:line.box.w*sx,h:line.box.h*sy};
 const seed={...f.members[7],text:line.text,box,font:{family:'Microsoft YaHei',sizePt:16,color:'#1E2328',align:'left',opacity:1},
  style:{visibility:'visible',wrap:false,fit:'none',opacity:1,marginLeftPt:0,marginRightPt:0,marginTopPt:0,marginBottomPt:0},source:{...f.members[7].source,pageImage:'assets/source.png',evidenceBox:{...box},ocrEvidenceFit:{originalBox:{...box},originalSizePt:16,fittedSizePt:16}}};
 const budget={remaining:4000000},scale={x:sx,y:sy};registerSourceWordLayout(seed,line,session.image,budget,[line.box],false,session.token,scale);
 if(mutateScale){scale.x=1;scale.y=1;}
 const applied=applySourceWordLayouts({textBoxes:[structuredClone(seed)]},[seed]);assert.equal(applied.layouts,1);
 const current=applied.page.textBoxes[0],prior=structuredClone(current);
 const delta=Number.EPSILON*prior.source.evidenceBox.w*2;
 prior.source.evidenceBox.w+=delta;prior.source.ocrEvidenceFit.originalBox.w+=delta;prior.box.w+=delta;
 if(!arithmeticOnly){
  // A genuinely fractional seed independently observes the historical extra
  // column. Only its measured glyph geometry is reused; the historical native
  // frame retains its own bounded floating representation.
  const expanded={...line,box:{...line.box,w:line.box.w+1e-8}};
  const legacy=measureSourceWordLayout({image:session.image,line:expanded,color:current.font.color,maxScanPixels:4000000,neighborBoxes:[expanded.box]});
  assert.ok(legacy.typographicRuns);const old=prior.source.evidenceBox;
  const oldSeed={x:old.x*(1/sx),y:old.y*(1/sy),w:old.w*(1/sx),h:old.h*(1/sy)};
  prior.positionedRuns=projectSourceWordRuns(legacy.typographicRuns,oldSeed,prior.box);
  assert.notDeepEqual(prior.positionedRuns,current.positionedRuns);
 }
 f.page.textBoxes[f.page.textBoxes.findIndex(s=>s.id===seed.id)]=current;
 f.card.members.find(row=>row.id===current.id).fingerprint=fingerprint(prior);
 return {...f,current,prior,budget,session,line,seed,runText(finalizer){return finalize(create(f.review,{cardBackdrop:f.card,cardTextAncestors:[prior]}),f.context,finalizer??(()=>f.deck));}};
}
module.exports={fixture};
