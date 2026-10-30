'use strict';
const {fixture:frameFixture}=require('./approved-frame-application.cjs');
const {fingerprint}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {MEMBERS,GEOMETRY,IMPACT}=require('../../packages/slideclone-core/scene-plan/approved-card-backdrop-input');
const {createApprovedFrameAssetApplication}=require('../../packages/slideclone-core/scene-plan/approved-frame-reconstruction');
const {finalizeWithApprovedFrames}=require('../../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
function fixture(t){
 const f=frameFixture(t),sourceFile=f.context.sourceFile;f.png(sourceFile,1086,1448,255);f.review.source={width:1086,height:1448,sha256:f.hashFile(sourceFile)};
 for(const fit of f.review.fits)fit.source={...f.review.source};f.deck.slideSize={widthPt:960,heightPt:1280};f.deck.pages[0].background={fill:'#FBFAF8'};
 const page=f.deck.pages[0],sx=960/1086,sy=1280/1448;
 const members=MEMBERS.map((id,i)=>({id,...(i<4?{type:'freeform'}:i<7?{type:'fidelity-crop',assetPath:'assets/original.png'}:{text:'kept'}),
  box:{x:379*sx,y:1046*sy,w:(i===0?330:20)*sx,h:(i===0?319:15)*sy},style:{...(i>=7?{nativeComponentGroupId:'old-label-group'}:{})},
  source:{sceneRegionId:'region-n10',nativeComponentGroupId:i<4?'old-frame-group':i>=7?'old-label-group':undefined}}));
 page.shapes.push(...members.slice(0,4));page.images.push(...members.slice(4,7));page.textBoxes.push(...members.slice(7));
 const card={approvalId:'user-20261023-n10-card-backdrop-only',source:{...f.review.source},regionId:'region-n10',geometryBoundsPx:{...GEOMETRY},impactBoundsPx:{...IMPACT},color:'#FBFAF8',
  members:members.map(p=>({id:p.id,fingerprint:fingerprint(p)}))};
 return {...f,card,members,page,runCard(finalize){return finalizeWithApprovedFrames(createApprovedFrameAssetApplication(f.review,{cardBackdrop:card}),f.context,finalize??(()=>f.deck));}};
}
module.exports={fixture};
