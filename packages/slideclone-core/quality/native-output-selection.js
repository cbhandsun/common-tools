// @ts-check
'use strict';
const {record,list,snapshot}=require('../scene-plan/approved-frame-application-input');
const {unpackSceneInventoryMembers}=require('../scene-plan/source-scene-inventory-codec');
const {auditSceneInventory}=require('../scene-plan/source-scene-observed-inventory');
const {auditFinalRouteMaterialization}=require('../scene-plan/source-native-route-materialization');
const {auditSemanticEditability}=require('./semantic-editability-quality');
const {parseNativeOutputPolicy}=require('./native-output-policy');
const {auditApprovedFrameCompletion}=require('../scene-plan/approved-frame-completion');
/** A complete scene inventory is necessary before omitting any fidelity layer.
 * This reuses the actual inventory audit and its private approved/measured
 * replacement transactions; persisted counts alone grant no exception.
 * The caller must still seal and audit the selected output normally.
 * @param {Record<string,unknown>} deck @param {Record<string,unknown>} page */
function completeInventory(deck,page){
 if(page.source===undefined||record(page.source).sourceScene===undefined)throw new TypeError('semantic-native-output-incomplete');
 const scene=record(record(page.source).sourceScene);
 const frames=auditApprovedFrameCompletion(deck,page),approvedRegions=new Set(frames.regionIds);
 if(frames.status==='invalid')throw new TypeError('semantic-native-output-unverified');
 if(scene.observedInventory===undefined)throw new TypeError('semantic-native-output-incomplete');
 const inventory=record(unpackSceneInventoryMembers(scene.observedInventory));
 const strictUnresolved=list(scene.unresolved,112).map(record);
 if(scene.version!==1||strictUnresolved.some(row=>!approvedRegions.has(String(row.id)))||![2,3,4,5,6].includes(Number(inventory.version))
  ||typeof scene.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(scene.sourceHash)||inventory.sourceHash!==scene.sourceHash)
  throw new TypeError('semantic-native-output-incomplete');
 const compilation=record(record(deck.meta).sourceSceneCompilation),coverage=record(record(compilation.regionPrograms).coverage);
 const regions=record(coverage.regions),rows=list(coverage.rows,112).map(record),units=list(inventory.units,176).map(record);
 if(units.some(unit=>unit.kind==='relation')&&Number(inventory.version)<5)throw new TypeError('semantic-native-output-incomplete');
 const inventoryRegions=list(inventory.regions,112).map(record),regionIds=inventoryRegions.map(row=>row.regionId);
 if(coverage.sourceHash!==scene.sourceHash||!rows.length||rows.length!==inventoryRegions.length
  ||new Set(regionIds).size!==regionIds.length||rows.some(row=>row.complete!==true&&!approvedRegions.has(String(row.regionId))||!regionIds.includes(row.regionId))
  ||new Set(rows.map(row=>row.regionId)).size!==rows.length||regions.declared!==rows.length
  ||regions.completed!==rows.filter(row=>row.complete===true).length||Number(regions.completed)+approvedRegions.size!==rows.length
  ||regions.pending!==0||list(regions.missingPrograms,112).length)
  throw new TypeError('semantic-native-output-incomplete');
 const inspect=()=>auditSceneInventory(scene.observedInventory,page.shapes,page.images,scene.sourceHash,page.textBoxes);
 const final=auditFinalRouteMaterialization(deck,page,inspect);
 const findings=final.status==='verified'?final.result:inspect();
 if(final.status==='invalid'||findings.length)throw new TypeError('semantic-native-output-unverified');
 const imageMembers=new Set();
 for(const unit of units)for(const value of list(unit.members,10000)){
  const member=record(value);if(member.type==='image')imageMembers.add(member.id);
 }
 return {imageMembers,frames,strictUnresolved};
}
/** Select, without mutation, the semantic output's images. Only explicitly
 * erased reconstruction residuals outside every inventory/anchor/group survive
 * as omission candidates. Images of unknown identity and minimum units stay.
 * No pixel is changed, no source approval is issued and no strict result is
 * rewritten. Image selection must precede private final-output seals.
 * @param {unknown} deckInput @param {unknown} policyInput */
function selectNativeOutputImages(deckInput,policyInput){
 const policy=parseNativeOutputPolicy(policyInput);if(policy==='source-fidelity')return null;
 try{
  snapshot(deckInput);const deck=record(deckInput),pages=list(deck.pages,1),page=record(pages[0]);
  if(pages.length!==1)throw new TypeError('semantic-native-output-incomplete');
  const shapes=list(page.shapes,10000).map(record),texts=list(page.textBoxes,10000).map(record);
  const images=list(page.images,10000).map(record),inventory=completeInventory(deck,page),members=inventory.imageMembers,anchors=new Set();
  const sourceFidelitySemantic=auditSemanticEditability(deck);
  if(sourceFidelitySemantic.findings.some(finding=>record(finding).code!=='large-raster-lineage'))throw new TypeError('semantic-native-output-unverified');
  for(const item of [...shapes,...texts,...images]){
   const style=item.style===undefined?{}:record(item.style);
   for(const key of ['startAnchor','endAnchor'])if(style[key]!==undefined)anchors.add(record(style[key]).elementId);
  }
  /** @type {Record<string,unknown>[]} */const omitted=[];
  const selected=images.filter(image=>{
   if(image.source===undefined)return true;const source=record(image.source),style=image.style===undefined?{}:record(image.style);
   if(source.residualCrop!==true||source.editable!==false
    ||source.fullSlideResidual===true&&source.nativeObjectsErased!==true
    ||source.fullSlideResidual!==true&&source.primitiveErased!==true
    ||source.protectedMinimumUnit===true||source.cropEvidenceRequired===true||source.intentionalMinimumUnitCrop===true
    ||source.sceneInventoryId!==undefined||source.nativeComponentGroupId!==undefined||style.nativeComponentGroupId!==undefined
    ||members.has(image.id)||anchors.has(image.id))return true;
   omitted.push(image);return false;
  });
  const semanticEditability=auditSemanticEditability({...deck,pages:[{...page,images:selected}]});
  if(!semanticEditability.passed)throw new TypeError('semantic-native-output-unverified');
  return {page,images:selected,report:{policy,omittedResidualIds:omitted.map(image=>String(image.id)),
   protectedImagesRetained:selected.filter(image=>image.source!==undefined&&record(image.source).protectedMinimumUnit===true).length,
   sourceFidelitySemantic,semanticEditability,sourceAssetsPreserved:true,sourcePixelsChanged:0,
   approvedFrameCompletions:inventory.frames.approvals,strictSceneUnresolved:inventory.strictUnresolved,
   sourceOwnership:false,strictSourceEquivalent:false,appliedBeforeFinalSeal:true,editingBehaviorVerified:false,wholeProductAcceptance:false}};
 }catch(error){
  if(error instanceof TypeError&&/^semantic-native-output-/u.test(error.message))throw error;
  throw new TypeError('semantic-native-output-invalid',{cause:error});
 }
}
module.exports={parseNativeOutputPolicy,selectNativeOutputImages};
